import { Device } from './Device';
import type { StatusBarOptions } from './Device';
import { HermesSession } from './HermesSession';
import { Element, type NodeDescriptor } from './Element';
import { TraceCollector, type TraceStep } from './TraceCollector';
import { setExpectTracer } from './expect';
import { BRIDGE_INJECTOR_SCRIPT } from '../bridge/injector';
import { NETWORK_MOCK_SCRIPT } from '../bridge/network-mock';
import { CLOCK_SCRIPT } from '../bridge/clock';
import { STORAGE_BRIDGE_SCRIPT } from '../bridge/storage';
import type { E2EConfig } from '../config';
import {
  type Selector,
  selectorToExpression,
  selectorToAllExpression,
} from './selectors';

export type { Selector };
export type { StatusBarOptions };
export type { TraceStep };

function selectorStep(sel: Selector): string {
  if ('testID' in sel) return sel.testID;
  if ('text' in sel) return typeof sel.text === 'string' ? `"${sel.text}"` : sel.text.toString();
  if ('component' in sel) return sel.component;
  if ('accessibilityLabel' in sel) return `a11y:"${sel.accessibilityLabel}"`;
  if ('accessibilityRole' in sel) return `role:${sel.accessibilityRole}`;
  if ('placeholder' in sel) return `placeholder:"${sel.placeholder}"`;
  return JSON.stringify(sel);
}

function matcherLabel(matcher: string | RegExp | NetworkMatcher): string {
  if (typeof matcher === 'string') return matcher;
  if (matcher instanceof RegExp) return matcher.toString();
  const url = matcher.url instanceof RegExp ? matcher.url.toString() : matcher.url;
  return matcher.method ? `${matcher.method} ${url}` : url;
}

export type NetworkMatcher = {
  url: string | RegExp;
  method?: string;
};

export type NetworkResponse = {
  status?: number;
  headers?: Record<string, string>;
  body?: unknown;
  delay?: number;
};

export type NetworkRequest = {
  url: string;
  method: string;
  body: unknown;
  status: number | null;
  responseBody: unknown;
  settled: boolean;
};

type SerializedMatcher = {
  urlType: 'exact' | 'regex';
  url?: string;
  pattern?: string;
  flags?: string;
  method?: string;
};

type SerializedMock = {
  matcher: SerializedMatcher;
  response: NetworkResponse;
};

export class AppSession {
  private device: Device;
  private hermes: HermesSession;
  private suiteMocks: SerializedMock[] = [];
  private inSuiteScope = false;
  private resultsDir: string;
  private _currentRecordingPath: string | null = null;
  private _slowModeDelay = 0;
  private _tracer: TraceCollector | null = null;

  constructor(private config: E2EConfig) {
    this.device = new Device(config);
    this.hermes = new HermesSession(config);
    this.resultsDir = config.testResultsDir;
  }

  setResultsDir(dir: string): void {
    this.resultsDir = dir;
  }

  async start(): Promise<void> {
    await this.detectMetroPort();
    await this.device.init();
    await this.device.launch();
    await this.injectBridge();
  }

  private async detectMetroPort(): Promise<void> {
    const configured = this.config.metroPort;
    if (await probeMetroPort(configured)) return;

    const candidates = [8081, 8082, 8083, 8080, 19000, 19001, 19002].filter(p => p !== configured);
    const results = await Promise.all(candidates.map(async p => ({ port: p, ok: await probeMetroPort(p) })));
    const found = results.find(r => r.ok);
    if (found) {
      console.log(`  Metro detected on port ${found.port} (METRO_PORT was ${configured})`);
      this.config.metroPort = found.port;
    }
  }

  async reset(): Promise<void> {
    await this.hermes.disconnect();
    await this.device.terminate();
    await this.device.launch();
    await this.injectBridge();
  }

  async stop(): Promise<void> {
    await this.hermes.disconnect();
    await this.device.terminate();
  }

