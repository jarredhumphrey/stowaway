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
    Element.ts          ← proxy for a single fiber node (tap, text, exists, props)
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
  | { text: string; exact?: boolean }   // exact defaults to true; false = substring match
  | { text: RegExp }                     // regex match
```

Key methods on `AppSession`:

| Method | Behaviour |
|--------|-----------|
| `find(selector)` | First match; throws if none |
| `findAll(selector)` | All matches; empty array if none |
| `waitForElement(testID, opts?)` | Polls `find({ testID })` until `timeout` ms |
| `waitForElementToDisappear(testID, opts?)` | Polls until the element leaves the committed tree |
| `waitFor(fn, opts?)` | Polls an arbitrary `() => Promise<boolean>` until `timeout` ms |
| `scrollAndFind(testID, opts?)` | Scrolls a visible FlatList/ScrollView in 5 000-px steps, polling after each until `testID` appears |
| `screenshot(name)` | Saves `<testResultsDir>/<name>-<timestamp>.png` |
| `dismissKeyboard()` | Blurs the first TextInput found in the tree |
| `pressBack()` | Android only — sends keyevent 4 |
| `openURL(url)` | iOS: `xcrun simctl openurl`; Android: `am start VIEW` |
| `setLocation(lat, lng)` | iOS: `xcrun simctl location set`; Android: not implemented |
| `setPermission(service, status)` | iOS: `xcrun simctl privacy`; Android: `pm grant/revoke` |
| `disableAnimations()` | Patches `Animated.timing/spring/decay` to `duration: 0`; no-ops `LayoutAnimation`. Call in `beforeAll` to reduce timing flakiness. Re-apply after each `reset()` if needed. |
| `setStorage(key, value)` | Writes a string to AsyncStorage. Throws if `@react-native-async-storage/async-storage` is not bundled. |
| `getStorage(key)` | Reads a string from AsyncStorage; returns `null` if absent. |
| `removeStorage(key)` | Deletes a key from AsyncStorage. |
| `clearStorage()` | Clears all AsyncStorage keys. |

### Element API

`find` / `findAll` return `Element` instances. Methods:

| Method | Behaviour |
|--------|-----------|
| `tap()` | Calls nearest ancestor `onPress` with `{ nativeEvent: {} }`; throws if not found |
| `longPress()` | Calls nearest ancestor `onLongPress`; throws if not found |
| `typeText(text)` | Calls `onChangeText` prop; throws if not found |
| `clearText()` | `typeText('')` |
| `focus()` | Calls `onFocus` prop or `stateNode.focus()` |
| `blur()` | Calls `onBlur` prop or `stateNode.blur()` |
| `submitEditing()` | Calls `onSubmitEditing` prop |
| `scrollTo(offset)` | Scrolls element vertically to `offset` px |
| `scrollToX(offset)` | Scrolls element horizontally to `offset` px (FlatList or ScrollView) |
| `swipe(direction, distance?)` | Fires a PanResponder gesture sequence (grant → 10 move steps → release). `direction`: `'left' \| 'right' \| 'up' \| 'down'`; `distance` defaults to 100 px. Throws if no `onResponderGrant` handler is found in the ancestor chain. |
| `text()` | Concatenates all HostText (fiber tag-6) descendants |
| `exists()` | Re-queries by `testID`; always false if no testID |
| `props()` | Returns serializable memoizedProps + `accessibilityState` |
| `isEnabled()` | `false` if `disabled` or `accessibilityState.disabled` |
| `isVisible()` | Delegates to `exists()` |
| `isFocused()` | `true` if `accessibilityState.focused` |
| `getFrame()` | `{ x, y, width, height }` via `stateNode.measure()` |

### expect matchers

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

Failures throw `AssertionError`, which the runner catches and marks as a test failure.

### `__testBridge__` bridge surface

The IIFE installs `globalThis.__testBridge__` with these methods. Extend `injector.ts` to add new bridge capabilities.

| Method | Returns |
|--------|---------|
| `findByTestID(testID)` | `NodeDescriptor \| null` |
| `findByComponent(name, props?)` | `NodeDescriptor[]` |
| `tap(nodeId)` | `boolean` |
| `longPress(nodeId)` | `boolean` |
| `typeText(nodeId, text)` | `boolean` |
| `focus(nodeId)` / `blur(nodeId)` | `boolean` |
| `submitEditing(nodeId)` | `boolean` |
| `getText(nodeId)` | `string` |
| `exists(testID)` | `boolean` |
| `isEnabled(nodeId)` / `isFocused(nodeId)` | `boolean` |
| `getFrame(nodeId)` | `Promise<{x,y,width,height} \| null>` |
| `scrollToOffset(offset)` | `boolean` (global — tries VirtualizedList → FlatList → ScrollView) |
| `scrollElement(nodeId, offset)` | `boolean` (vertical, scoped to node) |
| `scrollElementToX(nodeId, xOffset)` | `boolean` (horizontal, scoped to node) |
| `swipe(nodeId, direction, distance)` | `boolean` — fires PanResponder grant/move/release lifecycle |
| `dismissKeyboard()` | `boolean` |
| `getTree(maxDepth?)` | serialized tree — useful for debugging testIDs |

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

`pollInterval` (250 ms) is not configurable via env — set directly in `loadConfig()` return.

### Platform notes

- **iOS**: `Device.init()` finds a booted simulator via `xcrun simctl list devices --json`. One must already be booted.
- **Android**: `Device.launch()` calls `adb reverse tcp:<port> tcp:<port>` automatically before launching the app. A connected emulator or device must be authorized.

## Build output

`"module": "CommonJS"` in tsconfig — CJS output so consuming projects running `tsx` without `"type": "module"` can require it. When this package is eventually published, switch to a dual CJS+ESM build (e.g. with `tsup`).

## Current consumer

`phonics-pokedex` (`file:../stowaway`) is the only consumer. Its thin wrapper at `test/e2e/config.ts` calls `baseLoadConfig()` from stowaway and adds `suiteName: 'PhonicDex E2E'`. The spec files import `describe`, `it`, and `expect` directly from `'stowaway'`.
