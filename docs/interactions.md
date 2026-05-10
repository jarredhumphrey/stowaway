# Interactions

All interaction methods communicate with the live Hermes engine. They call React prop handlers directly — there is no coordinate math, no gesture system, and no native event dispatch involved.

---

## Tapping

### `element.tap()`

Walks up the fiber tree from the element to find the nearest ancestor with an `onPress` prop, then calls it with `{ nativeEvent: {} }`. Throws if no `onPress` is found.

```ts
const btn = await app.find({ testID: 'btn-submit' });
await btn.tap();
```

Works on `TouchableOpacity`, `TouchableHighlight`, `Pressable`, and any component that accepts `onPress`.

### `element.longPress()`

Same as `tap()` but calls `onLongPress`. Throws if no `onLongPress` is found.

```ts
const item = await app.find({ testID: 'list-item-0' });
await item.longPress();
await app.waitForElement('context-menu');
```

### `element.doubleTap()`

Fires `onDoublePress` or `onDoubleTap` if found on the nearest ancestor. Falls back to calling `onPress` twice for apps that count rapid taps manually. Throws if no press handler is found.

```ts
const image = await app.find({ testID: 'photo-item' });
await image.doubleTap();
await app.waitForElement('like-indicator');
```

---

## Text input

### `element.typeText(text)`

Calls `onChangeText` on the element or the nearest ancestor that has it, simulating a user typing the full string at once. Throws if no `onChangeText` is found.

```ts
const input = await app.find({ testID: 'input-email' });
await input.typeText('user@example.com');

const props = await input.props();
expect(props.value).toBe('user@example.com');
```

`typeText` replaces the current value — it does not append. If you want to append, read the current value from `props()` and pass the combined string.

### `element.clearText()`

Calls `typeText('')`. Equivalent to selecting all and deleting.

```ts
await input.clearText();
expect((await input.props()).value).toBe('');
```

### `element.submitEditing()`

Calls `onSubmitEditing`, simulating the user pressing the return/submit key on the keyboard.

```ts
const input = await app.find({ testID: 'input-search' });
await input.typeText('coffee');
await input.submitEditing();
await app.waitForElement('search-results');
```

### `element.pressKey(key)`

Fires `onKeyPress({ nativeEvent: { key } })` on the nearest ancestor that has the handler. Useful for apps that react to specific keys — advancing focus on `'Enter'`, clearing on `'Backspace'`, dismissing on `'Escape'`. Throws if no `onKeyPress` handler is found.

```ts
const input = await app.find({ testID: 'input-name' });
await input.focus();
await input.pressKey('Enter');

await input.pressKey('Backspace');
const indicator = await app.find({ testID: 'last-key-pressed' });
expect(await indicator.text()).toBe('Last key: Backspace');
```

Common keys: `'Enter'`, `'Backspace'`, `'Tab'`, `'Escape'`, `'ArrowUp'`, `'ArrowDown'`.

---

## Focus and blur

### `element.focus()`

Calls `onFocus` if present, then falls back to `stateNode.focus()`. Throws if neither is available.

```ts
const input = await app.find({ testID: 'input-name' });
await input.focus();
await app.waitForElement('input-name-focused');
```

### `element.blur()`

Calls `onBlur` if present, then falls back to `stateNode.blur()`. Throws if neither is available.

```ts
await input.blur();
await app.waitForElementToDisappear('input-name-focused');
```

### `app.dismissKeyboard()`

Blurs the first `TextInput` found in the fiber tree. Useful after a sequence of text input when you want to dismiss the software keyboard before proceeding.

```ts
await input.typeText('Jane Doe');
await app.dismissKeyboard();
```

---

## Toggles and pickers

### `element.check()` / `element.uncheck()`

Calls `onValueChange(true)` or `onValueChange(false)` on the nearest ancestor with that handler. Works with `Switch` and any component that uses `onValueChange` as a boolean toggle. Throws if no handler is found.

```ts
const sw = await app.find({ testID: 'toggle-notifications' });
await sw.check();
expect(await sw.isChecked()).toBe(true);

await sw.uncheck();
expect(await sw.isChecked()).toBe(false);
```

