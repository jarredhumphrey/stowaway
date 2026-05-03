import { Element } from './Element';
import type { TraceCollector } from './TraceCollector';

// --- Expect tracer (wired by AppSession) ---

let _expectTracer: TraceCollector | null = null;

export function setExpectTracer(tracer: TraceCollector | null): void {
  _expectTracer = tracer;
}

// --- Soft assertion collector ---

let _softFailures: string[] = [];

export function clearSoftFailures(): void {
  _softFailures = [];
}

export function flushSoftFailures(): void {
  const failures = _softFailures.slice();
  _softFailures = [];
  if (failures.length > 0) {
    throw new AssertionError(
      `${failures.length} soft assertion(s) failed:\n${failures.map(f => `  • ${f}`).join('\n')}`,
    );
  }
}

// --- Async element matchers ---

class AsyncElementExpect {
  constructor(
    private element: Element,
    private negated = false,
    private onFail: (msg: string) => void = (msg) => { throw new AssertionError(msg); },
  ) {}

  get not(): AsyncElementExpect {
    return new AsyncElementExpect(this.element, !this.negated, this.onFail);
  }

  private async poll(
    check: () => Promise<boolean>,
    message: string,
    opts?: { timeout?: number },
  ): Promise<void> {
    const timeout = opts?.timeout ?? 4_000;
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const result = await check();
      if (this.negated ? !result : result) return;
      await new Promise(r => setTimeout(r, 250));
    }
    const prefix = this.negated ? 'Expected NOT: ' : 'Expected: ';
    this.onFail(prefix + message);
  }

  private emitAsync(name: string, value: string | undefined, startMs: number): void {
    const prefix = this.negated ? 'not.' : '';
    _expectTracer?.add({
      action: prefix + name,
      target: this.element.label,
      value,
      durationMs: Date.now() - startMs,
      timestampMs: startMs,
    });
  }

  async toHaveText(expected: string | RegExp, opts?: { timeout?: number }): Promise<void> {
    const start = Date.now();
    try {
      await this.poll(async () => {
        const text = await this.element.text();
        return expected instanceof RegExp ? expected.test(text) : text === expected;
      }, `element to have text ${JSON.stringify(String(expected))}`, opts);
    } finally {
      this.emitAsync('toHaveText', String(expected), start);
    }
  }

  async toBeVisible(opts?: { timeout?: number }): Promise<void> {
    const start = Date.now();
    try {
      await this.poll(() => this.element.isVisible(), 'element to be visible', opts);
    } finally {
      this.emitAsync('toBeVisible', undefined, start);
    }
  }

  async toBeEnabled(opts?: { timeout?: number }): Promise<void> {
    const start = Date.now();
    try {
      await this.poll(() => this.element.isEnabled(), 'element to be enabled', opts);
    } finally {
      this.emitAsync('toBeEnabled', undefined, start);
    }
  }

  async toHaveValue(expected: string, opts?: { timeout?: number }): Promise<void> {
    const start = Date.now();
    try {
      await this.poll(
        async () => (await this.element.inputValue()) === expected,
        `element to have value ${JSON.stringify(expected)}`,
        opts,
      );
    } finally {
      this.emitAsync('toHaveValue', expected, start);
    }
  }

  async toBeChecked(opts?: { timeout?: number }): Promise<void> {
    const start = Date.now();
    try {
      await this.poll(() => this.element.isChecked(), 'element to be checked', opts);
    } finally {
      this.emitAsync('toBeChecked', undefined, start);
    }
  }

  async toBeDisabled(opts?: { timeout?: number }): Promise<void> {
    const start = Date.now();
    try {
      await this.poll(async () => !(await this.element.isEnabled()), 'element to be disabled', opts);
    } finally {
      this.emitAsync('toBeDisabled', undefined, start);
    }
  }

  async toBeHidden(opts?: { timeout?: number }): Promise<void> {
    const start = Date.now();
    try {
      await this.poll(async () => !(await this.element.isVisible()), 'element to be hidden', opts);
    } finally {
      this.emitAsync('toBeHidden', undefined, start);
    }
  }

  async toHaveFocus(opts?: { timeout?: number }): Promise<void> {
    const start = Date.now();
    try {
      await this.poll(() => this.element.isFocused(), 'element to have focus', opts);
    } finally {
      this.emitAsync('toHaveFocus', undefined, start);
    }
  }
}

// --- Sync matchers ---

