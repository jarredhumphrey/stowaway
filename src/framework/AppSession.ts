import { Device } from './Device';
import { HermesSession } from './HermesSession';
import { Element, type NodeDescriptor } from './Element';
import { BRIDGE_INJECTOR_SCRIPT } from '../bridge/injector';
import { NETWORK_MOCK_SCRIPT } from '../bridge/network-mock';
import { STORAGE_BRIDGE_SCRIPT } from '../bridge/storage';
import type { E2EConfig } from '../config';
import {
  type Selector,
  selectorToExpression,
  selectorToAllExpression,
} from './selectors';

export type { Selector };

function selectorStep(sel: Selector): string {
  if ('testID' in sel) return sel.testID;
  if ('text' in sel) return typeof sel.text === 'string' ? `"${sel.text}"` : sel.text.toString();
  if ('component' in sel) return sel.component;
  if ('accessibilityLabel' in sel) return `a11y:"${sel.accessibilityLabel}"`;
  if ('accessibilityRole' in sel) return `role:${sel.accessibilityRole}`;
  if ('placeholder' in sel) return `placeholder:"${sel.placeholder}"`;
  return JSON.stringify(sel);
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

  constructor(private config: E2EConfig) {
    this.device = new Device(config);
    this.hermes = new HermesSession(config);
    this.resultsDir = config.testResultsDir;
  }

  setResultsDir(dir: string): void {
    this.resultsDir = dir;
  }

  async start(): Promise<void> {
    await this.device.init();
    await this.device.launch();
    await this.hermes.connect();
    await this.injectBridge();
  }

  async reset(): Promise<void> {
    await this.hermes.disconnect();
    await this.device.terminate();
    await this.device.launch();
    await this.hermes.connect();
    await this.injectBridge();
  }

  async stop(): Promise<void> {
    await this.hermes.disconnect();
    await this.device.terminate();
  }

  private async injectBridge(): Promise<void> {
    const ok = await this.hermes.evaluate<boolean>(BRIDGE_INJECTOR_SCRIPT);
    if (!ok) {
      throw new Error(
        'Bridge injection returned false — __REACT_DEVTOOLS_GLOBAL_HOOK__ not found. ' +
          'Ensure the app is running with Hermes and the bundle is loaded.',
      );
    }
    await this.hermes.evaluate(NETWORK_MOCK_SCRIPT);
    await this.hermes.evaluate(STORAGE_BRIDGE_SCRIPT);
  }

  // ── Network mocking ──────────────────────────────────────────────────────────

  async mockNetwork(matcher: NetworkMatcher, response: NetworkResponse): Promise<void> {
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
  }

  async networkRequests(): Promise<NetworkRequest[]> {
    return this.hermes.evaluate<NetworkRequest[]>(`__testNetworkMocks__.requests`);
  }

  async clearNetworkMocks(): Promise<void> {
    this.suiteMocks = [];
    await this.hermes.evaluate(
      `__testNetworkMocks__.mocks = []; __testNetworkMocks__.requests = [];`,
    );
  }

  async setNetworkOffline(offline: boolean): Promise<void> {
    await this.hermes.evaluate(`globalThis.__testNetworkOffline__ = ${offline}`);
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

  private step(msg: string): void {
    if (this.config.verbose) console.log(`        ${msg}`);
  }

  // ── Queries ──────────────────────────────────────────────────────────────────

  async find(selector: Selector): Promise<Element> {
    const expr = selectorToExpression(selector);
    const descriptor = await this.hermes.evaluate<NodeDescriptor | null>(expr);
    if (!descriptor) {
      throw new Error(`find() — element not found: ${JSON.stringify(selector)}`);
    }
    this.step(`find: ${selectorStep(selector)}`);
    return new Element(descriptor, this.hermes, this.config.verbose);
  }

  async findAll(selector: Selector): Promise<Element[]> {
    const expr = selectorToAllExpression(selector);
    const descriptors = await this.hermes.evaluate<NodeDescriptor[]>(expr);
    this.step(`findAll: ${selectorStep(selector)} (${descriptors.length} found)`);
    return descriptors.map(d => new Element(d, this.hermes, this.config.verbose));
  }

  async waitForElement(
    selectorOrTestID: Selector | string,
    opts?: { timeout?: number; interval?: number },
  ): Promise<Element> {
    const selector: Selector = typeof selectorOrTestID === 'string'
      ? { testID: selectorOrTestID }
      : selectorOrTestID;
    const timeout = opts?.timeout ?? this.config.defaultTimeout;
    const interval = opts?.interval ?? this.config.pollInterval;
    const deadline = Date.now() + timeout;
    // Inline the evaluate so the internal polling never triggers find()'s step log.
    const expr = selectorToExpression(selector);

    while (Date.now() < deadline) {
      const descriptor = await this.hermes.evaluate<NodeDescriptor | null>(expr);
      if (descriptor) {
        this.step(`waitFor: ${selectorStep(selector)}`);
        return new Element(descriptor, this.hermes, this.config.verbose);
      }
      await sleep(interval);
    }
    throw new Error(
      `waitForElement(${JSON.stringify(selectorOrTestID)}) timed out after ${timeout}ms`,
    );
  }

  async findNth(selector: Selector, n: number): Promise<Element> {
    const all = await this.findAll(selector);
    if (n < 0 || n >= all.length) {
      throw new Error(`findNth() — index ${n} out of range (found ${all.length})`);
    }
    return all[n];
  }

  async getTree(maxDepth = 30): Promise<unknown> {
    return this.hermes.evaluate(`__testBridge__.getTree(${maxDepth})`);
  }

  async waitFor(
    fn: () => Promise<boolean>,
    opts?: { timeout?: number; interval?: number },
  ): Promise<void> {
    const timeout = opts?.timeout ?? this.config.defaultTimeout;
    const interval = opts?.interval ?? this.config.pollInterval;
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      if (await fn()) return;
      await sleep(interval);
    }
    throw new Error(`waitFor() condition timed out after ${timeout}ms`);
  }

  // Scroll the visible FlatList/ScrollView until the element with testID appears.
  async scrollAndFind(testID: string, opts?: { timeout?: number }): Promise<Element> {
    const timeout = opts?.timeout ?? this.config.defaultTimeout;
    const deadline = Date.now() + timeout;
    // Inline the evaluate so internal retries don't trigger find()'s step log.
    const expr = selectorToExpression({ testID });

    const tryFind = async (): Promise<Element | null> => {
      const descriptor = await this.hermes.evaluate<NodeDescriptor | null>(expr);
      return descriptor ? new Element(descriptor, this.hermes, this.config.verbose) : null;
    };

    const initial = await tryFind();
    if (initial) {
      this.step(`scrollAndFind: ${testID}`);
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
          this.step(`scrollAndFind: ${testID}`);
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
    const selector: Selector = typeof selectorOrTestID === 'string'
      ? { testID: selectorOrTestID }
      : selectorOrTestID;
    const timeout = opts?.timeout ?? this.config.defaultTimeout;
    const interval = opts?.interval ?? this.config.pollInterval;
    const deadline = Date.now() + timeout;
    // Inline the evaluate so internal checks don't trigger find()'s step log.
    const expr = 'testID' in selector
      ? null
      : selectorToExpression(selector);

    while (Date.now() < deadline) {
      if ('testID' in selector) {
        const gone = await this.hermes.evaluate<boolean>(
          `!__testBridge__.exists(${JSON.stringify(selector.testID)})`,
        );
        if (gone) {
          this.step(`waitForGone: ${selectorStep(selector)}`);
          return;
        }
      } else {
        const descriptor = await this.hermes.evaluate<NodeDescriptor | null>(expr!);
        if (!descriptor) {
          this.step(`waitForGone: ${selectorStep(selector)}`);
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
    await this.hermes.evaluate<boolean>('__testBridge__.dismissKeyboard()');
  }

  async pressBack(): Promise<void> {
    await this.device.pressBack();
  }

  async openURL(url: string): Promise<void> {
    await this.device.openURL(url);
  }

  async setLocation(lat: number, lng: number): Promise<void> {
    await this.device.setLocation(lat, lng);
  }

  async setPermission(
    service: string,
    status: 'grant' | 'revoke' | 'reset',
  ): Promise<void> {
    await this.device.setPermission(service, status);
  }

  async screenshot(name: string): Promise<string> {
    const { mkdirSync } = await import('fs');
    mkdirSync(this.resultsDir, { recursive: true });
    const filePath = `${this.resultsDir}/${name}-${Date.now()}.png`;
    await this.device.screenshot(filePath);
    return filePath;
  }

  // ── Animation control ─────────────────────────────────────────────────────────

  async disableAnimations(): Promise<void> {
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
  }

  // ── AsyncStorage ──────────────────────────────────────────────────────────────

  async setStorage(key: string, value: string): Promise<void> {
    await this.requireStorage();
    await this.awaitStorageOp<void>(
      `__testStorage__.setItem(${JSON.stringify(key)}, ${JSON.stringify(value)})`,
    );
  }

  async getStorage(key: string): Promise<string | null> {
    await this.requireStorage();
    return this.awaitStorageOp<string | null>(
      `__testStorage__.getItem(${JSON.stringify(key)})`,
    );
  }

  async removeStorage(key: string): Promise<void> {
    await this.requireStorage();
    await this.awaitStorageOp<void>(
      `__testStorage__.removeItem(${JSON.stringify(key)})`,
    );
  }

  async clearStorage(): Promise<void> {
    await this.requireStorage();
    await this.awaitStorageOp<void>('__testStorage__.clear()');
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
