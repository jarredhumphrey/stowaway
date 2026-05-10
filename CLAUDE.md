# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Stowaway is a zero-dependency E2E testing framework for React Native apps. It connects to the running app via the Hermes CDP (Chrome DevTools Protocol) bridge that Metro exposes on port 8081, then traverses the React fiber tree directly to find elements and trigger interactions — no Appium, no coordinate math, no YAML.

It was extracted from the `phonics-pokedex` project and is consumed by it via a `file:../stowaway` dependency while under active development.

## Commands

```bash
nvm use 22          # Node 22 required

npm install
npm run build       # tsc → dist/
npm run build:watch # incremental watch during active dev
npm run typecheck   # tsc --noEmit, no emit
npm run clean       # rm -rf dist
```

> **Important:** phonics-pokedex consumes `dist/`, not `src/`. Any change here requires a rebuild before running E2E tests in the consuming project.

## Architecture

```
src/
  index.ts              ← single public entry point (re-exports everything)
  config.ts             ← E2EConfig interface + loadConfig() from env vars
  framework/
    Device.ts           ← xcrun simctl (iOS) and adb (Android) wrappers
    HermesSession.ts    ← CDP WebSocket client; Runtime.evaluate against Hermes
    AppSession.ts       ← orchestrates Device + HermesSession; public test API
    Element.ts          ← proxy for a single fiber node (tap, text, exists, props, find/findAll)
    selectors.ts        ← Selector type + JS expression builders (global + within-scoped)
    TestRunner.ts       ← describe/it/beforeAll/etc + runner loop + result output
    expect.ts           ← custom assertion library; throws AssertionError on failure
  bridge/
    injector.ts         ← BRIDGE_INJECTOR_SCRIPT: a JS string (IIFE) that installs
                          globalThis.__testBridge__ inside the Hermes engine
```

### How the bridge works

1. `HermesSession.connect()` fetches `http://localhost:8081/json`, finds the page with a `webSocketDebuggerUrl`, and opens a WebSocket to it. It polls up to 60 s — Metro must be running first.
2. `AppSession.start()` / `reset()` calls `HermesSession.evaluate(BRIDGE_INJECTOR_SCRIPT)` to install `__testBridge__` inside the app's JS engine.
3. `__testBridge__` uses `__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers` + `getFiberRoots(rendererId)` to walk the fiber tree. It never walks `fiber.return` (avoids cycles); only `fiber.child` and `fiber.sibling`.
4. `tap()` walks up via `fiber.return` to find the nearest `onPress`, then calls it directly with `{ nativeEvent: {} }`.
5. `getText()` collects fiber tag-6 (HostText) `memoizedProps` strings from a node's subtree.

### AppSession lifecycle

- `start()` — init device, launch app, connect CDP, inject bridge. Called once per run.
- `reset()` — disconnect, terminate app, relaunch, reconnect, re-inject. Called before every test.
- `stop()` — disconnect + terminate. Called in `finally` after the run.

Node IDs in `__testBridge__` are indices into a per-injection registry array — they are invalidated after every `reset()`. Never cache `Element` references across test boundaries.

### AppSession query API

The `Selector` union used by `find` / `findAll`:

```ts
type Selector =
  | { testID: string }
  | { component: string; props?: Record<string, unknown> }
  | { text: string; exact?: boolean }              // exact defaults to true; false = substring match
  | { text: RegExp }                               // regex match
  | { accessibilityLabel: string; exact?: boolean } // exact defaults to true; false = substring match
  | { accessibilityRole: string }                  // matches memoizedProps.accessibilityRole
  | { placeholder: string; exact?: boolean }       // matches memoizedProps.placeholder on TextInput etc.
```

Key methods on `AppSession`:

