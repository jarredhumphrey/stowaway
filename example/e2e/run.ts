import * as path from 'path';
import { TestRunner, loadConfig } from 'stowaway';

const config = loadConfig();
const runner = new TestRunner(config);

runner.run([
  path.resolve(__dirname, 'buttons.spec.ts'),
  path.resolve(__dirname, 'lists.spec.ts'),
  path.resolve(__dirname, 'scroll.spec.ts'),
  path.resolve(__dirname, 'form.spec.ts'),
  path.resolve(__dirname, 'network.spec.ts'),
  path.resolve(__dirname, 'storage.spec.ts'),
]);
