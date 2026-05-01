import { Element } from './Element';

class AsyncElementExpect {
  constructor(
    private element: Element,
    private negated = false,
  ) {}

  get not(): AsyncElementExpect {
    return new AsyncElementExpect(this.element, !this.negated);
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
    throw new AssertionError(prefix + message);
  }

  async toHaveText(expected: string | RegExp, opts?: { timeout?: number }): Promise<void> {
    await this.poll(async () => {
      const text = await this.element.text();
      return expected instanceof RegExp ? expected.test(text) : text === expected;
    }, `element to have text ${JSON.stringify(String(expected))}`, opts);
  }

  async toBeVisible(opts?: { timeout?: number }): Promise<void> {
    await this.poll(() => this.element.isVisible(), 'element to be visible', opts);
  }

  async toBeEnabled(opts?: { timeout?: number }): Promise<void> {
    await this.poll(() => this.element.isEnabled(), 'element to be enabled', opts);
  }

  async toHaveValue(expected: string, opts?: { timeout?: number }): Promise<void> {
    await this.poll(
      async () => (await this.element.inputValue()) === expected,
      `element to have value ${JSON.stringify(expected)}`,
      opts,
    );
  }
}

class Assertion {
  constructor(
    private value: unknown,
    private negated = false,
  ) {}

  get not(): Assertion {
    return new Assertion(this.value, !this.negated);
  }

  private pass(result: boolean, message: string): void {
    const success = this.negated ? !result : result;
    if (!success) {
      const prefix = this.negated ? 'Expected NOT: ' : 'Expected: ';
      throw new AssertionError(prefix + message + ` (received: ${format(this.value)})`);
    }
  }

  toBe(expected: unknown): void {
    this.pass(
      Object.is(this.value, expected),
      `${format(expected)}`,
    );
  }

  toEqual(expected: unknown): void {
    this.pass(
      JSON.stringify(this.value) === JSON.stringify(expected),
      `equal to ${format(expected)}`,
    );
  }

  toContain(expected: unknown): void {
    if (typeof this.value === 'string') {
      this.pass(this.value.includes(expected as string), `to contain ${format(expected)}`);
    } else if (Array.isArray(this.value)) {
      this.pass(this.value.includes(expected), `to contain ${format(expected)}`);
    } else {
      throw new AssertionError(`toContain requires string or array, got ${typeof this.value}`);
    }
  }

  toBeTruthy(): void {
    this.pass(Boolean(this.value), 'to be truthy');
  }

  toBeFalsy(): void {
    this.pass(!this.value, 'to be falsy');
  }

  toBeNull(): void {
    this.pass(this.value === null, 'to be null');
  }

  toBeUndefined(): void {
    this.pass(this.value === undefined, 'to be undefined');
  }

  toBeGreaterThan(n: number): void {
    this.pass((this.value as number) > n, `to be greater than ${n}`);
  }

  toHaveLength(n: number): void {
    const len = (this.value as { length: number }).length;
    this.pass(len === n, `to have length ${n} (got ${len})`);
  }

  toBeGreaterThanOrEqual(n: number): void {
    this.pass((this.value as number) >= n, `to be greater than or equal to ${n}`);
  }

  toBeLessThan(n: number): void {
    this.pass((this.value as number) < n, `to be less than ${n}`);
  }

  toBeLessThanOrEqual(n: number): void {
    this.pass((this.value as number) <= n, `to be less than or equal to ${n}`);
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
    this.pass(allMatch, `to match object ${format(expected)}`);
  }

  toHaveAccessibilityLabel(label: string): void {
    const props = this.value as Record<string, unknown>;
    const got = props.accessibilityLabel;
    this.pass(got === label, `to have accessibilityLabel ${format(label)} (got ${format(got)})`);
  }

  toHaveAccessibilityRole(role: string): void {
    const props = this.value as Record<string, unknown>;
    const got = props.accessibilityRole;
    this.pass(got === role, `to have accessibilityRole ${format(role)} (got ${format(got)})`);
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

export function expect(value: Element): AsyncElementExpect;
export function expect(value: unknown): Assertion;
export function expect(value: unknown): AsyncElementExpect | Assertion {
  if (value instanceof Element) return new AsyncElementExpect(value);
  return new Assertion(value);
}
