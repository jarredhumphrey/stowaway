import { describe, it, expect } from 'stowaway';
import type { AppSession } from 'stowaway';

let retryAttempts = 0;

async function goToForm(app: AppSession) {
  const tab = await app.find({ testID: 'tab-form' });
  await tab.tap();
}

// Normal suite — no modifiers, all tests run.
describe('Form', () => {
  it('plan selection reflects accessibilityState', async (app: AppSession) => {
    await goToForm(app);

    const team = await app.find({ testID: 'plan-team' });
    await team.tap();

    const props = await team.props();
    expect((props.accessibilityState as Record<string, unknown>)?.selected).toBe(true);
  });

  it('submits the form and shows the success banner', async (app: AppSession) => {
    await goToForm(app);

    const submit = await app.find({ testID: 'btn-submit' });
    await submit.tap();

    const banner = await app.waitForElement('form-success', { timeout: 3_000 });
    expect(await banner.exists()).toBe(true);

    const text = await app.find({ testID: 'form-success-text' });
    expect(await text.text()).toContain('Submitted');
  });

  it('clear resets the form', async (app: AppSession) => {
    await goToForm(app);

    const submit = await app.find({ testID: 'btn-submit' });
    await submit.tap();
    await app.waitForElement('form-success');

    const clear = await app.find({ testID: 'btn-clear' });
    await clear.tap();

    const summary = await app.find({ testID: 'summary-plan' });
    expect(await summary.text()).toBe('Plan: free');
  });

  it('typeText fills the name input', async (app: AppSession) => {
    await goToForm(app);

    const input = await app.find({ testID: 'input-name' });
    await input.typeText('Jane Doe');

    const props = await input.props();
    expect((props as Record<string, unknown>).value).toBe('Jane Doe');
  });

  it('clearText empties the name input', async (app: AppSession) => {
    await goToForm(app);

    const input = await app.find({ testID: 'input-name' });
    await input.typeText('Jane Doe');
    await input.clearText();

    const props = await input.props();
    expect((props as Record<string, unknown>).value).toBe('');
  });

  it('submitEditing on name triggers handler', async (app: AppSession) => {
    await goToForm(app);

    const input = await app.find({ testID: 'input-name' });
    await input.focus();
    await input.submitEditing();

    await app.waitForElement('name-submitted', { timeout: 3_000 });
  });

  it('focus and blur update the focus indicator', async (app: AppSession) => {
    await goToForm(app);

    const input = await app.find({ testID: 'input-name' });
    await input.focus();
    await app.waitForElement('input-name-focused', { timeout: 3_000 });

    await input.blur();
    await app.waitForElementToDisappear('input-name-focused', { timeout: 3_000 });
  });
});

// it.skip demo — explicit skip alongside a test that actually runs.
// The skip is unambiguous here: no it.only is suppressing anything.
describe('Form — it.skip demo', () => {
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
describe('Form — it.only demo', () => {
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
describe.skip('Form — describe.skip demo', () => {
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
