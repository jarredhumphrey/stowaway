# Querying Elements

`AppSession` provides several methods for locating elements in the React fiber tree. All queries communicate with the live Hermes engine over CDP — there is no DOM, no accessibility tree, and no layout engine involved.

## Selectors

Most query methods accept a `Selector` union:

```ts
type Selector =
  | { testID: string }
  | { component: string; props?: Record<string, unknown> }
  | { text: string; exact?: boolean }
  | { text: RegExp }
  | { accessibilityLabel: string; exact?: boolean }
  | { accessibilityRole: string }
  | { placeholder: string; exact?: boolean }
```

### `{ testID: string }`

The preferred selector. Matches the first fiber whose `memoizedProps.testID` equals the given value. `testID` props are supported on all React Native host components.

```ts
const btn = await app.find({ testID: 'btn-submit' });
```

### `{ component: string; props?: Record<string, unknown> }`

Matches fibers by component display name. Useful when you control the component but can't add `testID`. The optional `props` map is a subset of props that must all match exactly.

```ts
// All Text components
const labels = await app.findAll({ component: 'Text' });

// A specific Button with a known label prop
const btn = await app.find({ component: 'Button', props: { label: 'Continue' } });
```

Component name resolution order: `fiber.type` (if string), `fiber.type.displayName`, `fiber.type.name`.

### `{ text: string; exact?: boolean }` and `{ text: RegExp }`

Matches fibers by their full concatenated text content. `exact` defaults to `true` (strict equality). Set `exact: false` for a substring match, or pass a `RegExp` for pattern matching.

```ts
const heading = await app.find({ text: 'Choose a plan' });
const heading = await app.find({ text: 'plan', exact: false });   // substring
const heading = await app.find({ text: /choose a plan/i });       // regex
```

Use this as a last resort — it's slower than `testID` and brittle if text changes.

### `{ accessibilityLabel: string; exact?: boolean }`

Matches fibers by `memoizedProps.accessibilityLabel`. `exact` defaults to `true`.

```ts
const btn = await app.find({ accessibilityLabel: 'Close dialog' });
const btn = await app.find({ accessibilityLabel: 'close', exact: false });
```

### `{ accessibilityRole: string }`

Matches fibers by `memoizedProps.accessibilityRole`. HOC wrappers that pass the same role through are deduplicated automatically.

```ts
const buttons = await app.findAll({ accessibilityRole: 'button' });
```

### `{ placeholder: string; exact?: boolean }`

Matches `TextInput` (and similar) fibers by `memoizedProps.placeholder`. `exact` defaults to `true`. HostComponent fibers are skipped to avoid matching native wrappers.

```ts
const input = await app.find({ placeholder: 'Enter your email' });
const input = await app.find({ placeholder: 'email', exact: false });
```

---

## Visibility filtering

`find`, `findAll`, `findNth`, and `waitForElement` all filter out fibers that aren't currently visible. A fiber is considered not visible if any ancestor in its chain has:

- `activityState < 2` — a `react-native-screens` `Screen` that's prerendered but not currently navigated to
- `style.display === 'none'` — explicitly hidden via static style

This prevents two common failure modes: matching elements on a prerendered background screen, and matching multiple instances when only one is actually visible (e.g. tab navigators that keep all tabs mounted).

Note that this only catches React-driven visibility. Native-driven animations (e.g. React Navigation slide transitions) don't change any fiber prop while running, so visibility passes the moment the navigation commits, even if the animation is still playing. Use [`app.waitForInteractions()`](./interactions.md#appwaitforinteractionsopts) afterward if you need to wait for the animation to finish.

## `find(selector)`

Returns the first matching `Element`. Throws immediately if nothing matches — use `waitForElement` if the element might not be in the tree yet.

```ts
const tab = await app.find({ testID: 'tab-profile' });
await tab.tap();
```

## `findAll(selector)`

Returns all matching `Element[]`. Returns an empty array if nothing matches (never throws).

```ts
const chips = await app.findAll({ component: 'Chip' });
expect(chips).toHaveLength(5);
```

## `findNth(selector, n)`

Returns the nth match (0-based) from `findAll`. Throws if the index is out of range.

```ts
// Get the second item in a list
const secondItem = await app.findNth({ component: 'ListItem' }, 1);
await secondItem.tap();
```

## `waitForElement(selector | testID, opts?)`

Resolves as soon as the element appears in a visible part of the tree, or rejects after `timeout` ms. Accepts any `Selector` or a plain string (treated as `{ testID }`). Throws with a descriptive error on timeout.

Internally this hooks React's commit phase via `__REACT_DEVTOOLS_GLOBAL_HOOK__.onCommitFiberRoot`, so it resolves on the first React render that contains the element — usually within a few milliseconds, not at the next poll boundary. A polling fallback at `interval` (default 250 ms) runs in parallel as a safety net.

