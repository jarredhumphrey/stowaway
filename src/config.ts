export interface E2EConfig {
  platform: 'ios' | 'android';
  metroPort: number;
  bundleId: string;
  testResultsDir: string;
  defaultTimeout: number;
  pollInterval: number;
  suiteName?: string;
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

  return {
    platform,
    metroPort: Number(process.env.METRO_PORT ?? 8081),
    bundleId,
    testResultsDir: process.env.TEST_RESULTS_DIR ?? 'test-results',
    defaultTimeout: Number(process.env.DEFAULT_TIMEOUT ?? 10_000),
    pollInterval: 250,
    suiteName: process.env.SUITE_NAME,
  };
}