| Method | Behaviour |
|--------|-----------|
| `find(selector)` | First visible match; throws if none. Filters out fibers under `activityState === 0` (fully inactive react-native-screens) or `style.display === 'none'`. State 1 (transitioning/below-top) and Animated values are not rejected. |
| `findAll(selector)` | All visible matches; empty array if none. Same visibility filter as `find`. |
| `findNth(selector, n)` | Returns the nth (0-based) match from `findAll`; throws if out of range |
| `waitForElement(selector \| testID, opts?)` | Resolves on the first React commit containing a visible match (uses `Runtime.addBinding` + `onCommitFiberRoot`); polling fallback at `interval`. String argument treated as `{ testID }`. |
| `waitForElementToDisappear(selector \| testID, opts?)` | Polls until the element leaves the committed tree; string treated as `{ testID }` |
| `waitFor(fn, opts?)` | Polls an arbitrary `() => Promise<boolean>` until `timeout` ms |
| `getTree(maxDepth?)` | Returns the serialized fiber tree (default depth 30) — raw data |
| `printTree(maxDepth?)` | Prints the fiber tree to stdout, one line per node (`ComponentName [testID]`), indented by depth — preferred for debugging missing testIDs |
| `printVisibleTree(maxDepth?)` | Like `printTree` but prunes inactive screen subtrees and `display:none` nodes from the output |
| `scrollAndFind(testID, opts?)` | Scrolls a visible FlatList/ScrollView in 5 000-px steps, polling after each until `testID` appears |
| `screenshot(name)` | Saves `<testResultsDir>/<name>-<timestamp>.png` |
| `dismissKeyboard()` | Blurs the first TextInput found in the tree |
| `pressBack()` | Android only — sends keyevent 4 |
| `openURL(url)` | iOS: `xcrun simctl openurl`; Android: `am start VIEW` |
| `setLocation(lat, lng)` | iOS: `xcrun simctl location set`; Android: not implemented |
| `setPermission(service, status)` | iOS: `xcrun simctl privacy`; Android: `pm grant/revoke` |
| `disableAnimations()` | Patches `Animated.timing/spring/decay` to `duration: 0`; no-ops `LayoutAnimation`. Call in `beforeAll` to reduce timing flakiness. Re-apply after each `reset()` if needed. |
| `waitForInteractions(opts?)` | Sleeps `delay` ms (default 500) on the test runner side. Use after `waitForElement` to let native-driven nav animations finish. No bridge eval — pure Node-side delay. |
| `setStorage(key, value)` | Writes a string to AsyncStorage. Throws if `@react-native-async-storage/async-storage` is not bundled. |
| `getStorage(key)` | Reads a string from AsyncStorage; returns `null` if absent. |
| `removeStorage(key)` | Deletes a key from AsyncStorage. |
| `clearStorage()` | Clears all AsyncStorage keys. |
| `setNetworkOffline(offline)` | When `true`, all `fetch` calls reject with a network error (requests are still logged). Automatically reset to `false` after each `reset()`. |
| `waitForRequest(matcher, opts?)` | Polls until a request matching `matcher` (string, RegExp, or `NetworkMatcher`) appears in the log; returns the entry |
| `waitForResponse(matcher, opts?)` | Same but waits until the response has settled; returned entry includes `status` and `responseBody` |
| `step(name, fn)` | Runs `fn` as a named step; prefixes the error message with `[name]` on failure; prints the name in verbose mode |
| `clock.install(baseTime?)` | Patches `setTimeout`/`setInterval`/`Date.now` in Hermes to use fake time |
| `clock.tick(ms)` | Advances fake time by `ms`, firing all queued callbacks in chronological order |
| `clock.restore()` | Restores real timers; called automatically on `reset()` (new Hermes context) |
| `clock.now()` | Returns current fake timestamp |
| `startRecording(name?)` | Starts video recording; saves to `<testResultsDir>/<name>-<timestamp>.mp4` (both platforms) |
| `stopRecording()` | Stops recording and returns the file path |
| `pushNotification(payload)` | iOS only — delivers a push via `xcrun simctl push`; payload follows APNS format |
| `setStatusBar(opts)` | iOS only — overrides status bar fields (time, battery, wifi, cellular, operator) via `xcrun simctl status_bar`; no-op on Android |
| `resetStatusBar()` | iOS only — clears all status bar overrides; no-op on Android |
| `setClipboard(text)` | iOS only — writes to the macOS host clipboard (synced with simulator by default) |
| `getClipboard()` | iOS only — reads from the macOS host clipboard |
| `setOrientation(orientation)` | `'portrait'` or `'landscape'`. iOS: queries bridge for current `Dimensions` then sends one AppleScript key code to the Simulator (requires accessibility access for System Events). Android: `adb settings put system user_rotation`. Waits 400 ms after rotate on iOS for layout to propagate. |
| `setBiometricEnrollment(enrolled)` | iOS only — enrolls (`true`) or un-enrolls (`false`) the biometric sensor via `xcrun simctl biometricEnrollment`. No-op on Android. Requires Xcode 12+. |
| `matchBiometric()` | iOS only — simulates a successful biometric match via `xcrun simctl biometric <udid> match`. Throws on Android. |
| `rejectBiometric()` | iOS only — simulates a failed biometric attempt via `xcrun simctl biometric <udid> nomatch`. Throws on Android. |
| `isAppRunning()` | Returns `true` if the app process is alive (`pgrep -f <bundleId>` on iOS, `adb shell pidof` on Android). Useful after a "CDP connection lost" error to confirm a crash. |

