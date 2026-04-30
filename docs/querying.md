# Querying Elements

`AppSession` provides several methods for locating elements in the React fiber tree. All queries communicate with the live Hermes engine over CDP — there is no DOM, no accessibility tree, and no layout engine involved.

## Selectors

Most query methods accept a `Selector` union:

```ts
type Selector =
  | { testID: string }
  | { component: string; props?: Record<string, unknown> }
  | { text: string }
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

### `{ text: string }`

Walks all `Text` fibers and matches the one whose full concatenated text content equals the given string exactly.

```ts
const heading = await app.find({ text: 'Choose a plan' });
```

Use this as a last resort — it's slower than `testID` and brittle if text changes.

---

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

## `waitForElement(testID, opts?)`

Polls `find({ testID })` every `pollInterval` ms (default: 250 ms) until the element appears or `timeout` ms elapses. Throws with a descriptive error on timeout.

```ts
// Wait with default timeout (DEFAULT_TIMEOUT env var, default 10 000 ms)
const banner = await app.waitForElement('success-banner');

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

await input.text()       // concatenated HostText descendants
await input.props()      // serializable memoizedProps (strings, numbers, booleans, null)
await input.isEnabled()  // false if disabled or accessibilityState.disabled
await input.isFocused()  // true if accessibilityState.focused
await input.isVisible()  // alias for exists()
await input.getFrame()   // { x, y, width, height } via stateNode.measure(), or null
```

`props()` always returns the current fiber state — it re-walks the tree by `testID` on every call, so it's safe to call multiple times across state changes:

```ts
await btn.tap();
// React state updates after tap — props() reflects the new memoizedProps
const props = await btn.props();
expect(props.accessibilityState?.selected).toBe(true);
```

---

## Debugging: printing the fiber tree

If you can't find an element and aren't sure what `testID` values are available, evaluate `__testBridge__.getTree()` via a temporary test:

```ts
it('debug — print fiber tree', async (app: AppSession) => {
  const tree = await (app as any)['hermes'].evaluate('JSON.stringify(__testBridge__.getTree(10))');
  console.log(tree);
});
```

Or add `testID` props to components incrementally and use `find` to confirm each one is reachable before building the full test.
