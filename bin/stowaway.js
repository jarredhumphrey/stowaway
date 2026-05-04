#!/usr/bin/env node
'use strict';

const { createInterface } = require('readline/promises');
const fs = require('fs');
const path = require('path');

const BOLD  = '\x1b[1m';
const DIM   = '\x1b[2m';
const GREEN = '\x1b[32m';
const CYAN  = '\x1b[36m';
const RESET = '\x1b[0m';

const TEMPLATES = {
  'run.ts': (outDir) => `\
import { TestRunner, loadConfig } from 'stowaway';
import * as path from 'path';

const runner = new TestRunner(loadConfig());
runner.run(path.resolve(__dirname));
`,

  'smoke.spec.ts': () => `\
import { describe, it } from 'stowaway';
import type { AppSession } from 'stowaway';

describe('Smoke', () => {
  it('app launches and tree is visible', async (app: AppSession) => {
    // printTree() prints your component tree to stdout.
    // Use that output to find testIDs, then replace this with real assertions.
    await app.printTree();
  });
});
`,
};

async function init() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  console.log(`\n${BOLD}stowaway init${RESET}\n`);

  const bundleId = (await rl.question('Bundle ID (e.g. com.myorg.myapp): ')).trim();
  if (!bundleId) { rl.close(); console.error('Bundle ID is required.'); process.exit(1); }

  const outDir = (await rl.question('Output directory [e2e]: ')).trim() || 'e2e';

  const addScriptsAnswer = (await rl.question('Add e2e scripts to package.json? [Y/n]: ')).trim().toLowerCase();
  const addScripts = addScriptsAnswer !== 'n';

  rl.close();

  // Write template files
  fs.mkdirSync(outDir, { recursive: true });
  for (const [filename, template] of Object.entries(TEMPLATES)) {
    fs.writeFileSync(path.join(outDir, filename), template(outDir));
    console.log(`\n${GREEN}✓${RESET} Created ${outDir}/${filename}`);
  }

  // Patch package.json
  if (addScripts) {
    const pkgPath = path.resolve('package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      pkg.scripts = pkg.scripts ?? {};
      pkg.scripts['e2e:ios']     = `PLATFORM=ios BUNDLE_ID=${bundleId} tsx ${outDir}/run.ts`;
      pkg.scripts['e2e:android'] = `PLATFORM=android BUNDLE_ID=${bundleId} tsx ${outDir}/run.ts`;
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
      console.log(`${GREEN}✓${RESET} Added ${CYAN}e2e:ios${RESET} and ${CYAN}e2e:android${RESET} scripts to package.json`);
    } else {
      console.log(`${DIM}  (no package.json found — skipped script injection)${RESET}`);
    }
  }

  console.log(`
${BOLD}Next steps:${RESET}
  1. Boot your iOS Simulator or Android Emulator
  2. Start Metro:        ${DIM}npx react-native start${RESET}
  3. Run the smoke test: ${CYAN}npm run e2e:ios${RESET}
  4. The smoke test prints your component tree — use it to find testIDs
     for your first real spec
`);
}

const command = process.argv[2];
if (command !== 'init') {
  console.log('Usage: stowaway init');
  process.exit(command ? 1 : 0);
}

init().catch(err => { console.error(err.message); process.exit(1); });