### Element API

`find` / `findAll` return `Element` instances. Methods:

| Method | Behaviour |
|--------|-----------|
| `find(selector)` | Scoped query — first match within this element's subtree; throws if none |
| `findAll(selector)` | Scoped query — all matches within this element's subtree; empty array if none |
| `tap()` | Calls nearest ancestor `onPress` with `{ nativeEvent: {} }`; throws if not found |
| `doubleTap()` | Fires `onDoublePress`/`onDoubleTap` if present; otherwise calls `onPress` twice. Covers manual double-tap counting patterns. |
| `longPress()` | Calls nearest ancestor `onLongPress`; throws if not found |
| `typeText(text)` | Calls `onChangeText` prop; throws if not found |
| `clearText()` | `typeText('')` |
| `pressKey(key)` | Fires `onKeyPress({ nativeEvent: { key } })` on the nearest ancestor with that handler. Common keys: `'Enter'`, `'Backspace'`, `'Tab'`. Throws if no handler found. |
| `focus()` | Calls `onFocus` prop or `stateNode.focus()` |
| `blur()` | Calls `onBlur` prop or `stateNode.blur()` |
| `submitEditing()` | Calls `onSubmitEditing` prop |
| `scrollTo(offset)` | Scrolls element vertically to `offset` px |
| `scrollToX(offset)` | Scrolls element horizontally to `offset` px (FlatList or ScrollView) |
| `swipe(direction, distance?)` | Fires a PanResponder gesture sequence (grant → 10 move steps → release). `direction`: `'left' \| 'right' \| 'up' \| 'down'`; `distance` defaults to 100 px. Throws if no `onResponderGrant` handler is found in the ancestor chain. |
| `dragTo(target)` | Measures frames of source + target via `getFrame()`, computes center-to-center dx/dy, then fires the same PanResponder sequence as `swipe()`. Useful for sortable lists, Kanban boards, etc. |
| `check()` | Calls `onValueChange(true)` on the nearest ancestor with that handler. For Switch / Checkbox / custom toggles. Throws if not found. |
| `uncheck()` | Calls `onValueChange(false)`. Throws if no handler found. |
| `isChecked()` | Returns `!!memoizedProps.value` — reads the controlled boolean value of a Switch or similar. |
| `selectOption(value)` | Calls `onValueChange(value)` on the nearest ancestor with that handler. Works with any component that uses `onValueChange` (custom pickers, segmented controls, etc.). Throws if not found. |
| `setDate(date)` | Fires `onDateChange`, `onChange` (with synthetic event), or `onConfirm` on the nearest ancestor. Works with `DatePickerIOS`, `@react-native-community/datetimepicker`, and modal-style pickers. |
| `slideToValue(value)` | Fires `onValueChange(value)` then `onSlidingComplete(value)` on the nearest ancestor with `onValueChange`. Works with `@react-native-community/slider`. |
| `parent()` | Returns the nearest meaningful ancestor (named composite component or native HostComponent); skips anonymous HOC wrappers, Context providers, Fragments. Throws if none found. |
| `siblings()` | Returns all fiber siblings (nodes that share the same parent), excluding the element itself. |
| `sibling(selector)` | Returns the first sibling matching `selector`; throws if none found. Supports all `Selector` types. |
| `nextSibling()` | Returns the immediately following sibling in fiber order, or `null` if none. |
| `prevSibling()` | Returns the immediately preceding sibling in fiber order, or `null` if none. |
| `closest(selector)` | Walks up the ancestor chain (via `fiber.return`) and returns the first ancestor matching `selector`. Supports all `Selector` types including `RegExp` text matching. Throws if no match found before the root. |
| `text()` | Concatenates all HostText (fiber tag-6) descendants |
| `inputValue()` | Returns `memoizedProps.value ?? memoizedProps.defaultValue ?? ''` — reads the controlled/uncontrolled value of a TextInput without relying on HostText children |
| `exists()` | Re-queries by `testID`; always false if no testID |
| `prop(name)` | Returns a single named prop from `memoizedProps` — sugar over `(await el.props())[name]` |
| `props()` | Returns serializable memoizedProps + `accessibilityState` |
| `isEnabled()` | `false` if `disabled` or `accessibilityState.disabled` |
| `isVisible()` | Delegates to `exists()` |
| `isFocused()` | `true` if `accessibilityState.focused` |
| `getFrame()` | `{ x, y, width, height }` via `stateNode.measure()` |

### expect matchers

When passed a primitive/object, `expect()` returns a **sync** `Assertion`:

