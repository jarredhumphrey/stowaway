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

export function expect(value: unknown): Assertion {
  return new Assertion(value);
}