### `element.isChecked()`

Returns `!!memoizedProps.value` — reads the current controlled value of a `Switch` or similar boolean toggle.

### `element.selectOption(value)`

Calls `onValueChange(value)` on the nearest ancestor with that handler. Works with any component that exposes `onValueChange` — custom pickers, segmented controls, `Picker`, etc. Throws if no handler is found.

```ts
const picker = await app.find({ testID: 'picker-theme' });
await picker.selectOption('dark');
const summary = await app.find({ testID: 'summary-theme' });
expect(await summary.text()).toBe('Theme: dark');
```

---

## Gestures

### `element.swipe(direction, distance?)`

Fires a simulated PanResponder gesture sequence (grant → 10 move steps → release) in the given direction. Searches up the fiber tree for the nearest ancestor with PanResponder handlers. `distance` defaults to 100 px.

```ts
const card = await app.find({ testID: 'swipeable-card' });
await card.swipe('left', 200);
await app.waitForElement('delete-action');
```

Directions: `'left'`, `'right'`, `'up'`, `'down'`.

### `element.dragTo(target)`

Measures the frames of both the source and target elements and fires a PanResponder gesture from the center of the source to the center of the target. Useful for drag-and-drop, sortable lists, and Kanban boards.

```ts
const dragItem = await app.find({ testID: 'drag-item' });
const dropZone = await app.find({ testID: 'drop-zone' });
await dragItem.dragTo(dropZone);
await app.waitForElement('drop-result');
```

If frame measurement isn't available (Fabric/new arch limitation), the gesture falls back to a 200 px downward drag.

---

## Scrolling

### `element.scrollTo(offset)`

Scrolls the element (a `FlatList`, `VirtualizedList`, or `ScrollView`) vertically to the given pixel offset. Throws if the element is not a recognized scrollable component.

```ts
const list = await app.find({ testID: 'activity-list' });
await list.scrollTo(2_000);
const item = await app.waitForElement('activity-item-15');
```

### `element.scrollToX(offset)`

Scrolls the element horizontally to the given pixel offset. Works with `FlatList` (via `scrollToOffset`) and `ScrollView` (via `scrollTo({ x })`). Throws if the element is not a recognized scrollable component.

```ts
const cards = await app.find({ testID: 'cards-horizontal' });
await cards.scrollToX(1_200);
const card = await app.waitForElement('card-10');
```

### `app.scrollAndFind(testID, opts?)`

Scrolls the first visible list or scroll view in 5 000 px steps until the element with the given `testID` appears. Covers the common case where the element is in a long list and you don't know the exact offset.

```ts
const item = await app.scrollAndFind('product-item-99', { timeout: 15_000 });
await item.tap();
```

---

## Animation control

### `app.disableAnimations()`

Patches `Animated.timing`, `Animated.spring`, and `Animated.decay` to zero duration, and no-ops `LayoutAnimation.configureNext`. Call in a `beforeAll` hook to eliminate timing-related flakiness across a suite.

```ts
describe('Checkout', () => {
  beforeAll(async (app) => {
    await app.disableAnimations();
  });

  it('transitions to the confirmation screen', async (app) => {
    // animated transitions complete instantly — no waitForElement timing issues
  });
});
```

Re-apply after each `reset()` if needed, since the patch is scoped to a single app launch.

### `app.waitForInteractions(opts?)`

Sleeps for a configurable delay (default 500 ms) on the test runner side. Use after `waitForElement` resolves to give React Navigation's slide transitions or other native-driven animations time to finish before interacting.

```ts
const input = await app.waitForElement('email-input');
await app.waitForInteractions();
await input.typeText('user@example.com');
```

Why a fixed delay? React Navigation's stack/tab transitions run on the native thread and don't trigger any further React commits when they complete, so there's no fiber-level signal to wait on. A 500 ms delay covers the default 300–400 ms transition with buffer; override via `{ delay: 800 }` for slower animations.

If you've called `disableAnimations()`, this is unnecessary — transitions complete instantly.

---

## Timer control

`app.clock` gives you a fake timer implementation that runs inside the Hermes engine. Install it to freeze real time, advance it by an explicit amount, and run all scheduled callbacks without waiting for real milliseconds to pass.

