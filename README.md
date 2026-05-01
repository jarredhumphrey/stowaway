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
| `VERBOSE` | — | `1` or `true` — prints each step as it runs; also enabled by `--verbose` CLI flag |

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

Pass a directory path and `TestRunner` auto-discovers all `*.spec.ts` files inside it:

```ts
import { TestRunner, loadConfig } from 'stowaway';

const runner = new TestRunner(loadConfig());
runner.run(__dirname); // finds every *.spec.ts in the same directory
```

Or pass an explicit ordered array:

```ts
runner.run([
  path.resolve(__dirname, 'auth.spec.ts'),
  path.resolve(__dirname, 'home.spec.ts'),
]);
```

---

## API

### `AppSession` queries

| Method | Description |
|--------|-------------|
| `find(selector)` | First match — throws immediately if not found |
| `findAll(selector)` | All matches — empty array if none |
| `findNth(selector, n)` | nth match (0-based) from `findAll` — throws if out of range |
| `waitForElement(selector \| testID, opts?)` | Polls until the element appears; string arg treated as `{ testID }` |
| `waitForElementToDisappear(selector \| testID, opts?)` | Polls until the element leaves the tree |
| `waitFor(fn, opts?)` | Polls an arbitrary `() => Promise<boolean>` |
| `scrollAndFind(testID, opts?)` | Scrolls a FlatList/ScrollView in steps until the element appears |
| `getTree(maxDepth?)` | Returns the serialized fiber tree — useful for debugging testIDs |

**Selector types:**
```ts
{ testID: string }
{ component: string; props?: Record<string, unknown> }
{ text: string; exact?: boolean }        // exact defaults to true
{ text: RegExp }
{ accessibilityLabel: string; exact?: boolean }
{ accessibilityRole: string }
{ placeholder: string; exact?: boolean }
```

### `AppSession` interactions & device

| Method | Description |
|--------|-------------|
| `screenshot(name)` | Saves `<testResultsDir>/<name>-<timestamp>.png` |
| `dismissKeyboard()` | Blurs the first TextInput in the tree |
| `disableAnimations()` | Patches `Animated` to zero duration — call in `beforeAll` to reduce timing flakiness |
| `pressBack()` | Android only — sends hardware Back key |
| `openURL(url)` | Opens a URL via the OS deep-link mechanism |
| `setLocation(lat, lng)` | Simulates GPS location (iOS only) |
| `setPermission(service, status)` | Grants/revokes/resets a system permission |
| `setNetworkOffline(offline)` | When `true`, all `fetch` calls reject with a network error |
| `mockNetwork(matcher, response)` | Intercepts matching `fetch` calls and returns a controlled response |
| `networkRequests()` | Returns all intercepted requests since the last app launch |
| `clearNetworkMocks()` | Wipes all mocks and the request log |
| `setStorage(key, value)` | Writes a string to AsyncStorage |
| `getStorage(key)` | Reads a string from AsyncStorage (`null` if absent) |
| `removeStorage(key)` | Deletes a key from AsyncStorage |
| `clearStorage()` | Clears all AsyncStorage keys |

### `Element`

| Method | Description |
|--------|-------------|
| `tap()` | Nearest ancestor `onPress` |
| `longPress()` | Nearest ancestor `onLongPress` |
| `doubleTap()` | `onDoublePress`/`onDoubleTap` if found, otherwise `onPress` twice |
| `typeText(text)` | Calls `onChangeText` |
| `clearText()` | `typeText('')` |
| `pressKey(key)` | Fires `onKeyPress({ nativeEvent: { key } })` — e.g. `'Enter'`, `'Backspace'` |
| `focus()` / `blur()` | Calls `onFocus`/`onBlur` or `stateNode.focus()`/`blur()` |
| `submitEditing()` | Calls `onSubmitEditing` |
| `check()` / `uncheck()` | Calls `onValueChange(true/false)` — for Switch and custom toggles |
| `selectOption(value)` | Calls `onValueChange(value)` — for pickers and segmented controls |
| `swipe(direction, distance?)` | Fires a PanResponder gesture sequence |
| `dragTo(target)` | Measures both elements and fires a PanResponder drag |
| `scrollTo(offset)` | Scrolls the element vertically to the given px offset |
| `scrollToX(offset)` | Scrolls the element horizontally to the given px offset |
| `text()` | Concatenated HostText descendants |
| `inputValue()` | `memoizedProps.value ?? defaultValue ?? ''` — for TextInput |
| `prop(name)` | Single named prop from `memoizedProps` |
| `props()` | All serializable `memoizedProps` + `accessibilityState` |
| `exists()` | Re-queries by testID; `false` if not found |
| `isEnabled()` | `false` if `disabled` or `accessibilityState.disabled` |
| `isChecked()` | `!!memoizedProps.value` — for Switch/checkbox |
| `isVisible()` | Alias for `exists()` |
| `isFocused()` | `true` if `accessibilityState.focused` |
| `getFrame()` | `{ x, y, width, height }` via `stateNode.measure()` |
| `find(selector)` | Scoped query within this element's subtree |
| `findAll(selector)` | Scoped query — all matches within this element's subtree |

### `expect`

When passed a primitive or object, returns a **sync** `Assertion`:

```ts
expect(value).toBe(x)             // Object.is
expect(value).toEqual(x)          // JSON.stringify deep equal
expect(value).toContain(x)        // string includes or array includes
expect(value).toMatchObject(obj)  // partial key match
expect(value).toBeTruthy() / toBeFalsy() / toBeNull() / toBeUndefined()
expect(value).toBeGreaterThan(n) / toBeGreaterThanOrEqual(n)
expect(value).toBeLessThan(n) / toBeLessThanOrEqual(n)
expect(value).toHaveLength(n)
expect(props).toHaveAccessibilityLabel(label)
expect(props).toHaveAccessibilityRole(role)
expect(value).not.<matcher>()     // negation
```

When passed an `Element`, returns an **async auto-waiting** `AsyncElementExpect` that polls every 250 ms until the assertion passes or times out (default 4 000 ms):

```ts
await expect(element).toHaveText('Done')       // string or RegExp
await expect(element).toHaveValue('Jane Doe')  // for inputs
await expect(element).toBeVisible()
await expect(element).toBeEnabled()
await expect(element).not.toHaveText('Error')
await expect(element).toHaveText('Done', { timeout: 8_000 })
```

---

## Caveats

- **Node IDs are invalidated after `reset()`** — never hold an `Element` reference across test boundaries; always re-query.
- **The bridge script is evaluated fresh each `reset()`** — any global test state inside the app is wiped.
- **CJS build only** — currently compiles to CommonJS so it can be required by `tsx` in projects without `"type": "module"`. A dual CJS+ESM build will be needed before publishing to npm.
- **Android requires a connected device or emulator** — run `adb reverse tcp:8081 tcp:8081` if Metro isn't reachable (the runner does this automatically on launch).
