# Assertions

Stowaway ships a minimal `expect` API. All matchers throw `AssertionError` on failure, which the runner catches and records as a test failure with the error message.

Import it alongside `describe` and `it`:

```ts
import { describe, it, expect } from 'stowaway';
```

---

## Basic equality

### `toBe(expected)`

Strict equality using `Object.is`. Use this for primitives.

```ts
expect(await label.text()).toBe('Hello');
expect(count).toBe(3);
expect(flag).toBe(true);
```

### `toEqual(expected)`

Deep equality via `JSON.stringify`. Use this for plain objects and arrays.

```ts
expect(await el.props()).toEqual({ testID: 'btn', disabled: false });
expect(tags).toEqual(['react', 'native']);
```

Note: functions, `undefined` values, and non-serializable types are stripped by `JSON.stringify` and will not be compared.

### `toMatchObject(partial)`

Passes if the received object contains at least all the keys in `partial`, with matching values. Extra keys in the received object are ignored.

```ts
const props = await btn.props();
expect(props).toMatchObject({ disabled: false });
// passes even if props has other keys
```

---

## Strings and arrays

### `toContain(item)`

For strings: passes if the string includes the substring.
For arrays: passes if the array includes the item (by `===`).

```ts
expect(await banner.text()).toContain('Success');
expect(categories).toContain('Electronics');
```

### `toHaveLength(n)`

Checks the `.length` property.

```ts
const items = await app.findAll({ component: 'ListItem' });
expect(items).toHaveLength(10);
expect(await label.text()).toHaveLength(0);
```

---

## Truthiness

```ts
expect(value).toBeTruthy()    // Boolean(value) === true
expect(value).toBeFalsy()     // Boolean(value) === false
expect(value).toBeNull()      // value === null
expect(value).toBeUndefined() // value === undefined
```

---

## Numeric comparisons

```ts
expect(score).toBeGreaterThan(0)
expect(score).toBeGreaterThanOrEqual(100)
expect(errorCount).toBeLessThan(5)
expect(retries).toBeLessThanOrEqual(3)
```

---

## Accessibility matchers

These matchers operate on the object returned by `element.props()`. They exist because `props()` strips functions and non-serializable values, but preserves `accessibilityLabel`, `accessibilityRole`, and `accessibilityState`.

### `toHaveAccessibilityLabel(label)`

```ts
const btn = await app.find({ testID: 'btn-submit' });
const props = await btn.props();
expect(props).toHaveAccessibilityLabel('Submit form');
```

### `toHaveAccessibilityRole(role)`

```ts
expect(props).toHaveAccessibilityRole('button');
```

Common roles: `'button'`, `'link'`, `'header'`, `'image'`, `'text'`, `'search'`, `'checkbox'`, `'radio'`, `'tab'`, `'none'`.

### Checking `accessibilityState`

`props()` always includes the `accessibilityState` object. Access its fields directly:

```ts
const props = await planCard.props();
expect(props.accessibilityState?.selected).toBe(true);
expect(props.accessibilityState?.disabled).toBe(false);
```

---

## Async auto-waiting matchers

When `expect()` receives an `Element` (rather than a primitive), it returns an `AsyncElementExpect` that polls every 250 ms until the assertion passes or the timeout expires (default: 4 000 ms). This eliminates the `waitForElement` + `expect(await el.text()).toBe(...)` pattern and handles flakiness from React re-renders.

```ts
// These are equivalent but the async form handles timing automatically:
const banner = await app.waitForElement('form-success-text');
await expect(banner).toHaveText('Submitted successfully!');
```

All async matchers accept an optional `{ timeout }` override:

```ts
await expect(element).toHaveText('Done', { timeout: 8_000 });
```

### `toHaveText(expected)`

Polls until the element's concatenated text equals `expected`. Accepts a string (exact match) or a `RegExp`.

