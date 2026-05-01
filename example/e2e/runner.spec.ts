import { describe, it, expect } from 'stowaway';
import type { AppSession } from 'stowaway';

let retryAttempts = 0;

async function goToForm(app: AppSession) {
  const tab = await app.find({ testID: 'tab-form' });
  await tab.tap();
}

// it.skip demo — explicit skip alongside a test that actually runs.
// The skip is unambiguous here: no it.only is suppressing anything.
describe('Modifier: it.skip', () => {
  it.skip('selects a plan (explicitly skipped)', async (app: AppSession) => {
    await goToForm(app);
    const pro = await app.find({ testID: 'plan-pro' });
    await pro.tap();
    const summary = await app.find({ testID: 'summary-plan' });
    expect(await summary.text()).toBe('Plan: pro');
  });

  it('default plan is free (runs normally)', async (app: AppSession) => {
    await goToForm(app);
    const summary = await app.find({ testID: 'summary-plan' });
    expect(await summary.text()).toBe('Plan: free');
  });
});

// it.only demo — one test runs; its sibling is implicitly skipped.
describe('Modifier: it.only', () => {
  it.only('notifications are off by default (only this runs)', async (app: AppSession) => {
    await goToForm(app);
    const summary = await app.find({ testID: 'summary-notifications' });
    expect(await summary.text()).toBe('Notifications: off');
  });

  it('implicitly skipped because of it.only above', async (_app: AppSession) => {
    throw new Error('This should never execute');
  });
});

// describe.skip demo — the entire suite is skipped; no tests inside run.
describe.skip('Modifier: describe.skip', () => {
  it('test A (never runs)', async (_app: AppSession) => {
    throw new Error('This should never execute');
  });

  it('test B (never runs)', async (_app: AppSession) => {
    throw new Error('This should never execute');
  });
});

// Runner feature demos — retry and auto-screenshot on failure.
describe('Runner features', () => {
  it('passes after two failures (retry demo)', async (_app: AppSession) => {
    retryAttempts++;
    if (retryAttempts < 3) {
      throw new Error(`Simulated flake — attempt ${retryAttempts} of 3`);
    }
  }, { retries: 2 });

  it('intentional failure (screenshot demo)', async (_app: AppSession) => {
    expect(false).toBe(true);
  });
});
