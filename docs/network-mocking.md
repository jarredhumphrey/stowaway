# Network Mocking

Stowaway can intercept `fetch` calls inside the running app and return controlled responses. The mock is injected into the Hermes engine alongside the test bridge — no proxy server, no native interception, no extra infrastructure.

> **Scope:** Only `fetch` is intercepted. Native networking that bypasses the JS layer (e.g. some native modules) is not affected. `XMLHttpRequest` / `axios` support can be added in a future release.

---

## Basic usage

```ts
import { describe, it, expect } from 'stowaway';
import type { AppSession } from 'stowaway';

describe('Login screen', () => {
  it('shows an error on invalid credentials', async (app: AppSession) => {
    await app.mockNetwork(
      { method: 'POST', url: 'https://api.example.com/auth/login' },
      { status: 401, body: { error: 'Invalid credentials' } },
    );

    await (await app.find({ testID: 'btn-sign-in' })).tap();
    const banner = await app.waitForElement('error-banner');
    expect(await banner.text()).toContain('Invalid credentials');
  });
});
```

---

## URL matching

Pass a `string` for exact URL matching, or a `RegExp` for pattern matching.

```ts
// Exact match — the full URL must match character for character
await app.mockNetwork(
  { url: 'https://api.example.com/users/42' },
  { status: 200, body: { id: 42, name: 'Jane' } },
);

// Regex match — any URL containing "/api/users/" followed by digits
await app.mockNetwork(
  { url: /\/api\/users\/\d+/ },
  { status: 200, body: { id: 1, name: 'Jane' } },
);

// Regex with no method constraint — matches any HTTP method
await app.mockNetwork(
  { url: /\/api\/products/ },
  { status: 200, body: [] },
);
```

---

## Method filtering

Omit `method` to match any HTTP method. Include it to match only a specific verb.

```ts
// Only intercepts POST /api/login
await app.mockNetwork(
  { method: 'POST', url: /\/api\/login/ },
  { status: 200, body: { token: 'abc123' } },
);

// Intercepts GET, POST, PATCH — any method to this URL
await app.mockNetwork(
  { url: 'https://api.example.com/session' },
  { status: 200, body: {} },
);
```

Method matching is case-insensitive.

---

## Response options

```ts
type NetworkResponse = {
  status?: number;           // default: 200
  headers?: Record<string, string>;
  body?: unknown;            // JSON-serialized; objects, arrays, strings, null
  delay?: number;            // ms to wait before resolving — simulates latency
};
```

Examples:

```ts
// 204 No Content
await app.mockNetwork({ url: /\/api\/logout/ }, { status: 204 });

// 500 error with body
await app.mockNetwork(
  { url: /\/api\/upload/ },
  { status: 500, body: { error: 'Storage limit exceeded' } },
);

// Slow network — 2 s delay
await app.mockNetwork(
  { url: /\/api\/report/ },
  { status: 200, body: { ready: true }, delay: 2_000 },
);

// Custom headers
await app.mockNetwork(
  { url: /\/api\/file/ },
  { status: 200, body: 'raw text', headers: { 'Content-Type': 'text/plain' } },
);
```

Unmocked requests pass through to the real network normally.

---

## Last-registered wins

If two mocks match the same URL and method, the one registered last takes effect.

```ts
await app.mockNetwork({ url: /\/api\/user/ }, { status: 200, body: { name: 'Alice' } });
await app.mockNetwork({ url: /\/api\/user/ }, { status: 200, body: { name: 'Bob' } });
// → fetch('/api/user') returns Bob
```

Use this to set a default in `beforeAll` and override it in specific tests:

```ts
beforeAll(async (app) => {
  await app.mockNetwork({ url: /\/api\/profile/ }, { status: 200, body: defaultProfile });
});

it('handles a missing avatar', async (app) => {
  // overrides the beforeAll default for this test only
  await app.mockNetwork({ url: /\/api\/profile/ }, { status: 200, body: { ...defaultProfile, avatar: null } });
  // ...
});
```

---

## Scope and lifetime

Mocks are scoped to where they are registered and cleared automatically when that scope ends.

| Registered in | Cleared after |
|---|---|
| `beforeAll` | The entire suite (`afterAll` completes) |
| `beforeEach` | Each test (naturally — the app relaunches before the next test) |
| `it()` body | That test (naturally — the app relaunches before the next test) |

**How it works:** The app is relaunched between every test (`session.reset()`), which re-injects the bridge and resets the mock registry. Mocks registered in `beforeAll` are remembered by the runner and re-applied automatically after each relaunch so they persist across all tests in the suite.

```ts
describe('User profile', () => {
  beforeAll(async (app) => {
    // Applies to every test in this suite
    await app.mockNetwork(
      { url: /\/api\/profile/ },
      { status: 200, body: { name: 'Jane', plan: 'pro' } },
    );
  });

  it('shows the display name', async (app) => {
    // profile mock is active — no setup needed
    const label = await app.waitForElement('profile-name');
    expect(await label.text()).toBe('Jane');
  });

  it('shows the plan badge', async (app) => {
    // profile mock is still active for this test too
    const badge = await app.waitForElement('plan-badge');
    expect(await badge.text()).toBe('pro');
  });
});
// suite ends → profile mock is cleared
```

---

## Inspecting requests

`networkRequests()` returns every request that was intercepted (mocked or passthrough) since the last app launch.

```ts
it('sends the correct payload on sign-in', async (app) => {
  await app.mockNetwork(
    { method: 'POST', url: /\/api\/login/ },
    { status: 200, body: { token: 'tok123' } },
  );

  const input = await app.find({ testID: 'input-email' });
  await input.typeText('user@example.com');
  await (await app.find({ testID: 'btn-sign-in' })).tap();

  const reqs = await app.networkRequests();
  expect(reqs).toHaveLength(1);
  expect(reqs[0].method).toBe('POST');
  expect(reqs[0].url).toContain('/api/login');
  expect((reqs[0].body as Record<string, unknown>).email).toBe('user@example.com');
});
```

`NetworkRequest` shape:

```ts
type NetworkRequest = {
  url: string;
  method: string;   // uppercase: 'GET', 'POST', etc.
  body: unknown;    // parsed JSON if the body was a JSON string, otherwise raw
};
```

The request log is cleared on each app relaunch (between tests). Within a single test you can call `networkRequests()` multiple times to see all requests accumulated since the test started.

---

## Manual clearing

Call `clearNetworkMocks()` to wipe all mocks and the request log mid-test. This also clears any suite-level mocks tracked in memory.

```ts
it('clears mocks between scenarios', async (app) => {
  await app.mockNetwork({ url: /\/api\/data/ }, { status: 200, body: { v: 1 } });
  // ... first scenario

  await app.clearNetworkMocks();

  await app.mockNetwork({ url: /\/api\/data/ }, { status: 500 });
  // ... second scenario
});
```
