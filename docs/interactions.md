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
