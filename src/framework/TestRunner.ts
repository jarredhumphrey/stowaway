import * as fs from 'fs';
import * as path from 'path';
import { AppSession } from './AppSession';
import type { TraceStep } from './TraceCollector';
import { clearSoftFailures, flushSoftFailures } from './expect';
import { generateHtmlReport } from './htmlReport';
import type { E2EConfig } from '../config';

type Hook = (app: AppSession) => Promise<void>;
type TestFn = (app: AppSession) => Promise<void>;

interface ItOpts {
  timeout?: number;
  retries?: number;
}

interface TestCase {
  name: string;
  fn: TestFn;
  skip?: boolean;
  only?: boolean;
  timeout?: number;
  retries?: number;
}

interface Suite {
  name: string;
  tests: TestCase[];
  beforeAllHooks: Hook[];
  beforeEachHooks: Hook[];
  afterEachHooks: Hook[];
  afterAllHooks: Hook[];
  only?: boolean;
  skip?: boolean;
}

interface TestResult {
  suite: string;
  test: string;
  status: 'pass' | 'fail' | 'skip';
  durationMs: number;
  error?: string;
  errorStack?: string;
  screenshotPath?: string;
  replayVideoPath?: string;
  traceSteps?: TraceStep[];
}

// ── Registration API ─────────────────────────────────────────────────────────

const suiteStack: Suite[] = [];
const rootSuites: Suite[] = [];

type DescribeFn = (name: string, fn: () => void) => void;

function runDescribe(name: string, fn: () => void, opts: { skip?: boolean; only?: boolean }): void {
  const suite: Suite = {
    name,
    tests: [],
    beforeAllHooks: [],
    beforeEachHooks: [],
    afterEachHooks: [],
    afterAllHooks: [],
    only: opts.only,
    skip: opts.skip,
  };
  suiteStack.push(suite);
  fn(); // synchronously collect tests
  suiteStack.pop();

  // If this suite is skipped, mark all collected tests as skipped
  if (opts.skip) {
    for (const t of suite.tests) t.skip = true;
  }

  if (suiteStack.length === 0) {
    rootSuites.push(suite);
  } else {
    // nested describe — flatten tests into parent with prefixed names
    const parent = suiteStack[suiteStack.length - 1];
    for (const t of suite.tests) {
      parent.tests.push({ ...t, name: `${name} > ${t.name}` });
    }
  }
}

export const describe: DescribeFn & { skip: DescribeFn; only: DescribeFn } = Object.assign(
  (name: string, fn: () => void) => runDescribe(name, fn, {}),
  {
    skip: (name: string, fn: () => void) => runDescribe(name, fn, { skip: true }),
    only: (name: string, fn: () => void) => runDescribe(name, fn, { only: true }),
  },
);

type ItFn = (name: string, fn: TestFn, opts?: ItOpts) => void;

function registerTest(name: string, fn: TestFn, opts: ItOpts & { skip?: boolean; only?: boolean }): void {
  const suite = suiteStack[suiteStack.length - 1];
  if (!suite) throw new Error(`it("${name}") called outside of describe()`);
  suite.tests.push({ name, fn, ...opts });
}

export const it: ItFn & { skip: ItFn; only: ItFn } = Object.assign(
  (name: string, fn: TestFn, opts?: ItOpts) => registerTest(name, fn, { ...opts }),
  {
    skip: (name: string, fn: TestFn, opts?: ItOpts) => registerTest(name, fn, { ...opts, skip: true }),
    only: (name: string, fn: TestFn, opts?: ItOpts) => registerTest(name, fn, { ...opts, only: true }),
  },
);

export function beforeAll(fn: Hook): void {
  currentSuite().beforeAllHooks.push(fn);
}

export function beforeEach(fn: Hook): void {
  currentSuite().beforeEachHooks.push(fn);
}

export function afterEach(fn: Hook): void {
  currentSuite().afterEachHooks.push(fn);
}

export function afterAll(fn: Hook): void {
  currentSuite().afterAllHooks.push(fn);
}

function currentSuite(): Suite {
  const s = suiteStack[suiteStack.length - 1];
  if (!s) throw new Error('Hook called outside of describe()');
  return s;
}

// ── Runner ───────────────────────────────────────────────────────────────────

export class TestRunner {
  constructor(private config: E2EConfig) {}

