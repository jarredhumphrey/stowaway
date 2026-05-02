export interface E2EConfig {
  platform: 'ios' | 'android';
  metroPort: number;
  bundleId: string;
  testResultsDir: string;
  defaultTimeout: number;
  pollInterval: number;
  suiteName?: string;
  verbose: boolean;
  slowReplay: boolean;
  slowReplayDelay: number;
}

export function loadConfig(): E2EConfig {
  const platform = (process.env.PLATFORM ?? 'ios') as 'ios' | 'android';
  if (platform !== 'ios' && platform !== 'android') {
    throw new Error(`PLATFORM must be "ios" or "android", got "${platform}"`);
  }

  const bundleId = process.env.BUNDLE_ID;
  if (!bundleId) {
    throw new Error(
      'BUNDLE_ID env var is required. Set it to your app\'s bundle identifier.\n' +
        'iOS:     BUNDLE_ID=com.example.myapp\n' +
        'Android: BUNDLE_ID=com.example.myapp',
    );
  }

  const verbose =
    process.argv.includes('--verbose') ||
    process.env.VERBOSE === '1' ||
    process.env.VERBOSE === 'true';

  const slowReplay =
    process.env.SLOW_REPLAY === '1' || process.env.SLOW_REPLAY === 'true';

  return {
    platform,
    metroPort: Number(process.env.METRO_PORT ?? 8081),
    bundleId,
    testResultsDir: process.env.TEST_RESULTS_DIR ?? 'test-results',
    defaultTimeout: Number(process.env.DEFAULT_TIMEOUT ?? 10_000),
    pollInterval: 250,
    suiteName: process.env.SUITE_NAME,
    verbose,
    slowReplay,
    slowReplayDelay: Number(process.env.SLOW_REPLAY_DELAY ?? 800),
  };
}