```ts
expect(value).toBe(expected)                      // Object.is equality
expect(value).toEqual(expected)                    // JSON.stringify equality
expect(value).toContain(item)                      // string includes or array includes
expect(value).toMatchObject(partial)               // partial key match
expect(value).toBeTruthy()
expect(value).toBeFalsy()
expect(value).toBeNull()
expect(value).toBeUndefined()
expect(value).toBeGreaterThan(n)
expect(value).toBeGreaterThanOrEqual(n)
expect(value).toBeLessThan(n)
expect(value).toBeLessThanOrEqual(n)
expect(value).toHaveLength(n)
expect(await el.props()).toHaveAccessibilityLabel(label)
expect(await el.props()).toHaveAccessibilityRole(role)
expect(value).not.<matcher>()                      // negation
```

When passed an `Element`, `expect()` returns an **async auto-waiting** `AsyncElementExpect` that polls at 250 ms intervals until the assertion passes or the timeout (default 4 000 ms) expires:

```ts
await expect(element).toHaveText(expected)         // string or RegExp; polls until text matches
await expect(element).toHaveValue(expected)        // polls until inputValue() matches
await expect(element).toBeVisible()                // polls until isVisible() is true
await expect(element).toBeEnabled()                // polls until isEnabled() is true
await expect(element).toBeDisabled()               // polls until isEnabled() is false
await expect(element).toBeHidden()                 // polls until isVisible() is false
await expect(element).toBeChecked()                // polls until isChecked() is true
await expect(element).toHaveFocus()                // polls until isFocused() is true
await expect(element).not.toHaveText('wrong')      // negation; passes as soon as condition is false
// All async matchers accept an optional opts: { timeout?: number }
await expect(element).toHaveText('Done', { timeout: 8_000 })
```

Failures throw `AssertionError`, which the runner catches and marks as a test failure.

`expect.soft(value)` works like `expect(value)` but queues failures instead of throwing. All queued failures are reported together at the end of the test. Hard failures (throws) win over soft failures. Supports the full sync and async matcher API including `.not`.

```ts
expect.soft(await label.text()).toBe('Done');   // queued on failure, test continues
await expect.soft(element).toBeVisible();        // async soft assertion
```

### `__testBridge__` bridge surface

The IIFE installs `globalThis.__testBridge__` with these methods. Extend `injector.ts` to add new bridge capabilities.

| Method | Returns |
|--------|---------|
| `findByTestID(testID)` | `NodeDescriptor \| null` |
| `findByComponent(name, props?)` | `NodeDescriptor[]` |
| `findByAccessibilityLabel(label, exact)` | `NodeDescriptor[]` — `exact=true` strict equality, `exact=false` substring |
| `findByAccessibilityRole(role)` | `NodeDescriptor[]` — matches `memoizedProps.accessibilityRole`; HOC-deduped |
| `findByPlaceholder(placeholder, exact)` | `NodeDescriptor[]` — matches `memoizedProps.placeholder`; skips HostComponents; HOC-deduped |
| `findByTestIDWithin(rootNodeId, testID)` | `NodeDescriptor \| null` — scoped to subtree of `rootNodeId` |
| `findByComponentWithin(rootNodeId, name, props?)` | `NodeDescriptor[]` — scoped to subtree of `rootNodeId` |
| `findByAccessibilityLabelWithin(rootNodeId, label, exact)` | `NodeDescriptor[]` — scoped to subtree of `rootNodeId` |
| `findByAccessibilityRoleWithin(rootNodeId, role)` | `NodeDescriptor[]` — scoped to subtree of `rootNodeId` |
| `findByPlaceholderWithin(rootNodeId, placeholder, exact)` | `NodeDescriptor[]` — scoped to subtree of `rootNodeId` |
| `tap(nodeId)` | `boolean` |
| `doubleTap(nodeId)` | `boolean` — fires `onDoublePress`/`onDoubleTap` if found, else `onPress` twice |
| `longPress(nodeId)` | `boolean` |
| `typeText(nodeId, text)` | `boolean` |
| `focus(nodeId)` / `blur(nodeId)` | `boolean` |
| `submitEditing(nodeId)` | `boolean` |
| `getText(nodeId)` | `string` |
| `getInputValue(nodeId)` | `string` — reads `memoizedProps.value ?? defaultValue ?? ''` |
| `exists(testID)` | `boolean` |
| `isEnabled(nodeId)` / `isFocused(nodeId)` | `boolean` |
| `getFrame(nodeId)` | `Promise<{x,y,width,height} \| null>` |
| `scrollToOffset(offset)` | `boolean` (global — tries VirtualizedList → FlatList → ScrollView) |
| `scrollElement(nodeId, offset)` | `boolean` (vertical, scoped to node) |
| `scrollElementToX(nodeId, xOffset)` | `boolean` (horizontal, scoped to node) |
| `swipe(nodeId, direction, distance)` | `boolean` — fires PanResponder grant/move/release lifecycle |
| `dragFromTo(nodeId, dx, dy)` | `boolean \| string` — same PanResponder sequence as `swipe()` but with explicit dx/dy |
| `pressKey(nodeId, key)` | `boolean` — fires `onKeyPress({ nativeEvent: { key } })` on nearest ancestor handler |
| `isChecked(nodeId)` | `boolean` — reads `!!memoizedProps.value` |
| `setChecked(nodeId, checked)` | `boolean` — calls `onValueChange(checked)` on nearest ancestor |
| `selectOption(nodeId, value)` | `boolean` — calls `onValueChange(value)` on nearest ancestor |
| `dismissKeyboard()` | `boolean` |
| `getTree(maxDepth?, activeOnly?)` | serialized tree — useful for debugging testIDs. Pass `activeOnly=true` to prune inactive screen subtrees and `display:none` nodes |
| `isElementActive(nodeId)` | `boolean` — walks `fiber.return` rejecting fibers with numeric `activityState === 0` or `style.display === 'none'`. Used internally by `find`/`findAll`/`waitForElement` to filter visibility |
| `getParent(nodeId)` | `NodeDescriptor \| null` — nearest meaningful ancestor (skips HOC wrappers, Context, Fragments) |
| `getSiblings(nodeId)` | `NodeDescriptor[]` — all fiber siblings excluding the node itself |
| `getNextSibling(nodeId)` | `NodeDescriptor \| null` — immediately following sibling in fiber order |
| `getPreviousSibling(nodeId)` | `NodeDescriptor \| null` — immediately preceding sibling in fiber order |
| `closest(nodeId, type, value, exact, regexFlags?)` | `NodeDescriptor \| null` — walks `fiber.return` chain checking `matchesSelectorType`; stops at HostRoot |

