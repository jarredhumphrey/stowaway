# Getting Started

## Requirements

- Node >= 22
- iOS: Xcode + `xcrun simctl` (one simulator already booted)
- Android: `adb` with a connected emulator or device authorized
- A React Native app running with Hermes (default since RN 0.70) and Metro

## Installation

```bash
npm install --save-dev stowaway
```

## Quickstart

Run the init command from your app's root directory:

```bash
npx stowaway init
```

It will ask for your bundle ID and output directory, then generate:

- `e2e/run.ts` — the test entry point
- `e2e/smoke.spec.ts` — a smoke test that launches the app and prints the component tree
- `e2e:ios` / `e2e:android` scripts in your `package.json`

Boot your simulator or emulator, start Metro, then run:

```bash
npm run e2e:ios
```

The smoke test prints your component tree to stdout — use that output to find `testID`s and write your first real spec.

## Manual setup

If you prefer to set things up by hand, create `e2e/run.ts`:

```ts
import { TestRunner, loadConfig } from 'stowaway';
import * as path from 'path';

const runner = new TestRunner(loadConfig());
runner.run(path.resolve(__dirname));
```

And add a script to `package.json`:

```json
{
  "scripts": {
    "e2e:ios": "PLATFORM=ios BUNDLE_ID=com.myorg.myapp tsx e2e/run.ts"
  }
}
```

## Configuration

All configuration comes from environment variables, read once at startup via `loadConfig()`.

| Variable | Default | Notes |
|---|---|---|
| `PLATFORM` | `ios` | `ios` or `android` |
| `BUNDLE_ID` | required | e.g. `com.myorg.myapp` — throws if absent |
| `METRO_PORT` | `8081` | Port Metro is listening on |
| `DEFAULT_TIMEOUT` | `10000` | Default wait timeout in ms |
| `TEST_RESULTS_DIR` | `test-results` | Where JSON/XML results and screenshots land |
| `SUITE_NAME` | — | Optional label printed in the run header |
| `VERBOSE` | — | `1` or `true` — prints each test step as it completes; also enabled by `--verbose` CLI flag |
| `SLOW_REPLAY` | — | `1` or `true` — adds a delay between trace steps when generating the failure replay video |
| `SLOW_REPLAY_DELAY` | `800` | Delay in ms between steps when `SLOW_REPLAY` is enabled |

## Writing your first spec

Spec files export nothing — they register suites as a side effect when imported. The `app` parameter is an `AppSession` wired up to the live running app.

```ts
// e2e/home.spec.ts
import { describe, it, expect } from 'stowaway';
import type { AppSession } from 'stowaway';

describe('Home screen', () => {
  it('shows the welcome title', async (app: AppSession) => {
    const title = await app.waitForElement('home-title');
    expect(await title.text()).toBe('Welcome');
  });

  it('navigates to the detail screen on card tap', async (app: AppSession) => {
    await (await app.find({ testID: 'card-1' })).tap();
    await app.waitForElement('detail-screen');
  });
});
```

Key things to know up front:

- The app is **relaunched between every test** automatically — you always start from a clean state.
- Elements found in one test are **invalid in the next** — always re-query; never store `Element` references across test boundaries.
- Tests within a `describe` share `beforeEach`/`afterEach` hooks, but not any other state.

## Entry point

Create a `run.ts` alongside your spec files. The simplest form passes the directory — the runner auto-discovers every `*.spec.ts` file inside it alphabetically:

```ts
// e2e/run.ts
import { TestRunner, loadConfig } from 'stowaway';

const runner = new TestRunner(loadConfig());
runner.run(__dirname);
```

To control order explicitly, pass an array of paths instead:

```ts
runner.run([
  path.resolve(__dirname, 'auth.spec.ts'),
  path.resolve(__dirname, 'home.spec.ts'),
  path.resolve(__dirname, 'settings.spec.ts'),
]);
```

Run it with `tsx`:

```bash
BUNDLE_ID=com.myorg.myapp tsx e2e/run.ts

# Step-level output for debugging:
BUNDLE_ID=com.myorg.myapp tsx e2e/run.ts --verbose
```

## Marking elements for testing

Stowaway finds elements by `testID`. Add `testID` props to any component you want to interact with:

```tsx
<TouchableOpacity testID="btn-submit" onPress={handleSubmit}>
  <Text>Submit</Text>
</TouchableOpacity>

<TextInput testID="input-email" onChangeText={setEmail} value={email} />
```

`testID` is the most reliable selector. See [Querying](./querying.md) for alternative selectors when `testID` isn't available.