### `app.clock.install(baseTime?)`

Patches `globalThis.setTimeout`, `clearTimeout`, `setInterval`, `clearInterval`, and `Date.now` in the app's JS runtime. Time stops advancing until you call `tick()`. If `baseTime` is omitted, the clock starts at the current real timestamp.

```ts
beforeAll(async (app) => {
  await app.clock.install();
});
```

### `app.clock.tick(ms)`

Advances fake time by `ms` milliseconds, firing every queued callback that falls within that window in chronological order. Callbacks are invoked synchronously inside the `evaluate` call, so React state updates triggered by them are committed before `tick()` returns.

```ts
it('shows the result without a real 2 s wait', async (app) => {
  await app.clock.install();
  await (await app.find({ testID: 'btn-async' })).tap();
  await app.clock.tick(2000);
  const result = await app.waitForElement('async-result', { timeout: 1_000 });
  expect(await result.text()).toBe('Done!');
});
```

`waitForElement` still uses real Node.js polling (host-side), so it is unaffected by the fake clock patch.

### `app.clock.restore()`

Restores the original timer functions and clears the queue. Called automatically after each `reset()` (the app restart gives a fresh Hermes context, so the patch is gone regardless).

### `app.clock.now()`

Returns the current fake timestamp as a number. Useful for assertions that involve `Date.now()`.

---

## Named steps

### `app.step(name, fn)`

Wraps an async function as a named step. On failure, the step name is prepended to the error message, making it immediately clear which phase of a long test failed. In `--verbose` mode, the step name is also printed as execution enters it.

```ts
it('completes the checkout flow', async (app) => {
  await app.step('add item to cart', async () => {
    await (await app.find({ testID: 'btn-add-to-cart' })).tap();
    await app.waitForElement('cart-badge');
  });

  await app.step('submit order', async () => {
    await (await app.find({ testID: 'btn-checkout' })).tap();
    await app.waitForElement('order-confirmation');
  });
});
// failure example: "[submit order] Expected: element with testID 'order-confirmation'"
```

`app.step` is most useful for integration tests that span multiple screens. For short tests (3–5 actions), the normal error message and screenshot are usually enough context.

---

## Storage

These methods read and write `AsyncStorage`. They require `@react-native-async-storage/async-storage` to be bundled in the app.

```ts
await app.setStorage('auth-token', 'abc123');
const token = await app.getStorage('auth-token'); // 'abc123'
await app.removeStorage('auth-token');
await app.clearStorage(); // removes all keys
```

Useful for seeding app state before a test without going through the UI sign-in flow.

---

## Network

### `app.setNetworkOffline(offline)`

When `true`, all `fetch` calls inside the app immediately reject with a network error. Set back to `false` to restore connectivity. The flag is automatically reset to `false` after each `reset()`.

```ts
it('shows an offline banner when the network drops', async (app) => {
  await app.setNetworkOffline(true);
  await app.waitForElement('offline-banner');
  await app.setNetworkOffline(false);
  await app.waitForElementToDisappear('offline-banner');
});
```

For controlled mock responses, use [`mockNetwork`](./network-mocking.md) instead.

---

## Scoped element queries

`Element` has its own `find` and `findAll` that search only within that element's subtree. This avoids false matches when the same testID or component appears in multiple places on screen.

```ts
const row = await app.find({ testID: 'cart-item-2' });
const qty = await row.find({ testID: 'quantity-label' }); // scoped to this row only
expect(await qty.text()).toBe('2');
```

---

## Tree traversal

These methods walk the React fiber tree upward or sideways from an `Element`. They complement scoped `find` / `findAll` (which walk downward) and are especially useful when you have a reference to a deeply nested node and need to reach its container or adjacent elements without adding extra `testID`s to the app.

All traversal methods return fresh `Element` instances backed by the live fiber, so you can chain queries and interactions on the results.

### `element.parent()`

Returns the nearest meaningful ancestor — a named composite component (function or class component with a displayName/name) or a native `HostComponent` (View, Text, etc.). Anonymous HOC shells, `Context.Provider`, `Fragment`, and other transparent wrappers are skipped. Throws if no meaningful parent is found before the fiber root.