```ts
await expect(banner).toHaveText('Submitted successfully!');
await expect(banner).toHaveText(/submitted/i);
```

### `toHaveValue(expected)`

Polls until `element.inputValue()` equals `expected`. Use this for `TextInput` values instead of `text()`.

```ts
const input = await app.find({ testID: 'input-name' });
await input.typeText('Jane Doe');
await expect(input).toHaveValue('Jane Doe');
```

### `toBeVisible()`

Polls until `element.isVisible()` (i.e. `exists()`) returns `true`.

```ts
await expect(loadingSpinner).toBeVisible();
```

### `toBeEnabled()`

Polls until `element.isEnabled()` returns `true` — i.e. the element is not disabled.

```ts
const submitBtn = await app.find({ testID: 'btn-submit' });
await expect(submitBtn).toBeEnabled();
```

### `toBeDisabled()`

Polls until `element.isEnabled()` returns `false`. Inverse of `toBeEnabled()`.

```ts
const btn = await app.find({ testID: 'btn-disabled' });
await expect(btn).toBeDisabled();
```

### `toBeHidden()`

Polls until `element.isVisible()` returns `false` — i.e. the element is no longer in the committed fiber tree. Convenient alternative to `waitForElementToDisappear` when you already have an `Element` reference.

```ts
const spinner = await app.find({ testID: 'loading-spinner' });
await expect(spinner).toBeHidden({ timeout: 5_000 });
```

### `toBeChecked()`

Polls until `element.isChecked()` returns `true`. Use for `Switch` and other boolean toggles.

```ts
const sw = await app.find({ testID: 'toggle-notifications' });
await sw.check();
await expect(sw).toBeChecked();
```

### `toHaveFocus()`

Polls until `element.isFocused()` returns `true` — i.e. `accessibilityState.focused` is set.

```ts
const input = await app.find({ testID: 'input-name' });
await input.focus();
await expect(input).toHaveFocus();
```

### Negation with `.not`

All async matchers support `.not`:

```ts
await expect(errorBanner).not.toHaveText('Success');
await expect(spinner).not.toBeVisible();
```

`.not` passes as soon as the condition is false, so `not.toBeVisible()` is a convenient alternative to `waitForElementToDisappear` when you already have an `Element` reference.

---

## Negation (sync)

All sync matchers support `.not` to invert the assertion:

```ts
expect(await el.exists()).not.toBe(false);
expect(errorMessage).not.toContain('undefined');
expect(props).not.toHaveAccessibilityRole('none');
```

`.not` chains: `expect(value).not.toBeTruthy()` is the same as `expect(value).toBeFalsy()`, but the error message is more descriptive in the `.not` form when you want to express the intent clearly.

---

## Soft assertions

`expect.soft(value)` works exactly like `expect(value)` — it supports the full sync and async matcher API including `.not` — but **does not stop the test on failure**. Failures are queued and reported together as a single combined error at the end of the test.

```ts
const value = await app.find({ testID: 'counter-value' });
expect.soft(await value.text()).toBe('0');       // queued on failure, test continues
expect.soft(await value.text()).toContain('0');  // queued on failure, test continues
// end of test: "2 soft assertion(s) failed:\n  • Expected: ..."
```

Async matchers also work:

```ts
await expect.soft(element).toHaveText('Done');
await expect.soft(element).not.toBeVisible();
```

If the test function throws a hard failure before the flush, the hard error wins and any queued soft failures are discarded. Soft assertions are cleared automatically before each test and flushed automatically after the test function resolves.

---

## Error messages

All failures include the expected value and the received value:

```
AssertionError: Expected: "Welcome back" (received: "Hello")
AssertionError: Expected NOT: to be truthy (received: true)
AssertionError: Expected: to have accessibilityLabel "Submit form" (got "submit") (received: {...})
```

The runner prints these inline under the failing test and captures a screenshot automatically. See [Results & CI](./results.md) for details on failure output.