```ts
// Plain string — shorthand for { testID: 'success-banner' }
const banner = await app.waitForElement('success-banner');

// Any selector works
const banner = await app.waitForElement({ text: 'Submitted successfully!' });

// Override timeout for a slower operation
const result = await app.waitForElement('search-results', { timeout: 15_000 });
```

Options:

| Option | Default | Description |
|---|---|---|
| `timeout` | `config.defaultTimeout` | Max wait in ms |
| `interval` | `250` | Poll interval in ms |

## `waitForElementToDisappear(testID, opts?)`

Polls until the element is no longer in the committed fiber tree. Useful for asserting that a loading spinner or modal has closed.

```ts
await app.waitForElementToDisappear('loading-spinner', { timeout: 5_000 });
await app.waitForElement('content-screen');
```

Same options as `waitForElement`.

## `waitFor(fn, opts?)`

Polls an arbitrary async predicate until it returns `true`. Use this when no single element capture captures the condition you need.

```ts
await app.waitFor(async () => {
  const label = await app.find({ testID: 'counter-value' });
  return (await label.text()) === '3';
}, { timeout: 5_000 });
```

Same options as `waitForElement`.

## `scrollAndFind(testID, opts?)`

Scrolls the first visible `FlatList` or `ScrollView` in 5 000 px increments, pausing after each step to poll for the element. Returns the element when found; throws on timeout.

```ts
// Element is far down a long list — scroll until it appears
const item = await app.scrollAndFind('list-item-47', { timeout: 12_000 });
await item.tap();
```

If the element is already visible before any scroll, `scrollAndFind` returns it immediately without scrolling.

Option:

| Option | Default | Description |
|---|---|---|
| `timeout` | `config.defaultTimeout` | Max total wait in ms |

---

## Checking existence without throwing

`Element.exists()` re-queries the fiber tree by `testID` and returns a boolean — useful inside `waitFor` or for conditional logic without a try/catch:

```ts
const el = await app.find({ testID: 'optional-banner' });
if (await el.exists()) {
  await el.tap();
}
```

`exists()` only works when the element was found by `testID`. If the element was found by component name or text, it always returns `false`.

---

## Reading element state

Once you have an `Element`, you can read its properties without re-querying:

```ts
const input = await app.find({ testID: 'input-name' });

await input.text()           // concatenated HostText descendants
await input.inputValue()     // memoizedProps.value ?? defaultValue ?? '' — for TextInput
await input.prop('value')    // single named prop — sugar over (await input.props()).value
await input.props()          // all serializable memoizedProps (strings, numbers, booleans, null) + accessibilityState
await input.isEnabled()      // false if disabled or accessibilityState.disabled
await input.isChecked()      // !!memoizedProps.value — for Switch / checkbox
await input.isFocused()      // true if accessibilityState.focused
await input.isVisible()      // alias for exists()
await input.getFrame()       // { x, y, width, height } via stateNode.measure(), or null
```

`props()` re-walks the tree by `testID` on every call, so it reflects the current fiber state after any React re-render:

```ts
await btn.tap();
const props = await btn.props();
expect(props.accessibilityState?.selected).toBe(true);
```

Use `prop(name)` when you only need one field:

```ts
await input.typeText('Jane');
expect(await input.prop('value')).toBe('Jane');
```

---

## Scoped queries

`Element` itself has `find` and `findAll` methods that search only within that element's subtree. Use them to avoid false matches when the same `testID` or component appears multiple times on screen.

```ts
const card = await app.find({ testID: 'product-card-1' });

// Only searches within card's subtree — won't match buttons on other cards
const addBtn = await card.find({ testID: 'btn-add-to-cart' });
await addBtn.tap();
```

---

## Debugging: printing the fiber tree

If you can't find an element and aren't sure what `testID` values are available, use `app.printTree()` in a temporary test:

```ts
it('debug — print fiber tree', async (app: AppSession) => {
  await app.printTree();
});
```

This prints one line per node — `ComponentName [testID]` — indented by depth. For example:

```
ButtonsScreen
  ScrollView
    Text
    View
      TouchableOpacity [btn-increment]
      TouchableOpacity [btn-decrement]
    TouchableOpacity [btn-reset]
```

The optional depth argument (default 30) limits how deep the traversal goes. `getTree()` is also available if you need the raw data:

```ts
const tree = await app.getTree();
console.log(JSON.stringify(tree, null, 2));
```

For a less noisy view that excludes prerendered background screens and `display: none` subtrees, use `app.printVisibleTree()`:

```ts
await app.printVisibleTree();
```

This applies the same visibility filter as [`find`](#findselector) — useful when `printTree` is overwhelming because of pre-rendered tabs or stack screens kept mounted in the background.