```ts
const successText = await app.find({ testID: 'form-success-text' });
const banner = await successText.parent();
// banner is the View with testID="form-success"
const props = await banner.props();
expect(props.testID).toBe('form-success');
```

### `element.siblings()`

Returns all fiber siblings — nodes that share the same parent — excluding the element itself. Order follows fiber sibling link order (same as React render order).

```ts
const firstSummary = await app.find({ testID: 'summary-plan' });
const others = await firstSummary.siblings();
// others = [summary-theme element, summary-notifications element]
expect(others.length).toBe(2);
expect(await others[0].text()).toBe('Theme: system');
```

### `element.sibling(selector)`

Finds the first sibling that matches `selector`, using the same selector union as `app.find`. Throws if no sibling matches. Use this instead of `siblings()` + manual filtering when you know what you're looking for.

```ts
// Jump directly to a specific sibling by testID
const freeBtn = await app.find({ testID: 'plan-free' });
const teamBtn = await freeBtn.sibling({ testID: 'plan-team' });
await teamBtn.tap();

// Or by text content
const proBtn = await freeBtn.sibling({ text: 'Pro' });
```

### `element.nextSibling()` / `element.prevSibling()`

Returns the immediately following or preceding sibling in fiber order. Returns `null` if the element is already last (or first).

```ts
const planLabel = await app.find({ testID: 'summary-plan' });
const themeLabel = await planLabel.nextSibling();
expect(await themeLabel!.text()).toBe('Theme: system');

const notifLabel = await app.find({ testID: 'summary-notifications' });
const prev = await notifLabel.prevSibling();
expect(await prev!.text()).toBe('Theme: system');
```

### `element.closest(selector)`

Walks up the ancestor chain via `fiber.return` and returns the first ancestor that matches `selector`. Supports the same `Selector` union as `app.find` — testID, component name, text, accessibilityLabel, accessibilityRole, and placeholder — including `RegExp` text matching. Throws if no match is found before the fiber root.

```ts
// Climb from a child text element to its named container
const planText = await app.find({ testID: 'summary-plan' });
const summaryBox = await planText.closest({ testID: 'form-summary' });
const props = await summaryBox.props();
expect(props.testID).toBe('form-summary');

// Navigate to the nearest ScrollView ancestor
const input = await app.find({ testID: 'input-name' });
const scroller = await input.closest({ component: 'ScrollView' });
await scroller.scrollTo(0);
```

`closest` is the tree-traversal equivalent of the CSS `Element.closest()` method and is the most useful of the traversal APIs for tests where containers lack `testID`s.

---

## Device-level actions

### `app.pressBack()`

Android only. Sends the hardware Back key event (`adb shell input keyevent 4`). No-op on iOS.

```ts
await app.pressBack();
await app.waitForElement('home-screen');
```

### `app.openURL(url)`

Opens a URL via the OS. On iOS calls `xcrun simctl openurl`; on Android calls `adb shell am start -a android.intent.action.VIEW`.

```ts
await app.openURL('myapp://deep-link/promo/SUMMER');
await app.waitForElement('promo-screen');
```

### `app.setLocation(lat, lng)`

Simulates a GPS location. iOS only (`xcrun simctl location set`). Android support is not implemented.

```ts
await app.setLocation(37.7749, -122.4194); // San Francisco
await app.waitForElement('location-banner');
```

### `app.setPermission(service, status)`

Grants, revokes, or resets a system permission.

- iOS: `xcrun simctl privacy <udid> <grant|revoke|reset> <service>`
- Android: `adb shell pm grant/revoke <bundleId> android.permission.<SERVICE>`

```ts
await app.setPermission('camera', 'grant');
await app.setPermission('location', 'revoke');
await app.setPermission('notifications', 'reset');
```

Common iOS service names: `camera`, `microphone`, `photos`, `location`, `contacts`, `calendars`, `reminders`, `motion`.

---

### `app.setOrientation(orientation)`

