# stowaway

E2E testing framework for React Native apps. Connects to the running app via the Hermes CDP bridge exposed by Metro, traverses the React fiber tree to find elements, and triggers interactions directly — no Appium, no coordinate math, no YAML.

**Status:** Early development. Currently consumed by a single project via a `file:` path dependency.

---

## Documentation

| Guide | What's covered |
|---|---|
| [Getting Started](./docs/getting-started.md) | Installation, config, writing your first test, entry point setup |
| [Querying](./docs/querying.md) | `find`, `findAll`, `waitForElement`, `waitFor`, `scrollAndFind`, selectors, reading element state |
| [Interactions](./docs/interactions.md) | `tap`, `longPress`, `typeText`, `focus`, `blur`, `scrollTo`, device actions, screenshots |
| [Network Mocking](./docs/network-mocking.md) | `mockNetwork`, `networkRequests`, `clearNetworkMocks`, scope rules, URL matching |
| [Assertions](./docs/assertions.md) | All `expect` matchers with examples, negation, accessibility matchers |
| [Test Organisation](./docs/test-organisation.md) | `describe`, `it`, hooks, `.skip`, `.only`, per-test timeout, retries |
| [Results & CI](./docs/results.md) | Console output, JSON results, JUnit XML, failure screenshots, CI integration |

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
| `SLOW_REPLAY` | — | `1` or `true` — adds a delay between steps in failure replay videos |
| `SLOW_REPLAY_DELAY` | `800` | Delay in ms between steps when `SLOW_REPLAY` is enabled |

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
| `getTree(maxDepth?)` | Returns the serialized fiber tree |
| `printTree(maxDepth?)` | Prints the fiber tree to stdout — preferred for debugging missing testIDs |

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

### `AppSession` interactions

| Method | Description |
|--------|-------------|
| `screenshot(name)` | Saves `<testResultsDir>/<name>-<timestamp>.png` |
| `dismissKeyboard()` | Blurs the first TextInput in the tree |
| `disableAnimations()` | Patches `Animated` to zero duration — call in `beforeAll` to reduce flakiness |
| `step(name, fn)` | Runs `fn` as a named step; prefixes the error message with `[name]` on failure |

**Network:**

| Method | Description |
|--------|-------------|
| `setNetworkOffline(offline)` | When `true`, all `fetch` calls reject with a network error |
| `mockNetwork(matcher, response)` | Intercepts matching `fetch` calls and returns a controlled response |
| `networkRequests()` | Returns all intercepted requests since the last app launch |
| `clearNetworkMocks()` | Wipes all mocks and the request log |
| `waitForRequest(matcher, opts?)` | Polls until a matching request appears in the log |
| `waitForResponse(matcher, opts?)` | Same but waits until the response has settled |

**Storage:**

| Method | Description |
|--------|-------------|
| `setStorage(key, value)` | Writes a string to AsyncStorage |
| `getStorage(key)` | Reads a string from AsyncStorage (`null` if absent) |
| `removeStorage(key)` | Deletes a key from AsyncStorage |
| `clearStorage()` | Clears all AsyncStorage keys |

**Fake timers:**

| Method | Description |
|--------|-------------|
| `clock.install(baseTime?)` | Patches `setTimeout`/`setInterval`/`Date.now` in Hermes to use fake time |
| `clock.tick(ms)` | Advances fake time, firing all queued callbacks in order |
| `clock.restore()` | Restores real timers (called automatically on `reset()`) |
| `clock.now()` | Returns current fake timestamp |

**Device state:**

| Method | Description |
|--------|-------------|
| `pressBack()` | Android only — sends hardware Back key |
| `openURL(url)` | Opens a URL via the OS deep-link mechanism |
| `setLocation(lat, lng)` | Simulates GPS location (iOS only) |
| `setPermission(service, status)` | Grants/revokes/resets a system permission |
| `setOrientation(orientation)` | `'portrait'` or `'landscape'` — iOS via AppleScript, Android via adb |
| `startRecording(name?)` | Starts video recording; saves to `<testResultsDir>/<name>-<timestamp>.mp4` |
| `stopRecording()` | Stops recording and returns the file path |
| `pushNotification(payload)` | iOS only — delivers a push via `xcrun simctl push`; payload follows APNS format |
| `setStatusBar(opts)` | iOS only — overrides status bar fields (time, battery, wifi, etc.) |
| `resetStatusBar()` | iOS only — clears all status bar overrides |
| `setClipboard(text)` | iOS only — writes to the host clipboard (synced with simulator) |
| `getClipboard()` | iOS only — reads from the host clipboard |
| `setBiometricEnrollment(enrolled)` | iOS only — enrolls or un-enrolls the biometric sensor |
| `matchBiometric()` | iOS only — simulates a successful biometric match |
| `rejectBiometric()` | iOS only — simulates a failed biometric attempt |
| `isAppRunning()` | Returns `true` if the app process is alive — useful after a CDP connection loss |

### `Element`

**Interactions:**

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
| `setDate(date)` | Fires `onDateChange`, `onChange`, or `onConfirm` — for date pickers |
| `slideToValue(value)` | Fires `onValueChange` then `onSlidingComplete` — for sliders |
| `swipe(direction, distance?)` | Fires a PanResponder gesture sequence |
| `dragTo(target)` | Measures both elements and fires a PanResponder drag |
| `scrollTo(offset)` | Scrolls the element vertically to the given px offset |
| `scrollToX(offset)` | Scrolls the element horizontally to the given px offset |

**Reading state:**

| Method | Description |
|--------|-------------|
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

**Tree traversal:**

| Method | Description |
|--------|-------------|
| `find(selector)` | Scoped query within this element's subtree |
| `findAll(selector)` | Scoped query — all matches within this element's subtree |
| `parent()` | Nearest meaningful ancestor; skips HOC wrappers and Fragments |
| `siblings()` | All fiber siblings excluding this element |
| `sibling(selector)` | First sibling matching `selector` — throws if none found |
| `nextSibling()` | Immediately following sibling in fiber order, or `null` |
| `prevSibling()` | Immediately preceding sibling in fiber order, or `null` |
| `closest(selector)` | Walks up `fiber.return` and returns the first ancestor matching `selector` |

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

`expect.soft(value)` works like `expect(value)` but queues failures instead of throwing immediately. All queued failures are reported together at the end of the test:

```ts
expect.soft(await label.text()).toBe('Done');  // continues even if this fails
await expect.soft(element).toBeVisible();
```

---

## Caveats

- **Node IDs are invalidated after `reset()`** — never hold an `Element` reference across test boundaries; always re-query.
- **The bridge script is evaluated fresh each `reset()`** — any global test state inside the app is wiped.
- **CJS build only** — currently compiles to CommonJS so it can be required by `tsx` in projects without `"type": "module"`. A dual CJS+ESM build will be needed before publishing to npm.
- **Android requires a connected device or emulator** — run `adb reverse tcp:8081 tcp:8081` if Metro isn't reachable (the runner does this automatically on launch).
