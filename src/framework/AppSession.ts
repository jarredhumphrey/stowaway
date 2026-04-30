import { Device } from './Device';
import { HermesSession } from './HermesSession';
import { Element, type NodeDescriptor } from './Element';
import { BRIDGE_INJECTOR_SCRIPT } from '../bridge/injector';
import { NETWORK_MOCK_SCRIPT } from '../bridge/network-mock';
import { STORAGE_BRIDGE_SCRIPT } from '../bridge/storage';
import type { E2EConfig } from '../config';

export type Selector =
  | { testID: string }
  | { component: string; props?: Record<string, unknown> }
  | { text: string; exact?: boolean }
  | { text: RegExp };

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

  // ── Queries ──────────────────────────────────────────────────────────────────

  async find(selector: Selector): Promise<Element> {
    const expr = selectorToExpression(selector);
    const descriptor = await this.hermes.evaluate<NodeDescriptor | null>(expr);
    if (!descriptor) {
      throw new Error(`find() — element not found: ${JSON.stringify(selector)}`);
    }
    return new Element(descriptor, this.hermes);
  }

  async findAll(selector: Selector): Promise<Element[]> {
    const expr = selectorToAllExpression(selector);
    const descriptors = await this.hermes.evaluate<NodeDescriptor[]>(expr);
    return descriptors.map(d => new Element(d, this.hermes));
  }

  async waitForElement(
    testID: string,
    opts?: { timeout?: number; interval?: number },
  ): Promise<Element> {
    const timeout = opts?.timeout ?? this.config.defaultTimeout;
    const interval = opts?.interval ?? this.config.pollInterval;
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      try {
        const el = await this.find({ testID });
        return el;
      } catch {
        await sleep(interval);
      }
    }
    throw new Error(
      `waitForElement("${testID}") timed out after ${timeout}ms`,
    );
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

    // Check if already in the initial render batch before scrolling.
    try {
      return await this.find({ testID });
    } catch { /* not visible yet, need to scroll */ }

    const SCROLL_STEP = 5_000;
    let scrollOffset = SCROLL_STEP;

    while (Date.now() < deadline) {
      await this.hermes.evaluate<boolean>(`__testBridge__.scrollToOffset(${scrollOffset})`);

      // Poll until the element appears or we exhaust 1.5 s at this scroll position.
      const pollDeadline = Math.min(Date.now() + 1_500, deadline);
      while (Date.now() < pollDeadline) {
        try {
          return await this.find({ testID });
        } catch {
          await sleep(this.config.pollInterval);
        }
      }

      scrollOffset += SCROLL_STEP;
    }
    throw new Error(`scrollAndFind("${testID}") timed out after ${timeout}ms`);
  }

  async waitForElementToDisappear(
    testID: string,
    opts?: { timeout?: number; interval?: number },
  ): Promise<void> {
    const timeout = opts?.timeout ?? this.config.defaultTimeout;
    const interval = opts?.interval ?? this.config.pollInterval;
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      const gone = await this.hermes.evaluate<boolean>(
        `!__testBridge__.exists(${JSON.stringify(testID)})`,
      );
      if (gone) return;
      await sleep(interval);
    }
    throw new Error(`waitForElementToDisappear("${testID}") timed out after ${timeout}ms`);
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

// ── Selector helpers ──────────────────────────────────────────────────────────

function selectorToExpression(selector: Selector): string {
  if ('testID' in selector) {
    return `__testBridge__.findByTestID(${JSON.stringify(selector.testID)})`;
  }
  if ('component' in selector) {
    const props = selector.props ? JSON.stringify(selector.props) : 'null';
    return `(function() { var r = __testBridge__.findByComponent(${JSON.stringify(selector.component)}, ${props}); return r.length ? r[0] : null; })()`;
  }
  // text selector — walk Text fibers and match content
  const ts = selector as { text: string | RegExp; exact?: boolean };
  if (ts.text instanceof RegExp) {
    return `(function() {
      var rx = new RegExp(${JSON.stringify(ts.text.source)}, ${JSON.stringify(ts.text.flags)});
      var results = __testBridge__.findByComponent('Text');
      for (var i = 0; i < results.length; i++) {
        if (rx.test(__testBridge__.getText(results[i].nodeId))) return results[i];
      }
      return null;
    })()`;
  }
  if (ts.exact === false) {
    return `(function() {
      var needle = ${JSON.stringify(ts.text)};
      var results = __testBridge__.findByComponent('Text');
      for (var i = 0; i < results.length; i++) {
        if (__testBridge__.getText(results[i].nodeId).includes(needle)) return results[i];
      }
      return null;
    })()`;
  }
  return `(function() {
    var results = __testBridge__.findByComponent('Text');
    for (var i = 0; i < results.length; i++) {
      var t = __testBridge__.getText(results[i].nodeId);
      if (t === ${JSON.stringify(ts.text)}) return results[i];
    }
    return null;
  })()`;
}

function selectorToAllExpression(selector: Selector): string {
  if ('testID' in selector) {
    return `(function() { var r = __testBridge__.findByTestID(${JSON.stringify(selector.testID)}); return r ? [r] : []; })()`;
  }
  if ('component' in selector) {
    const props = selector.props ? JSON.stringify(selector.props) : 'null';
    return `__testBridge__.findByComponent(${JSON.stringify(selector.component)}, ${props})`;
  }
  const ts = selector as { text: string | RegExp; exact?: boolean };
  if (ts.text instanceof RegExp) {
    return `(function() {
      var rx = new RegExp(${JSON.stringify(ts.text.source)}, ${JSON.stringify(ts.text.flags)});
      return __testBridge__.findByComponent('Text').filter(function(r) {
        return rx.test(__testBridge__.getText(r.nodeId));
      });
    })()`;
  }
  if (ts.exact === false) {
    return `(function() {
      var needle = ${JSON.stringify(ts.text)};
      return __testBridge__.findByComponent('Text').filter(function(r) {
        return __testBridge__.getText(r.nodeId).includes(needle);
      });
    })()`;
  }
  return `(function() {
    var results = __testBridge__.findByComponent('Text');
    return results.filter(function(r) {
      return __testBridge__.getText(r.nodeId) === ${JSON.stringify(ts.text)};
    });
  })()`;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