Rotates the device to `'portrait'` or `'landscape'`. On iOS the framework queries the app's current `Dimensions` via the bridge and sends one AppleScript keyboard shortcut to the Simulator (Cmd+← / Cmd+→); on Android it uses `adb shell settings put system user_rotation`. An implicit 400 ms delay is added on iOS after the rotation to allow the layout system to propagate the change before subsequent queries.

```ts
it('shows the landscape layout', async (app) => {
  await app.setOrientation('landscape');
  await app.waitForElement('landscape-toolbar');

  await app.setOrientation('portrait');
  await app.waitForElementToDisappear('landscape-toolbar');
});
```

**iOS requirement**: the Simulator must be running and the test runner process must have permission to control System Events (grant in System Settings › Privacy & Security › Accessibility if you see a permission prompt).

**Android**: the call is an absolute set (not a toggle), so orientation is deterministic regardless of the device's prior state.

---

### `app.setBiometricEnrollment(enrolled)` / `app.matchBiometric()` / `app.rejectBiometric()`

iOS only. Controls the biometric sensor simulation on the iOS Simulator via `xcrun simctl biometricEnrollment` and `xcrun simctl biometric`. Requires Xcode 12+. Calling any of these methods on Android throws an error.

```ts
beforeAll(async (app) => {
  await app.setBiometricEnrollment(true);   // enroll Face ID / Touch ID
});

it('signs in with Face ID', async (app) => {
  await (await app.find({ testID: 'btn-faceid' })).tap();

  // Simulate the OS presenting the biometric prompt and the user passing
  await app.matchBiometric();
  await app.waitForElement('home-screen');
});

it('shows an error on failed biometric', async (app) => {
  await (await app.find({ testID: 'btn-faceid' })).tap();
  await app.rejectBiometric();
  await app.waitForElement('biometric-error-banner');
});
```

---

### `app.isAppRunning()`

Returns `true` if the app process is still alive. Uses `pgrep -f <bundleId>` on iOS and `adb shell pidof` on Android.

The most common use is diagnosing a crash after a "CDP connection lost" error:

```ts
it('handles a crash gracefully', async (app) => {
  try {
    await (await app.find({ testID: 'btn-crash-trigger' })).tap();
  } catch (err) {
    // err.message will say "CDP connection lost — the app may have crashed"
    if (!(await app.isAppRunning())) {
      console.log('App crashed — check crash logs in ~/Library/Logs/DiagnosticReports');
    }
    throw err;
  }
});
```

The runner does not call `isAppRunning()` automatically; the improved error message ("CDP connection lost — the app may have crashed") is your first signal, and `isAppRunning()` lets you confirm it programmatically.

---

## Screenshots

### `app.screenshot(name)`

Captures a screenshot and saves it to `<TEST_RESULTS_DIR>/<name>-<timestamp>.png`. Returns the full file path written.

```ts
const filePath = await app.screenshot('after-login');
// e.g. "test-results/after-login-1714000000000.png"
```

The directory is created automatically if it doesn't exist. Screenshots on failure are captured automatically by the runner — you only need to call this manually for diagnostic captures mid-test.

---

## Screen recording

### `app.startRecording(name?)`

Starts a video recording of the device screen. The file is saved to `<TEST_RESULTS_DIR>/<name>-<timestamp>.mp4`. `name` defaults to `'recording'`. On iOS uses `xcrun simctl io recordVideo`; on Android uses `adb screenrecord`.

### `app.stopRecording()`

Stops the recording and returns the file path.

```ts
await app.startRecording('checkout-flow');
// ... run your test actions ...
const videoPath = await app.stopRecording();
// e.g. "test-results/checkout-flow-1714000000000.mp4"
```

---

## Push notifications (iOS only)

### `app.pushNotification(payload)`

Delivers a push notification to the app via `xcrun simctl push`. The app must have push notification entitlements and Xcode 11.4+ is required.

`payload` follows the APNS format:

```ts
await app.pushNotification({
  aps: {
    alert: { title: 'New message', body: 'You have a new message' },
    sound: 'default',
    badge: 1,
  },
  customKey: 'customValue',
});
await app.waitForElement('notification-banner');
```

The app should be backgrounded (or in the foreground with a notification handler) before calling this.