  private async injectBridge(): Promise<void> {
    const EXPO_SHELL_IDS = ['host.exp.exponent', 'io.expo.devclient'];
    const deadline = Date.now() + 60_000;

    while (Date.now() < deadline) {
      let targets: Array<{ title?: string; webSocketDebuggerUrl: string }> = [];
      try {
        const res = await fetch(`http://localhost:${this.config.metroPort}/json`);
        if (res.ok) {
          const pages = (await res.json()) as Array<{ title?: string; webSocketDebuggerUrl?: string }>;
          const all = pages.filter(
            (p): p is { title?: string; webSocketDebuggerUrl: string } => Boolean(p.webSocketDebuggerUrl),
          );
          const bundleId = this.config.bundleId.toLowerCase();
          const isShell = (t: { title?: string }) =>
            EXPO_SHELL_IDS.some(id => t.title?.toLowerCase().includes(id));
          targets = [
            ...all.filter(t => t.title?.toLowerCase().includes(bundleId)),
            ...all.filter(t => !t.title?.toLowerCase().includes(bundleId) && !isShell(t)),
            ...all.filter(isShell),
          ];
        }
      } catch {
        // Metro not up yet
      }

      for (const target of targets) {
        try {
          await this.hermes.disconnect();
          await this.hermes.connect(target.webSocketDebuggerUrl);

          const perTargetDeadline = Date.now() + 5_000;
          let ok = false;
          while (Date.now() < perTargetDeadline) {
            ok = await this.hermes.evaluate<boolean>(BRIDGE_INJECTOR_SCRIPT);
            if (ok) break;
            await sleep(250);
          }

          if (ok) {
            await this.hermes.evaluate(NETWORK_MOCK_SCRIPT);
            await this.hermes.evaluate(STORAGE_BRIDGE_SCRIPT);
            await this.hermes.evaluate(CLOCK_SCRIPT);
            return;
          }

          await this.hermes.disconnect();
        } catch {
          try { await this.hermes.disconnect(); } catch {}
        }
      }

      await sleep(500);
    }

    throw new Error(
      `Bridge injection failed — no CDP target at http://localhost:${this.config.metroPort}/json ` +
        'had __REACT_DEVTOOLS_GLOBAL_HOOK__. Ensure the app is running with Hermes.',
    );
  }

  // ── Tracing ───────────────────────────────────────────────────────────────────

  enableTracing(): void {
    this._tracer = new TraceCollector(this.screenshot.bind(this));
    setExpectTracer(this._tracer);
  }

  disableTracing(): void {
    this._tracer = null;
    setExpectTracer(null);
  }

  getTrace(): TraceStep[] {
    return this._tracer?.steps() ?? [];
  }

  // ── Network mocking ──────────────────────────────────────────────────────────

  async mockNetwork(matcher: NetworkMatcher, response: NetworkResponse): Promise<void> {
    const start = Date.now();
    const serialized = serializeMatcher(matcher);
    const mock: SerializedMock = { matcher: serialized, response };

    if (this.inSuiteScope) {
      const key = matcherKey(serialized);
      const idx = this.suiteMocks.findIndex(m => matcherKey(m.matcher) === key);
      if (idx >= 0) this.suiteMocks[idx] = mock;
      else this.suiteMocks.push(mock);
    }

    await this.hermes.evaluate(
      `__testNetworkMocks__.mocks.push(${JSON.stringify(mock)})`,
    );
    this._tracer?.add({ action: 'mockNetwork', target: matcherLabel(matcher), durationMs: Date.now() - start, timestampMs: start });
  }

  async networkRequests(): Promise<NetworkRequest[]> {
    return this.hermes.evaluate<NetworkRequest[]>(`__testNetworkMocks__.requests`);
  }

  async clearNetworkMocks(): Promise<void> {
    const start = Date.now();
    this.suiteMocks = [];
    await this.hermes.evaluate(
      `__testNetworkMocks__.mocks = []; __testNetworkMocks__.requests = [];`,
    );
    this._tracer?.add({ action: 'clearNetworkMocks', durationMs: Date.now() - start, timestampMs: start });
  }

  async setNetworkOffline(offline: boolean): Promise<void> {
    const start = Date.now();
    await this.hermes.evaluate(`globalThis.__testNetworkOffline__ = ${offline}`);
    this._tracer?.add({ action: 'setNetworkOffline', value: String(offline), durationMs: Date.now() - start, timestampMs: start });
  }

  private matchesNetworkMatcher(
    req: NetworkRequest,
    matcher: string | RegExp | NetworkMatcher,
  ): boolean {
    const url = typeof matcher === 'string' || matcher instanceof RegExp ? matcher : matcher.url;
    const method =
      typeof matcher === 'object' && !(matcher instanceof RegExp)
        ? matcher.method?.toUpperCase()
        : undefined;
    const urlMatch = url instanceof RegExp ? url.test(req.url) : req.url === url;
    const methodMatch = !method || req.method === method;
    return urlMatch && methodMatch;
  }