class Assertion {
  constructor(
    private value: unknown,
    private negated = false,
    private onFail: (msg: string) => void = (msg) => { throw new AssertionError(msg); },
  ) {}

  get not(): Assertion {
    return new Assertion(this.value, !this.negated, this.onFail);
  }

  private pass(name: string, result: boolean, message: string): void {
    const prefix = this.negated ? 'not.' : '';
    _expectTracer?.add({
      action: prefix + name,
      target: message,
      value: format(this.value),
      durationMs: 0,
      timestampMs: Date.now(),
    });
    const success = this.negated ? !result : result;
    if (!success) {
      const errPrefix = this.negated ? 'Expected NOT: ' : 'Expected: ';
      this.onFail(errPrefix + message + ` (received: ${format(this.value)})`);
    }
  }

  toBe(expected: unknown): void {
    this.pass('toBe', Object.is(this.value, expected), `${format(expected)}`);
  }

  toEqual(expected: unknown): void {
    this.pass('toEqual', JSON.stringify(this.value) === JSON.stringify(expected), `equal to ${format(expected)}`);
  }

  toContain(expected: unknown): void {
    if (typeof this.value === 'string') {
      this.pass('toContain', this.value.includes(expected as string), `to contain ${format(expected)}`);
    } else if (Array.isArray(this.value)) {
      this.pass('toContain', this.value.includes(expected), `to contain ${format(expected)}`);
    } else {
      throw new AssertionError(`toContain requires string or array, got ${typeof this.value}`);
    }
  }

  toBeTruthy(): void {
    this.pass('toBeTruthy', Boolean(this.value), 'to be truthy');
  }

  toBeFalsy(): void {
    this.pass('toBeFalsy', !this.value, 'to be falsy');
  }

  toBeNull(): void {
    this.pass('toBeNull', this.value === null, 'to be null');
  }

  toBeUndefined(): void {
    this.pass('toBeUndefined', this.value === undefined, 'to be undefined');
  }

  toBeGreaterThan(n: number): void {
    this.pass('toBeGreaterThan', (this.value as number) > n, `to be greater than ${n}`);
  }

  toHaveLength(n: number): void {
    const len = (this.value as { length: number }).length;
    this.pass('toHaveLength', len === n, `to have length ${n} (got ${len})`);
  }

  toBeGreaterThanOrEqual(n: number): void {
    this.pass('toBeGreaterThanOrEqual', (this.value as number) >= n, `to be greater than or equal to ${n}`);
  }

  toBeLessThan(n: number): void {
    this.pass('toBeLessThan', (this.value as number) < n, `to be less than ${n}`);
  }

  toBeLessThanOrEqual(n: number): void {
    this.pass('toBeLessThanOrEqual', (this.value as number) <= n, `to be less than or equal to ${n}`);
  }

  toMatchObject(expected: Record<string, unknown>): void {
    const actual = this.value as Record<string, unknown>;
    const allMatch = Object.keys(expected).every(k => {
      try {
        return JSON.stringify(actual[k]) === JSON.stringify(expected[k]);
      } catch {
        return false;
      }
    });
    this.pass('toMatchObject', allMatch, `to match object ${format(expected)}`);
  }

  toHaveAccessibilityLabel(label: string): void {
    const props = this.value as Record<string, unknown>;
    const got = props.accessibilityLabel;
    this.pass('toHaveAccessibilityLabel', got === label, `to have accessibilityLabel ${format(label)} (got ${format(got)})`);
  }

  toHaveAccessibilityRole(role: string): void {
    const props = this.value as Record<string, unknown>;
    const got = props.accessibilityRole;
    this.pass('toHaveAccessibilityRole', got === role, `to have accessibilityRole ${format(role)} (got ${format(got)})`);
  }
}

export class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssertionError';
  }
}

function format(v: unknown): string {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'string') return `"${v}"`;
  return JSON.stringify(v);
}

const softOnFail = (msg: string): void => { _softFailures.push(msg); };

function softExpect(value: Element): AsyncElementExpect;
function softExpect(value: unknown): Assertion;
function softExpect(value: unknown): AsyncElementExpect | Assertion {
  if (value instanceof Element) return new AsyncElementExpect(value, false, softOnFail);
  return new Assertion(value, false, softOnFail);
}

export function expect(value: Element): AsyncElementExpect;
export function expect(value: unknown): Assertion;
export function expect(value: unknown): AsyncElementExpect | Assertion {
  if (value instanceof Element) return new AsyncElementExpect(value);
  return new Assertion(value);
}

expect.soft = softExpect;
