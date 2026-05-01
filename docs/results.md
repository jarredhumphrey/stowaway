# Results & CI

## Verbose mode

Enable verbose output with the `--verbose` CLI flag or `VERBOSE=1` environment variable:

```bash
BUNDLE_ID=com.myorg.myapp tsx e2e/run.ts --verbose
VERBOSE=1 BUNDLE_ID=com.myorg.myapp tsx e2e/run.ts
```

In verbose mode, each test prints its name before running, followed by every step as it completes. Only top-level calls from the test are shown — internal polling inside `waitForElement`, `waitForElementToDisappear`, and `scrollAndFind` is suppressed.

```
  Form
    → submits the form and shows the success banner
        find: tab-form
        tap: tab-form
        find: btn-submit
        tap: btn-submit
        waitFor: form-success
        find: form-success-text
    ✓ submits the form and shows the success banner (1247ms)
```

Steps use these labels based on what was called:

| Call | Verbose label |
|---|---|
| `app.find(selector)` | `find: <selector>` |
| `app.findAll(selector)` | `findAll: <selector> (N found)` |
| `app.waitForElement(selector)` | `waitFor: <selector>` |
| `app.waitForElementToDisappear(selector)` | `waitForGone: <selector>` |
| `app.scrollAndFind(testID)` | `scrollAndFind: <testID>` |
| `element.tap()` | `tap: <testID or node:N>` |
| `element.typeText(text)` | `typeText: "text" → <testID>` |
| `element.pressKey(key)` | `pressKey: 'key' → <testID>` |
| `element.check()` / `uncheck()` | `check: <testID>` / `uncheck: <testID>` |
| `element.selectOption(value)` | `selectOption: "value" → <testID>` |
| `element.swipe(dir, dist)` | `swipe: dir Npx on <testID>` |
| `element.dragTo(target)` | `dragTo: <source> → <target>` |

---

## Console output

The runner prints a structured summary to stdout during the run:

```
🧪  My App E2E

  Auth
    ✓ signs in with email (1 243ms)
    ✓ signs out (843ms)
    ✗ resets password (2 001ms)
      Expected: "Reset email sent" (received: "Something went wrong")
      screenshot: test-results/failure-Auth-resets-password-1714000000000.png

  Profile
    ↷ changes the avatar
    ✓ updates the display name (3 112ms)

  Results written to test-results/e2e-results-1714000000000.json
  JUnit XML written to test-results/e2e-results-1714000000000.xml

  1 failed, 3 passed, 1 skipped, 5 total
```

Icons:

| Icon | Meaning |
|---|---|
| `✓` (green) | Test passed |
| `✗` (red) | Test failed — error message printed on the next line |
| `↷` (yellow) | Test skipped — either explicitly (`it.skip`) or implicitly (filtered by `it.only` or `describe.only`) |

The process exits with code `1` if any test failed, `0` otherwise.

---

## JSON results

After every run, results are written to `<TEST_RESULTS_DIR>/e2e-results-<timestamp>.json`. The directory is created automatically.

```json
{
  "results": [
    {
      "suite": "Auth",
      "test": "signs in with email",
      "status": "pass",
      "durationMs": 1243
    },
    {
      "suite": "Auth",
      "test": "resets password",
      "status": "fail",
      "durationMs": 2001,
      "error": "Expected: \"Reset email sent\" (received: \"Something went wrong\")",
      "screenshotPath": "test-results/failure-Auth-resets-password-1714000000000.png"
    },
    {
      "suite": "Profile",
      "test": "changes the avatar",
      "status": "skip",
      "durationMs": 0
    }
  ]
}
```

`status` is one of `"pass"`, `"fail"`, or `"skip"`. `error` and `screenshotPath` are only present on failures.

---

## JUnit XML

A Surefire-compatible JUnit XML file is written to `<TEST_RESULTS_DIR>/e2e-results-<timestamp>.xml` alongside the JSON file. This format is understood by GitHub Actions, Bitrise, Jenkins, CircleCI, and most other CI systems.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuites tests="5" failures="1" skipped="1" time="7.199">
  <testsuite name="Auth" tests="3" failures="1" skipped="0" time="4.087">
    <testcase name="signs in with email" classname="Auth" time="1.243"/>
    <testcase name="signs out" classname="Auth" time="0.843"/>
    <testcase name="resets password" classname="Auth" time="2.001">
      <failure message="Expected: &quot;Reset email sent&quot;">Expected: "Reset email sent" (received: "Something went wrong")</failure>
    </testcase>
  </testsuite>
  <testsuite name="Profile" tests="2" failures="0" skipped="1" time="3.112">
    <testcase name="changes the avatar" classname="Profile" time="0"><skipped/></testcase>
    <testcase name="updates the display name" classname="Profile" time="3.112"/>
  </testsuite>
</testsuites>
```

### GitHub Actions integration

Add a step after your test run to publish the XML report:

```yaml
- name: Run E2E tests
  run: npm run e2e:ios
  env:
    BUNDLE_ID: com.myorg.myapp

- name: Publish test results
  uses: mikepenz/action-junit-report@v4
  if: always()
  with:
    report_paths: test-results/e2e-results-*.xml
```

The `if: always()` condition ensures results are published even when tests fail.

### Bitrise

Use the `Export test results` step and point `test_result_dir` at your `TEST_RESULTS_DIR`. Bitrise auto-discovers JUnit XML files.

---

## Failure screenshots

When a test fails, the runner automatically captures a screenshot and saves it to:

```
<TEST_RESULTS_DIR>/failure-<suite-name>-<test-name>-<timestamp>.png
```

Special characters in suite and test names are replaced with `-`. For example, a failure in `Auth > resets password` produces:

```
test-results/failure-Auth-resets-password-1714000000000.png
```

The screenshot path is included in both the console output and the JSON/XML results.

Screenshots are best-effort — if the screenshot itself fails (e.g. the simulator was unresponsive), the original test failure is still recorded normally.

### Manual screenshots

To capture a diagnostic screenshot mid-test:

```ts
it('fills the form', async (app) => {
  await (await app.find({ testID: 'input-name' })).typeText('Jane');
  await app.screenshot('after-name-input'); // saves test-results/after-name-input-<ts>.png
  // ...
});
```

---

## Gitignore

Add the results directory to `.gitignore`:

```
test-results/
```

Screenshots and result files are runtime artifacts — they shouldn't be committed.

---

## Retaining artifacts on CI

Most CI systems delete the workspace after the build. Configure artifact retention to keep screenshots and XML reports for failed runs:

```yaml
# GitHub Actions
- uses: actions/upload-artifact@v4
  if: failure()
  with:
    name: e2e-results
    path: test-results/
    retention-days: 7
```

This uploads the entire `test-results/` directory (JSON, XML, and PNGs) when the job fails, retaining them for 7 days.