  async waitForRequest(
    matcher: string | RegExp | NetworkMatcher,
    opts?: { timeout?: number },
  ): Promise<NetworkRequest> {
    const start = Date.now();
    const timeout = opts?.timeout ?? this.config.defaultTimeout;
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const reqs = await this.networkRequests();
      const match = reqs.find(r => this.matchesNetworkMatcher(r, matcher));
      if (match) {
        this._tracer?.add({ action: 'waitForRequest', target: matcherLabel(matcher), durationMs: Date.now() - start, timestampMs: start });
        return match;
      }
      await new Promise(r => setTimeout(r, 250));
    }
    throw new Error(`waitForRequest: no matching request within ${timeout}ms`);
  }

  async waitForResponse(
    matcher: string | RegExp | NetworkMatcher,
    opts?: { timeout?: number },
  ): Promise<NetworkRequest> {
    const start = Date.now();
    const timeout = opts?.timeout ?? this.config.defaultTimeout;
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const reqs = await this.networkRequests();
      const match = reqs.find(r => this.matchesNetworkMatcher(r, matcher) && r.settled);
      if (match) {
        this._tracer?.add({ action: 'waitForResponse', target: matcherLabel(matcher), durationMs: Date.now() - start, timestampMs: start });
        return match;
      }
      await new Promise(r => setTimeout(r, 250));
    }
    throw new Error(`waitForResponse: no matching response within ${timeout}ms`);
  }

  // Called by TestRunner around beforeAll hooks
  enterSuiteScope(): void { this.inSuiteScope = true; }
  exitSuiteScope(): void  { this.inSuiteScope = false; }

  // Called by TestRunner after reset() to restore suite-level mocks
  async reapplySuiteMocks(): Promise<void> {
    for (const mock of this.suiteMocks) {
      await this.hermes.evaluate(
        `__testNetworkMocks__.mocks.push(${JSON.stringify(mock)})`,
      );
    }
  }

  // Called by TestRunner after afterAll hooks
  clearSuiteMocks(): void { this.suiteMocks = []; }

  private log(msg: string): void {
    if (this.config.verbose) console.log(`        ${msg}`);
  }

  // ── Queries ──────────────────────────────────────────────────────────────────

  async find(selector: Selector): Promise<Element> {
    const start = Date.now();
    const expr = selectorToExpression(selector);
    const descriptor = await this.hermes.evaluate<NodeDescriptor | null>(expr);
    if (!descriptor) {
      throw new Error(`find() — element not found: ${JSON.stringify(selector)}`);
    }
    this.log(`find: ${selectorStep(selector)}`);
    this._tracer?.add({ action: 'find', target: selectorStep(selector), durationMs: Date.now() - start, timestampMs: start });
    return new Element(descriptor, this.hermes, this.config.verbose, this._slowModeDelay, this._tracer);
  }

  async findAll(selector: Selector): Promise<Element[]> {
    const start = Date.now();
    const expr = selectorToAllExpression(selector);
    const descriptors = await this.hermes.evaluate<NodeDescriptor[]>(expr);
    this.log(`findAll: ${selectorStep(selector)} (${descriptors.length} found)`);
    this._tracer?.add({ action: 'findAll', target: selectorStep(selector), value: `${descriptors.length} found`, durationMs: Date.now() - start, timestampMs: start });
    return descriptors.map(d => new Element(d, this.hermes, this.config.verbose, this._slowModeDelay, this._tracer));
  }

  async waitForElement(
    selectorOrTestID: Selector | string,
    opts?: { timeout?: number; interval?: number },
  ): Promise<Element> {
    const start = Date.now();
    const selector: Selector = typeof selectorOrTestID === 'string'
      ? { testID: selectorOrTestID }
      : selectorOrTestID;
    const timeout = opts?.timeout ?? this.config.defaultTimeout;
    const interval = opts?.interval ?? this.config.pollInterval;
    const deadline = Date.now() + timeout;
    const expr = selectorToExpression(selector);

    while (Date.now() < deadline) {
      const descriptor = await this.hermes.evaluate<NodeDescriptor | null>(expr);
      if (descriptor) {
        this.log(`waitFor: ${selectorStep(selector)}`);
        this._tracer?.add({ action: 'waitForElement', target: selectorStep(selector), durationMs: Date.now() - start, timestampMs: start });
        return new Element(descriptor, this.hermes, this.config.verbose, this._slowModeDelay, this._tracer);
      }
      await sleep(interval);
    }
    throw new Error(
      `waitForElement(${JSON.stringify(selectorOrTestID)}) timed out after ${timeout}ms`,
    );
  }

  async findNth(selector: Selector, n: number): Promise<Element> {
    const start = Date.now();
    const expr = selectorToAllExpression(selector);
    const descriptors = await this.hermes.evaluate<NodeDescriptor[]>(expr);
    if (n < 0 || n >= descriptors.length) {
      throw new Error(`findNth() — index ${n} out of range (found ${descriptors.length})`);
    }
    this._tracer?.add({ action: 'findNth', target: selectorStep(selector), value: `[${n}] of ${descriptors.length}`, durationMs: Date.now() - start, timestampMs: start });
    return new Element(descriptors[n], this.hermes, this.config.verbose, this._slowModeDelay, this._tracer);
  }

  async getTree(maxDepth = 30): Promise<unknown> {
    return this.hermes.evaluate(`__testBridge__.getTree(${maxDepth})`);
  }

  async printTree(maxDepth = 30): Promise<void> {
    type TreeNode = { type: string | null; testID: string | null; children: TreeNode[] };
    const roots = await this.getTree(maxDepth) as TreeNode[];
    function print(nodes: TreeNode[], depth: number): void {
      for (const node of nodes) {
        const label = [node.type ?? '(null)', node.testID ? `[${node.testID}]` : ''].join(' ').trimEnd();
        console.log('  '.repeat(depth) + label);
        print(node.children, depth + 1);
      }
    }
    print(roots, 0);
  }

  async step(name: string, fn: () => Promise<void>): Promise<void> {
    const start = Date.now();
    if (this.config.verbose) console.log(`      ⋯ ${name}`);
    // Reserve the header slot first so children appear after it in the trace array.
    const idx = this._tracer?.reserve({ action: 'step', target: name, timestampMs: start }) ?? -1;
    this._tracer?.enterStep();
    let stepError: string | undefined;
    try {
      await fn();
    } catch (err) {
      stepError = err instanceof Error ? err.message : String(err);
      throw new Error(`[${name}] ${stepError}`);
    } finally {
      this._tracer?.exitStep();
      this._tracer?.update(idx, { value: stepError, durationMs: Date.now() - start, failed: !!stepError });
    }
  }

  get clock() {
    return {
      install: (baseTime?: number): Promise<void> =>
        this.hermes.evaluate(`__testClock__.install(${baseTime ?? 'undefined'})`).then(() => {}),
      tick: (ms: number): Promise<void> =>
        this.hermes.evaluate(`__testClock__.tick(${ms})`).then(() => {}),
      restore: (): Promise<void> =>
        this.hermes.evaluate('__testClock__.restore()').then(() => {}),
      now: (): Promise<number> =>
        this.hermes.evaluate<number>('__testClock__.now()'),
    };
  }

  async waitFor(
    fn: () => Promise<boolean>,
    opts?: { timeout?: number; interval?: number },
  ): Promise<void> {
    const start = Date.now();
    const timeout = opts?.timeout ?? this.config.defaultTimeout;
    const interval = opts?.interval ?? this.config.pollInterval;
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      if (await fn()) {
        this._tracer?.add({ action: 'waitFor', durationMs: Date.now() - start, timestampMs: start });
        return;
      }
      await sleep(interval);
    }
    throw new Error(`waitFor() condition timed out after ${timeout}ms`);
  }

  async scrollAndFind(testID: string, opts?: { timeout?: number }): Promise<Element> {
    const start = Date.now();
    const timeout = opts?.timeout ?? this.config.defaultTimeout;
    const deadline = Date.now() + timeout;
    const expr = selectorToExpression({ testID });

    const tryFind = async (): Promise<Element | null> => {
      const descriptor = await this.hermes.evaluate<NodeDescriptor | null>(expr);
      return descriptor ? new Element(descriptor, this.hermes, this.config.verbose, this._slowModeDelay, this._tracer) : null;
    };

    const initial = await tryFind();
    if (initial) {
      this.log(`scrollAndFind: ${testID}`);
      this._tracer?.add({ action: 'scrollAndFind', target: testID, durationMs: Date.now() - start, timestampMs: start });
      return initial;
    }

    const SCROLL_STEP = 5_000;
    let scrollOffset = SCROLL_STEP;

    while (Date.now() < deadline) {
      await this.hermes.evaluate<boolean>(`__testBridge__.scrollToOffset(${scrollOffset})`);

      const pollDeadline = Math.min(Date.now() + 1_500, deadline);
      while (Date.now() < pollDeadline) {
        const el = await tryFind();
        if (el) {
          this.log(`scrollAndFind: ${testID}`);
          this._tracer?.add({ action: 'scrollAndFind', target: testID, durationMs: Date.now() - start, timestampMs: start });
          return el;
        }
        await sleep(this.config.pollInterval);
      }

      scrollOffset += SCROLL_STEP;
    }
    throw new Error(`scrollAndFind("${testID}") timed out after ${timeout}ms`);
  }

  async waitForElementToDisappear(
    selectorOrTestID: Selector | string,
    opts?: { timeout?: number; interval?: number },
  ): Promise<void> {
    const start = Date.now();
    const selector: Selector = typeof selectorOrTestID === 'string'
      ? { testID: selectorOrTestID }
      : selectorOrTestID;
    const timeout = opts?.timeout ?? this.config.defaultTimeout;
    const interval = opts?.interval ?? this.config.pollInterval;
    const deadline = Date.now() + timeout;
    const expr = 'testID' in selector
      ? null
      : selectorToExpression(selector);

    while (Date.now() < deadline) {
      if ('testID' in selector) {
        const gone = await this.hermes.evaluate<boolean>(
          `!__testBridge__.exists(${JSON.stringify(selector.testID)})`,
        );
        if (gone) {
          this.log(`waitForGone: ${selectorStep(selector)}`);
          this._tracer?.add({ action: 'waitForGone', target: selectorStep(selector), durationMs: Date.now() - start, timestampMs: start });
          return;
        }
      } else {
        const descriptor = await this.hermes.evaluate<NodeDescriptor | null>(expr!);
        if (!descriptor) {
          this.log(`waitForGone: ${selectorStep(selector)}`);
          this._tracer?.add({ action: 'waitForGone', target: selectorStep(selector), durationMs: Date.now() - start, timestampMs: start });
          return;
        }
      }
      await sleep(interval);
    }
    throw new Error(
      `waitForElementToDisappear(${JSON.stringify(selectorOrTestID)}) timed out after ${timeout}ms`,
    );
  }

  async dismissKeyboard(): Promise<void> {
    const start = Date.now();
    await this.hermes.evaluate<boolean>('__testBridge__.dismissKeyboard()');
    this._tracer?.add({ action: 'dismissKeyboard', durationMs: Date.now() - start, timestampMs: start });
  }

  async pressBack(): Promise<void> {
    const start = Date.now();
    await this.device.pressBack();
    this._tracer?.add({ action: 'pressBack', durationMs: Date.now() - start, timestampMs: start });
  }

  async openURL(url: string): Promise<void> {
    const start = Date.now();
    await this.device.openURL(url);
    this._tracer?.add({ action: 'openURL', target: url, durationMs: Date.now() - start, timestampMs: start });
  }

  async setLocation(lat: number, lng: number): Promise<void> {
    const start = Date.now();
    await this.device.setLocation(lat, lng);
    this._tracer?.add({ action: 'setLocation', value: `${lat}, ${lng}`, durationMs: Date.now() - start, timestampMs: start });
  }

  async setPermission(
    service: string,
    status: 'grant' | 'revoke' | 'reset',
  ): Promise<void> {
    const start = Date.now();
    await this.device.setPermission(service, status);
    this._tracer?.add({ action: 'setPermission', target: service, value: status, durationMs: Date.now() - start, timestampMs: start });
  }

  async screenshot(name: string): Promise<string> {
    const { mkdirSync } = await import('fs');
    mkdirSync(this.resultsDir, { recursive: true });
    const filePath = `${this.resultsDir}/${name}-${Date.now()}.png`;
    await this.device.screenshot(filePath);
    return filePath;
  }

  // ── Slow mode (used by slow-replay) ──────────────────────────────────────────

  enableSlowMode(delay: number): void {
    this._slowModeDelay = delay;
  }

  disableSlowMode(): void {
    this._slowModeDelay = 0;
  }

  // ── Screen recording ──────────────────────────────────────────────────────────

  async startRecording(name = 'recording'): Promise<void> {
    const { mkdirSync } = await import('fs');
    mkdirSync(this.resultsDir, { recursive: true });
    const filePath = `${this.resultsDir}/${name}-${Date.now()}.mp4`;
    this._currentRecordingPath = filePath;
    await this.device.startRecording(filePath);
  }

  async stopRecording(): Promise<string> {
    if (!this._currentRecordingPath) throw new Error('No recording in progress');
    await this.device.stopRecording();
    const path = this._currentRecordingPath;
    this._currentRecordingPath = null;
    return path;
  }

  // ── Push notifications ────────────────────────────────────────────────────────

  async pushNotification(payload: object): Promise<void> {
    const start = Date.now();
    await this.device.pushNotification(this.config.bundleId, payload);
    this._tracer?.add({ action: 'pushNotification', durationMs: Date.now() - start, timestampMs: start });
  }

  // ── Status bar ────────────────────────────────────────────────────────────────

  async setStatusBar(opts: StatusBarOptions): Promise<void> {
    const start = Date.now();
    await this.device.setStatusBar(opts);
    this._tracer?.add({ action: 'setStatusBar', value: JSON.stringify(opts), durationMs: Date.now() - start, timestampMs: start });
  }

  async resetStatusBar(): Promise<void> {
    const start = Date.now();
    await this.device.resetStatusBar();
    this._tracer?.add({ action: 'resetStatusBar', durationMs: Date.now() - start, timestampMs: start });
  }

  // ── Clipboard ─────────────────────────────────────────────────────────────────

  async setClipboard(text: string): Promise<void> {
    const start = Date.now();
    await this.device.setClipboard(text);
    this._tracer?.add({ action: 'setClipboard', value: text, durationMs: Date.now() - start, timestampMs: start });
  }

  async getClipboard(): Promise<string> {
    const start = Date.now();
    const result = await this.device.getClipboard();
    this._tracer?.add({ action: 'getClipboard', durationMs: Date.now() - start, timestampMs: start });
    return result;
  }

  // ── Device rotation ───────────────────────────────────────────────────────

  async setOrientation(orientation: 'portrait' | 'landscape'): Promise<void> {
    const start = Date.now();
    let currentlyPortrait = true;
    if (this.config.platform === 'ios') {
      try {
        const dims = await this.hermes.evaluate<{ width: number; height: number }>(
          `(function(){var D=require('react-native').Dimensions.get('window');return{width:D.width,height:D.height};})()`
        );
        currentlyPortrait = dims.height >= dims.width;
      } catch { /* assume portrait if bridge query fails */ }
    }
    await this.device.setOrientation(orientation, currentlyPortrait);
    if (this.config.platform === 'ios') await sleep(400);
    this._tracer?.add({ action: 'setOrientation', value: orientation, durationMs: Date.now() - start, timestampMs: start });
  }

  // ── Biometric simulation (iOS only) ──────────────────────────────────────

  async setBiometricEnrollment(enrolled: boolean): Promise<void> {
    const start = Date.now();
    await this.device.setBiometricEnrollment(enrolled);
    this._tracer?.add({ action: 'setBiometricEnrollment', value: String(enrolled), durationMs: Date.now() - start, timestampMs: start });
  }

  async matchBiometric(): Promise<void> {
    const start = Date.now();
    await this.device.matchBiometric();
    this._tracer?.add({ action: 'matchBiometric', durationMs: Date.now() - start, timestampMs: start });
  }

  async rejectBiometric(): Promise<void> {
    const start = Date.now();
    await this.device.rejectBiometric();
    this._tracer?.add({ action: 'rejectBiometric', durationMs: Date.now() - start, timestampMs: start });
  }

  // ── Crash detection ───────────────────────────────────────────────────────

  async isAppRunning(): Promise<boolean> {
    return this.device.isAppRunning();
  }

  // ── Animation control ─────────────────────────────────────────────────────────

  async disableAnimations(): Promise<void> {
    const start = Date.now();
    await this.hermes.evaluate(`(function() {
      try {
        var RN = require('react-native');
        var A = RN.Animated;
        var wrap = function(orig) {
          return function(value, config) {
            return orig(value, Object.assign({}, config, { duration: 0, delay: 0 }));
          };
        };
        A.timing = wrap(A.timing);
        A.spring = wrap(A.spring);
        A.decay  = wrap(A.decay);
        if (RN.LayoutAnimation && RN.LayoutAnimation.configureNext) {
          RN.LayoutAnimation.configureNext = function() {};
        }
      } catch(e) {}
    })()`);
    this._tracer?.add({ action: 'disableAnimations', durationMs: Date.now() - start, timestampMs: start });
  }

  // ── AsyncStorage ──────────────────────────────────────────────────────────────

  async setStorage(key: string, value: string): Promise<void> {
    const start = Date.now();
    await this.requireStorage();
    await this.awaitStorageOp<void>(
      `__testStorage__.setItem(${JSON.stringify(key)}, ${JSON.stringify(value)})`,
    );
    this._tracer?.add({ action: 'setStorage', target: key, value, durationMs: Date.now() - start, timestampMs: start });
  }

  async getStorage(key: string): Promise<string | null> {
    const start = Date.now();
    await this.requireStorage();
    const result = await this.awaitStorageOp<string | null>(
      `__testStorage__.getItem(${JSON.stringify(key)})`,
    );
    this._tracer?.add({ action: 'getStorage', target: key, durationMs: Date.now() - start, timestampMs: start });
    return result;
  }

  async removeStorage(key: string): Promise<void> {
    const start = Date.now();
    await this.requireStorage();
    await this.awaitStorageOp<void>(
      `__testStorage__.removeItem(${JSON.stringify(key)})`,
    );
    this._tracer?.add({ action: 'removeStorage', target: key, durationMs: Date.now() - start, timestampMs: start });
  }

  async clearStorage(): Promise<void> {
    const start = Date.now();
    await this.requireStorage();
    await this.awaitStorageOp<void>('__testStorage__.clear()');
    this._tracer?.add({ action: 'clearStorage', durationMs: Date.now() - start, timestampMs: start });
  }

  private async awaitStorageOp<T>(op: string): Promise<T> {
    const slot = `__sop_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    await this.hermes.evaluate(`
      (function() {
        globalThis[${JSON.stringify(slot)}] = null;
        var p = ${op};
        var then = p && typeof p.then === 'function' ? p : Promise.resolve(p);
        then.then(
          function(v) { globalThis[${JSON.stringify(slot)}] = { ok: 1, v: v }; },
          function(e) { globalThis[${JSON.stringify(slot)}] = { ok: 0, e: String(e) }; }
        );
      })()
    `);
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const r = await this.hermes.evaluate<{ ok: number; v?: T; e?: string } | null>(
        `globalThis[${JSON.stringify(slot)}] || null`,
      );
      if (r !== null) {
        await this.hermes.evaluate(`delete globalThis[${JSON.stringify(slot)}]`);
        if (!r.ok) throw new Error(r.e ?? 'storage error');
        return r.v as T;
      }
      await new Promise(res => setTimeout(res, 50));
    }
    throw new Error('Storage operation timed out');
  }

  private async requireStorage(): Promise<void> {
    const available = await this.hermes.evaluate<boolean>(
      `globalThis.__testStorage__ !== null && globalThis.__testStorage__ !== undefined`,
    );
    if (!available) {
      throw new Error(
        'AsyncStorage bridge not available — is @react-native-async-storage/async-storage installed and bundled?',
      );
    }
  }
}

// ── Network mock helpers ──────────────────────────────────────────────────────

function serializeMatcher(matcher: NetworkMatcher): SerializedMatcher {
  const result: SerializedMatcher = { urlType: 'exact' };
  if (matcher.method) result.method = matcher.method.toUpperCase();
  if (matcher.url instanceof RegExp) {
    result.urlType = 'regex';
    result.pattern = matcher.url.source;
    result.flags = matcher.url.flags;
  } else {
    result.urlType = 'exact';
    result.url = matcher.url;
  }
  return result;
}

function matcherKey(m: SerializedMatcher): string {
  return `${m.method ?? '*'}:${m.urlType}:${m.url ?? m.pattern ?? ''}:${m.flags ?? ''}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function probeMetroPort(port: number): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1_000);
    const res = await fetch(`http://localhost:${port}/json`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return false;
    const pages = await res.json() as unknown[];
    return Array.isArray(pages) && pages.length > 0;
  } catch {
    return false;
  }
}