---

## Status bar (iOS only)

### `app.setStatusBar(opts)`

Overrides status bar content via `xcrun simctl status_bar`. Useful for screenshot consistency and visual regression testing. All fields are optional — omit any you don't want to override.

```ts
await app.setStatusBar({
  time: '9:41',
  batteryLevel: 100,
  batteryState: 'discharging',
  wifiMode: 'active',
  wifiBars: 3,
  cellularMode: 'active',
  cellularBars: 4,
  dataNetwork: 'lte',
  operatorName: 'Carrier',
});
```

| Field | Type | Values |
|---|---|---|
| `time` | `string` | e.g. `'9:41'` |
| `batteryLevel` | `number` | `0`–`100` |
| `batteryState` | `string` | `'charging'` \| `'discharging'` \| `'notCharging'` |
| `wifiMode` | `string` | `'active'` \| `'searching'` \| `'failed'` \| `'inactive'` |
| `wifiBars` | `number` | `0`–`3` |
| `cellularMode` | `string` | `'active'` \| `'searching'` \| `'failed'` \| `'inactive'` |
| `cellularBars` | `number` | `0`–`4` |
| `dataNetwork` | `string` | `'wifi'` \| `'3g'` \| `'4g'` \| `'lte'` \| `'lte-a'` \| `'5g'` |
| `operatorName` | `string` | Any string |

### `app.resetStatusBar()`

Clears all status bar overrides and restores the real values.

```ts
afterAll(async (app) => {
  await app.resetStatusBar();
});
```

Is a no-op on Android.

---

## Clipboard (iOS only)

Uses the macOS host clipboard, which the Simulator syncs with by default (Simulator › General › Copy and Paste).

### `app.setClipboard(text)`

Writes a string to the clipboard.

```ts
await app.setClipboard('SUMMER20');
await (await app.find({ testID: 'btn-paste-code' })).tap();
const input = await app.find({ testID: 'input-promo' });
expect(await input.inputValue()).toBe('SUMMER20');
```

### `app.getClipboard()`

Reads the current clipboard contents as a string.

```ts
await (await app.find({ testID: 'btn-copy-invite-link' })).tap();
const link = await app.getClipboard();
expect(link).toContain('https://myapp.com/invite/');
```

Both methods throw on Android.

---

## Native component setters

### `element.setDate(date)`

Fires the date handler on the nearest ancestor that has `onDateChange`, `onChange`, or `onConfirm`. Works with `DatePickerIOS`, `@react-native-community/datetimepicker`, and modal-style date pickers.

```ts
const picker = await app.find({ testID: 'dob-picker' });
await picker.setDate(new Date('1990-05-15'));
const display = await app.find({ testID: 'dob-display' });
expect(await display.text()).toContain('May 15, 1990');
```

The date is serialized as a timestamp and reconstructed as a `Date` object inside the bridge.

### `element.slideToValue(value)`

Fires `onValueChange(value)` and — if present on the same node — `onSlidingComplete(value)`. Works with `@react-native-community/slider` and any component that exposes these handlers.

```ts
const slider = await app.find({ testID: 'volume-slider' });
await slider.slideToValue(0.75);
const label = await app.find({ testID: 'volume-label' });
expect(await label.text()).toBe('75%');
```

Throws if no `onValueChange` is found in the ancestor chain.

---

## Checking state without interacting

These read-only methods on `Element` are covered in [Querying](./querying.md) but are repeated here for completeness:

| Method | Returns | Description |
|---|---|---|
| `exists()` | `boolean` | Re-queries the tree by `testID` |
| `text()` | `string` | Concatenated HostText (tag-6 fiber) descendants |
| `props()` | `Record<string, unknown>` | Serializable `memoizedProps` + `accessibilityState` |
| `isEnabled()` | `boolean` | `false` if `disabled` or `accessibilityState.disabled` |
| `isFocused()` | `boolean` | `true` if `accessibilityState.focused` |
| `isVisible()` | `boolean` | Alias for `exists()` |
| `getFrame()` | `Frame \| null` | `{ x, y, width, height }` via `stateNode.measure()` |