  async run(specFilesOrDir: string | string[]): Promise<void> {
    const specFiles = typeof specFilesOrDir === 'string'
      ? fs.readdirSync(specFilesOrDir)
          .filter(f => /\.spec\.[tj]s$/.test(f))
          .sort()
          .map(f => path.join(specFilesOrDir, f))
      : specFilesOrDir;

    for (const file of specFiles) {
      await import(file);
    }

    const runDir = path.join(this.config.testResultsDir, runTimestamp());
    fs.mkdirSync(runDir, { recursive: true });

    const session = new AppSession(this.config);
    session.setResultsDir(runDir);
    const results: TestResult[] = [];

    const label = this.config.suiteName ?? 'E2E';
    console.log(`\n🧪  ${label}\n`);

    const runStart = Date.now();

    try {
      await session.start();
      // Respect describe.only — if any suite is marked only, run only those
      const suitesToRun = rootSuites.some(s => s.only)
        ? rootSuites.filter(s => s.only)
        : rootSuites;

      for (const suite of suitesToRun) {
        console.log(`  ${suite.name}`);

        // Respect it.only within the suite
        const hasOnlyTests = suite.tests.some(t => t.only);
        const testsToRun = hasOnlyTests
          ? suite.tests.filter(t => t.only || t.skip)
          : suite.tests;

        // Tests filtered out by it.only are implicitly skipped
        const implicitlySkipped = hasOnlyTests
          ? suite.tests.filter(t => !t.only && !t.skip)
          : [];

        // beforeAll — mocks registered here are suite-scoped
        session.enterSuiteScope();
        for (const hook of suite.beforeAllHooks) {
          await hook(session);
        }
        session.exitSuiteScope();

        // Print and record implicitly-skipped tests (filtered by only)
        for (const test of implicitlySkipped) {
          console.log(`    ${yellow('↷')} ${test.name}`);
          results.push({ suite: suite.name, test: test.name, status: 'skip', durationMs: 0 });
        }

        for (const test of testsToRun) {
          if (test.skip) {
            console.log(`    ${yellow('↷')} ${test.name}`);
            results.push({ suite: suite.name, test: test.name, status: 'skip', durationMs: 0 });
            continue;
          }

          await session.reset();
          await session.reapplySuiteMocks();

          for (const hook of suite.beforeEachHooks) {
            await hook(session);
          }

          if (this.config.verbose) console.log(`    → ${test.name}`);

          const start = Date.now();
          let status: 'pass' | 'fail' = 'pass';
          let errorMsg: string | undefined;
          let errorStack: string | undefined;
          let screenshotPath: string | undefined;
          let replayVideoPath: string | undefined;
          let traceSteps: TraceStep[] | undefined;

          const timeoutMs = test.timeout ?? this.config.defaultTimeout;
          const retries = test.retries ?? 0;

          clearSoftFailures();
          session.enableTracing();
          try {
            await runWithRetry(test.fn, session, timeoutMs, retries);
            flushSoftFailures();
          } catch (err) {
            status = 'fail';
            errorMsg = err instanceof Error ? err.message : String(err);
            errorStack = err instanceof Error ? err.stack : undefined;

            // Auto-screenshot on failure
            const slug = `failure-${suite.name}-${test.name}`.replace(/[^a-z0-9]/gi, '-');
            try {
              screenshotPath = await session.screenshot(slug);
            } catch { /* non-fatal — screenshot is best-effort */ }
          } finally {
            traceSteps = session.getTrace();
            if (status === 'fail' && traceSteps.length > 0 && !traceSteps.some(s => s.failed)) {
              traceSteps[traceSteps.length - 1].failed = true;
            }
            session.disableTracing();
          }

          if (status === 'fail' && this.config.slowReplay) {
            const replaySlug = `replay-${suite.name}-${test.name}`.replace(/[^a-z0-9]/gi, '-');
            console.log(`    ${dim('⏺  recording slow replay...')}`);
            try {
              await session.reset();
              await session.reapplySuiteMocks();
              session.enableSlowMode(this.config.slowReplayDelay);
              session.enableTracing();
              await session.startRecording(replaySlug);
              // Give the recording process time to start capturing before any interactions fire.
              await new Promise(r => setTimeout(r, 500));
              for (const hook of suite.beforeEachHooks) {
                try { await hook(session); } catch {}
              }
              try {
                await runWithRetry(test.fn, session, timeoutMs * 2, 0);
              } catch {}
              replayVideoPath = await session.stopRecording();
              traceSteps = session.getTrace();
              if (traceSteps.length > 0 && !traceSteps.some(s => s.failed)) {
                traceSteps[traceSteps.length - 1].failed = true;
              }
            } catch (replayErr) {
              const replayMsg = replayErr instanceof Error ? replayErr.message : String(replayErr);
              console.log(`      ${dim('slow replay failed: ' + replayMsg)}`);
              try { await session.stopRecording(); } catch {}
            } finally {
              session.disableSlowMode();
              session.disableTracing();
            }
          }

          const durationMs = Date.now() - start;

          results.push({ suite: suite.name, test: test.name, status, durationMs, error: errorMsg, errorStack, screenshotPath, replayVideoPath, traceSteps });

          const icon = status === 'pass' ? green('✓') : red('✗');
          const dur = dim(`(${durationMs}ms)`);
          console.log(`    ${icon} ${test.name} ${dur}`);
          if (errorMsg) console.log(`      ${red(errorMsg)}`);
          if (screenshotPath) console.log(`      ${dim('screenshot: ' + screenshotPath)}`);
          if (replayVideoPath) console.log(`      ${dim('replay:     ' + replayVideoPath)}`);

          for (const hook of suite.afterEachHooks) {
            try { await hook(session); } catch { /* non-fatal */ }
          }
        }

        for (const hook of suite.afterAllHooks) {
          try { await hook(session); } catch { /* non-fatal */ }
        }
        session.clearSuiteMocks();
      }
    } finally {
      await session.stop();
    }

    this.writeResults(results, runDir);
    this.writeJUnit(results, runDir);
    this.writeHtmlReport(results, runDir);
    this.printSummary(results, Date.now() - runStart);

    const failures = results.filter(r => r.status === 'fail').length;
    if (failures > 0) process.exit(1);
  }

