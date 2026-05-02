import { TestRunner, loadConfig } from 'stowaway';

const config = loadConfig();
const runner = new TestRunner(config);

runner.run(__dirname).catch(err => {
  console.error('\nFatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
