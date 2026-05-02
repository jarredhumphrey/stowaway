import { describe, it, expect } from 'stowaway';
import type { AppSession } from 'stowaway';

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

// New API demos — prop, pressKey, check/uncheck, selectOption, async matchers
describe('Form — new APIs', () => {
  it('prop() reads a single named prop', async (app: AppSession) => {
    await goToForm(app);
    const input = await app.find({ testID: 'input-name' });
    await input.typeText('Jane');
    expect(await input.prop('value')).toBe('Jane');
  });

  it('pressKey fires the onKeyPress handler', async (app: AppSession) => {
    await goToForm(app);
    const input = await app.find({ testID: 'input-name' });
    await input.focus();
    await input.pressKey('Backspace');
    const indicator = await app.find({ testID: 'last-key-pressed' });
    expect(await indicator.text()).toBe('Last key: Backspace');
  });

  it('check() enables the notifications switch', async (app: AppSession) => {
    await goToForm(app);
    const sw = await app.find({ testID: 'toggle-notifications' });
    await sw.check();
    expect(await sw.isChecked()).toBe(true);
    const summary = await app.find({ testID: 'summary-notifications' });
    expect(await summary.text()).toBe('Notifications: on');
  });

  it('uncheck() disables the notifications switch', async (app: AppSession) => {
    await goToForm(app);
    const sw = await app.find({ testID: 'toggle-notifications' });
    await sw.check();
    await sw.uncheck();
    expect(await sw.isChecked()).toBe(false);
  });

  it('selectOption changes the theme picker', async (app: AppSession) => {
    await goToForm(app);
    const picker = await app.find({ testID: 'picker-theme' });
    await picker.selectOption('dark');
    const summary = await app.find({ testID: 'summary-theme' });
    expect(await summary.text()).toBe('Theme: dark');
  });

  it('async toHaveText matches element text', async (app: AppSession) => {
    await goToForm(app);
    await (await app.find({ testID: 'btn-submit' })).tap();
    const banner = await app.waitForElement('form-success-text');
    await expect(banner).toHaveText('Submitted successfully!');
  });

  it('async toHaveValue reflects typed input', async (app: AppSession) => {
    await goToForm(app);
    const input = await app.find({ testID: 'input-name' });
    await input.typeText('Jane Doe');
    await expect(input).toHaveValue('Jane Doe');
  });

  it('async not.toHaveText asserts text absence', async (app: AppSession) => {
    await goToForm(app);
    const summary = await app.find({ testID: 'summary-plan' });
    await expect(summary).not.toHaveText('Plan: pro');
  });

  it('toBeChecked passes after check()', async (app: AppSession) => {
    await goToForm(app);
    const sw = await app.find({ testID: 'toggle-notifications' });
    await sw.check();
    await expect(sw).toBeChecked();
  });

  it('not.toBeChecked passes when unchecked', async (app: AppSession) => {
    await goToForm(app);
    const sw = await app.find({ testID: 'toggle-notifications' });
    await sw.uncheck();
    await expect(sw).not.toBeChecked();
  });

  it('toHaveFocus passes after focus()', async (app: AppSession) => {
    await goToForm(app);
    const input = await app.find({ testID: 'input-name' });
    await input.focus();
    await expect(input).toHaveFocus();
  });
});
