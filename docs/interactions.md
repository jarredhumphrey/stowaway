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

## Screenshots

### `app.screenshot(name)`

Captures a screenshot and saves it to `<TEST_RESULTS_DIR>/<name>-<timestamp>.png`. Returns the full file path written.

```ts
const filePath = await app.screenshot('after-login');
// e.g. "test-results/after-login-1714000000000.png"
```

The directory is created automatically if it doesn't exist. Screenshots on failure are captured automatically by the runner — you only need to call this manually for diagnostic captures mid-test.

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
