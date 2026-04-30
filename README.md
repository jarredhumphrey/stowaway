# stowaway

E2E testing framework for React Native apps. Connects to the running app via the Hermes CDP bridge exposed by Metro, traverses the React fiber tree to find elements, and triggers interactions directly — no Appium, no coordinate math, no YAML.

**Status:** Early development. Currently consumed by a single project via a `file:` path dependency.

---

## How it works

React Native + Hermes exposes a Chrome DevTools Protocol (CDP) endpoint via Metro on `localhost:8081`. Stowaway connects over WebSocket and uses `Runtime.evaluate` to execute JavaScript inside the live Hermes engine. A small bridge script is injected once per test run; it uses `__REACT_DEVTOOLS_GLOBAL_HOOK__` to walk the React fiber tree and expose test utilities as `globalThis.__testBridge__`.

`xcrun simctl` (iOS) and `adb` (Android) handle app lifecycle only — launch, terminate, screenshot. Everything else goes through the fiber tree.

---

## Requirements

- Node >= 22
- iOS: Xcode + `xcrun simctl`
- Android: `adb`
- A running React Native app built with Hermes (the default since RN 0.70)

---

## Installation

Not yet published to npm. Add as a local dependency:

```json
"devDependencies": {
  "stowaway": "file:../stowaway"
}
```

Then run `npm install`. Any changes to stowaway's `src/` require rebuilding (`npm run build` in the stowaway directory) before running tests in the consuming project.

---

## Usage

### 1. Config

All configuration is read from environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PLATFORM` | `ios` | `ios` or `android` |
| `BUNDLE_ID` | required | App bundle identifier |
| `METRO_PORT` | `8081` | Metro dev server port |
| `DEFAULT_TIMEOUT` | `10000` | Element wait timeout (ms) |
| `TEST_RESULTS_DIR` | `test-results` | JSON results output directory |
| `SUITE_NAME` | — | Label printed in the run header |

```ts
import { loadConfig } from 'stowaway';

const config = loadConfig(); // throws if BUNDLE_ID is not set
```

### 2. Write tests

```ts
import { describe, it, expect } from 'stowaway';

describe('Home Screen', () => {
  it('shows the title', async (app) => {
    const el = await app.waitForElement('home-title');
    expect(await el.text()).toBe('My App');
  });

  it('tapping a card navigates to the detail screen', async (app) => {
    await (await app.waitForElement('card-1')).tap();
    await app.waitForElement('detail-screen');
  });
});
```

The `app` parameter passed to each test is an `AppSession`. The app is reset (terminated and relaunched) between every test automatically.

### 3. Run entry point

```ts
import * as fs from 'fs';
import * as path from 'path';
import { TestRunner, loadConfig } from 'stowaway';

const specsDir = path.join(__dirname, 'specs');
const specFiles = fs.readdirSync(specsDir)
  .filter(f => f.endsWith('.spec.ts'))
  .map(f => path.join(specsDir, f));

const runner = new TestRunner(loadConfig());
await runner.run(specFiles);
```

---

## API

### `AppSession`

| Method | Description |
|--------|-------------|
| `waitForElement(testID, opts?)` | Poll until an element with the given `testID` is in the fiber tree |
| `scrollAndFind(testID, opts?)` | Scroll a FlatList/ScrollView until the element appears |
| `find(selector)` | Find one element immediately (throws if not found) |
| `findAll(selector)` | Find all matching elements |
| `waitFor(fn, opts?)` | Poll until an arbitrary async predicate returns `true` |
| `screenshot(name)` | Capture a screenshot to `testResultsDir` |

**Selector types:**
```ts
{ testID: string }
{ component: string; props?: Record<string, unknown> }
{ text: string }
```

### `Element`

| Method | Description |
|--------|-------------|
| `tap()` | Calls the nearest `onPress` up the fiber tree |
| `text()` | Returns concatenated text from all descendant HostText fibers |
| `exists()` | Re-queries by testID; returns `false` if not found |
| `props()` | Returns serializable (non-function) `memoizedProps` |

### `expect`

Minimal assertion library. Throws `AssertionError` on failure.

```ts
expect(value).toBe(x)
expect(value).toEqual(x)       // JSON.stringify comparison
expect(value).toContain(x)     // string or array
expect(value).toBeTruthy()
expect(value).toBeFalsy()
expect(value).toBeNull()
expect(value).toBeUndefined()
expect(value).toBeGreaterThan(n)
expect(value).toHaveLength(n)
expect(value).not.toBe(x)      // negation works on all matchers
```

---

## Caveats

- **Node IDs are invalidated after `reset()`** — never hold an `Element` reference across test boundaries; always re-query.
- **The bridge script is evaluated fresh each `reset()`** — any global test state inside the app is wiped.
- **CJS build only** — currently compiles to CommonJS so it can be required by `tsx` in projects without `"type": "module"`. A dual CJS+ESM build will be needed before publishing to npm.
- **iOS only, tested** — Android paths exist in `Device.ts` but are untested.