  private writeResults(results: TestResult[], dir: string): void {
    const file = path.join(dir, 'e2e-results.json');
    fs.writeFileSync(file, JSON.stringify({ results }, null, 2));
    console.log(`\n  Results written to ${file}`);
  }

  private writeJUnit(results: TestResult[], dir: string): void {

    // Group by suite name
    const suiteMap = new Map<string, TestResult[]>();
    for (const r of results) {
      if (!suiteMap.has(r.suite)) suiteMap.set(r.suite, []);
      suiteMap.get(r.suite)!.push(r);
    }

    const totalMs = results.reduce((sum, r) => sum + r.durationMs, 0);
    const totalFail = results.filter(r => r.status === 'fail').length;
    const totalSkip = results.filter(r => r.status === 'skip').length;

    const suiteXml = Array.from(suiteMap.entries()).map(([suiteName, suiteResults]) => {
      const suiteMs = suiteResults.reduce((sum, r) => sum + r.durationMs, 0);
      const suiteFail = suiteResults.filter(r => r.status === 'fail').length;
      const suiteSkip = suiteResults.filter(r => r.status === 'skip').length;

      const testCases = suiteResults.map(r => {
        const time = (r.durationMs / 1000).toFixed(3);
        const name = escapeXml(r.test);
        const cls = escapeXml(suiteName);
        if (r.status === 'skip') {
          return `    <testcase name="${name}" classname="${cls}" time="${time}"><skipped/></testcase>`;
        }
        if (r.status === 'fail') {
          const msg = escapeXml(r.error ?? 'Test failed');
          return `    <testcase name="${name}" classname="${cls}" time="${time}"><failure message="${msg}">${msg}</failure></testcase>`;
        }
        return `    <testcase name="${name}" classname="${cls}" time="${time}"/>`;
      }).join('\n');

      return `  <testsuite name="${escapeXml(suiteName)}" tests="${suiteResults.length}" failures="${suiteFail}" skipped="${suiteSkip}" time="${(suiteMs / 1000).toFixed(3)}">\n${testCases}\n  </testsuite>`;
    }).join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites tests="${results.length}" failures="${totalFail}" skipped="${totalSkip}" time="${(totalMs / 1000).toFixed(3)}">\n${suiteXml}\n</testsuites>\n`;

    const file = path.join(dir, 'e2e-results.xml');
    fs.writeFileSync(file, xml);
    console.log(`  JUnit XML written to ${file}`);
  }

  private writeHtmlReport(results: TestResult[], dir: string): void {
    const file = path.join(dir, 'report.html');
    fs.writeFileSync(file, generateHtmlReport(results));
    console.log(`  HTML report:  ${file}`);
    if (!process.env.CI) {
      try {
        const { execFileSync } = require('child_process') as typeof import('child_process');
        const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
        execFileSync(cmd, [file], { stdio: 'ignore' });
      } catch { /* non-fatal — best-effort */ }
    }
  }

  private printSummary(results: TestResult[], elapsedMs: number): void {
    const pass = results.filter(r => r.status === 'pass').length;
    const fail = results.filter(r => r.status === 'fail').length;
    const skip = results.filter(r => r.status === 'skip').length;
    const total = results.length;

    const parts: string[] = [];
    if (fail > 0) parts.push(red(`${fail} failed`));
    if (pass > 0) parts.push(green(`${pass} passed`));
    if (skip > 0) parts.push(yellow(`${skip} skipped`));
    parts.push(`${total} total`);

    console.log(`\n  ${parts.join(', ')} ${dim(`in ${formatDuration(elapsedMs)}`)}\n`);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

async function runWithRetry(
  fn: TestFn,
  app: AppSession,
  timeoutMs: number,
  retries: number,
): Promise<void> {
  const maxAttempts = 1 + retries;
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await Promise.race([
        fn(app),
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error(`Test timed out after ${timeoutMs}ms`)), timeoutMs),
        ),
      ]);
      return; // success
    } catch (err) {
      lastErr = err;
      // retry if attempts remain
    }
  }
  throw lastErr;
}

function runTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
         `T${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ── ANSI helpers ─────────────────────────────────────────────────────────────

function green(s: string): string  { return `\x1b[32m${s}\x1b[0m`; }
function red(s: string): string    { return `\x1b[31m${s}\x1b[0m`; }
function yellow(s: string): string { return `\x1b[33m${s}\x1b[0m`; }
function dim(s: string): string    { return `\x1b[2m${s}\x1b[0m`; }