### TestRunner registration model

`describe()` and `it()` are synchronous module-level calls. Spec files are dynamically imported by `TestRunner.run()`; the side effects of the imports register all suites. `describe()` uses a stack so nested describes flatten into the parent with prefixed test names.

Both `describe` and `it` support `.skip` and `.only` modifiers:

```ts
it.skip('name', fn)          // always skipped; shown as ↷ in output
it.only('name', fn)          // run only this test in its suite (others implicitly skipped)
describe.skip('name', fn)    // skip entire suite
describe.only('name', fn)    // run only this suite

it('name', fn, { timeout: 5_000 })   // per-test timeout override (ms)
it('name', fn, { retries: 2 })       // retry up to 2 extra times on failure
```

On failure, a screenshot is automatically captured to `<testResultsDir>/failure-<slug>-<ts>.png`.
Results are written as both JSON (`e2e-results-*.json`) and JUnit XML (`e2e-results-*.xml`).

### Config

All config comes from environment variables, read once at startup by `loadConfig()`:

| Var | Default | Notes |
|-----|---------|-------|
| `PLATFORM` | `ios` | `ios` or `android` |
| `BUNDLE_ID` | required | throws if absent |
| `METRO_PORT` | `8081` | |
| `TEST_RESULTS_DIR` | `test-results` | |
| `DEFAULT_TIMEOUT` | `10000` | ms |
| `SUITE_NAME` | — | printed in the run header |
| `VERBOSE` | `false` | `1` or `true` enables step-level logging; also enabled by `--verbose` CLI flag |

`pollInterval` (250 ms) is not configurable via env — set directly in `loadConfig()` return.

### Platform notes

- **iOS**: `Device.init()` finds a booted simulator via `xcrun simctl list devices --json`. One must already be booted.
- **Android**: `Device.launch()` calls `adb reverse tcp:<port> tcp:<port>` automatically before launching the app. A connected emulator or device must be authorized.

## Build output

`"module": "CommonJS"` in tsconfig — CJS output so consuming projects running `tsx` without `"type": "module"` can require it. When this package is eventually published, switch to a dual CJS+ESM build (e.g. with `tsup`).

## Current consumer

`phonics-pokedex` (`file:../stowaway`) is the only consumer. Its thin wrapper at `test/e2e/config.ts` calls `baseLoadConfig()` from stowaway and adds `suiteName: 'PhonicDex E2E'`. The spec files import `describe`, `it`, and `expect` directly from `'stowaway'`.
