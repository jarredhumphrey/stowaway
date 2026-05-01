import { TestRunner, loadConfig } from 'stowaway';

const config = loadConfig();
const runner = new TestRunner(config);

runner.run(__dirname);
