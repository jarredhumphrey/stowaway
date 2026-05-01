# Test Organisation

## The registration model

`describe` and `it` are synchronous calls at module scope. When `TestRunner.run()` is called, it imports each spec file in order; the side effects of those imports register all suites and tests. The runner then executes them sequentially.

`run()` accepts either a directory path (auto-discovers `*.spec.ts` files alphabetically) or an explicit `string[]` for a fixed order:

```ts
runner.run(__dirname);                  // auto-discover
runner.run([path.resolve(__dirname, 'auth.spec.ts'), ...]);  // explicit order
```

```ts
import { describe, it, beforeEach } from 'stowaway';
import type { AppSession } from 'stowaway';

describe('Settings', () => {
  beforeEach(async (app: AppSession) => {
    // navigate to the settings screen before each test
    await (await app.find({ testID: 'tab-settings' })).tap();
  });

  it('toggles notifications', async (app: AppSession) => {
    const toggle = await app.find({ testID: 'notifications-toggle' });
    await toggle.tap();
    // ...
  });
});
```

---

## Hooks

All hooks receive the `AppSession` as their only argument. They run at these points:

| Hook | When it runs |
|---|---|
| `beforeAll(fn)` | Once before the first test in the suite |
| `beforeEach(fn)` | Before every test in the suite, after the app relaunches |
| `afterEach(fn)` | After every test in the suite (errors are swallowed — non-fatal) |
| `afterAll(fn)` | Once after the last test in the suite (errors are swallowed — non-fatal) |

`afterEach` and `afterAll` errors are swallowed so that a cleanup failure doesn't mask the actual test failure.

```ts
describe('Cart', () => {
  beforeAll(async (app) => {
    // sign in once before all cart tests
    await signIn(app, 'test@example.com');
  });

  afterEach(async (app) => {
    // clear the cart after each test
    await (await app.find({ testID: 'btn-clear-cart' })).tap();
  });

  it('adds an item to the cart', async (app) => {
    // ...
  });
});
```

**Important:** The app is relaunched between every test regardless of hooks. `beforeEach` runs after the relaunch, so it can assume a clean app state.

---

## Nested describes

`describe` calls can be nested. The runner flattens the tree — all tests from nested suites appear in the parent suite with prefixed names:

```ts
describe('Checkout', () => {
  describe('Shipping', () => {
    it('validates address', async (app) => { ... });
  });

  describe('Payment', () => {
    it('accepts a valid card', async (app) => { ... });
  });
});
```

The runner outputs:
```
  Checkout
    ✓ Shipping > validates address
    ✓ Payment > accepts a valid card
```

Hooks from the outer `describe` apply to all nested tests.

---

## Skipping tests

### `it.skip`

Marks a single test as skipped. The runner prints it with a `↷` indicator and records it as `skip` in the results. The test function is never called.

```ts
it.skip('stripe webhook integration (not yet wired up)', async (app) => {
  // ...
});
```

### `describe.skip`

Marks an entire suite as skipped. All tests inside are recorded as skipped without executing any of them, including hooks.

```ts
describe.skip('Payments — requires Stripe sandbox', () => {
  it('charges the card', async (app) => { ... });
  it('handles declined cards', async (app) => { ... });
});
```

---

## Focusing tests

Use `.only` when you want to run a subset of tests during development without deleting the others.

### `it.only`

Runs only the marked tests within their suite. All other tests in the same suite are implicitly skipped (recorded as `skip`, not run).

```ts
describe('Profile', () => {
  it.only('updates the display name', async (app) => {
    // only this test runs
  });

  it('updates the avatar', async (app) => {
    // implicitly skipped
  });
});
```

### `describe.only`

Runs only the marked suite(s). All other suites — across all spec files — are skipped entirely.

```ts
describe.only('Auth', () => {
  it('signs in with email', async (app) => { ... });
  it('signs out', async (app) => { ... });
});

// This entire suite is skipped:
describe('Settings', () => {
  it('toggles notifications', async (app) => { ... });
});
```

`describe.only` is global — it affects suites defined in other spec files too, since all files are loaded before any tests run.

---

## Per-test timeout

Override the default timeout for a single slow test by passing `{ timeout }` as the third argument to `it`:

```ts
it('exports a large dataset', async (app) => {
  await app.find({ testID: 'btn-export' }).then(b => b.tap());
  await app.waitForElement('export-complete', { timeout: 60_000 });
}, { timeout: 90_000 }); // give the whole test 90 s
```

The default is controlled by the `DEFAULT_TIMEOUT` environment variable (default: 10 000 ms). The per-test `timeout` overrides it only for that test.

---

## Retries

Flaky tests can be given extra attempts. The test function is re-called up to `retries` additional times on failure. Each retry uses the same `AppSession` — there is no reset between attempts.

```ts
it('syncs after network reconnect', async (app) => {
  await app.waitForElement('sync-complete', { timeout: 5_000 });
}, { retries: 2 }); // 3 total attempts
```

When all attempts fail, the last error is reported. A pass on any attempt is a pass.

**Note:** Module-level counters and any state your test function accumulates persist across retry attempts, because retries call the same function closure. If your retry logic needs to know which attempt it's on, use a closure variable:

```ts
let attempts = 0;
it('passes on the third try', async (_app) => {
  attempts++;
  if (attempts < 3) throw new Error(`attempt ${attempts} — simulated flake`);
}, { retries: 2 });
```

---

## Combining options

`timeout` and `retries` can be combined:

```ts
it('uploads a video', async (app) => {
  // ...
}, { timeout: 120_000, retries: 1 });
```

---

## Complete example

```ts
import { describe, it, beforeAll, beforeEach, afterEach, expect } from 'stowaway';
import type { AppSession } from 'stowaway';

async function signIn(app: AppSession) {
  await (await app.find({ testID: 'input-email' })).typeText('test@example.com');
  await (await app.find({ testID: 'input-password' })).typeText('password123');
  await (await app.find({ testID: 'btn-sign-in' })).tap();
  await app.waitForElement('home-screen');
}

describe('Profile', () => {
  beforeAll(async (app) => {
    await signIn(app);
  });

  beforeEach(async (app) => {
    await (await app.find({ testID: 'tab-profile' })).tap();
  });

  it('shows the user email', async (app) => {
    const label = await app.waitForElement('profile-email');
    expect(await label.text()).toBe('test@example.com');
  });

  it.skip('changes the avatar (not implemented yet)', async (_app) => {
    // ...
  });

  it('updates the display name', async (app) => {
    const input = await app.find({ testID: 'input-display-name' });
    await input.clearText();
    await input.typeText('Jane Doe');
    await (await app.find({ testID: 'btn-save' })).tap();
    await app.waitForElement('save-success');
  }, { timeout: 15_000, retries: 1 });
});
```
