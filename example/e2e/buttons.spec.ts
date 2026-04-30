import { describe, it, expect } from 'stowaway';
import type { AppSession } from 'stowaway';

describe('Buttons', () => {
  it('increments the counter', async (app: AppSession) => {
    const btn = await app.find({ testID: 'btn-increment' });
    const value = await app.find({ testID: 'counter-value' });

    await btn.tap();
    await btn.tap();
    await btn.tap();
    expect(await value.text()).toBe('3');
  });

  it('decrements the counter', async (app: AppSession) => {
    const inc = await app.find({ testID: 'btn-increment' });
    const dec = await app.find({ testID: 'btn-decrement' });
    const value = await app.find({ testID: 'counter-value' });

    await inc.tap();
    await inc.tap();
    await dec.tap();
    expect(await value.text()).toBe('1');
  });

  it('resets the counter to 0', async (app: AppSession) => {
    const inc = await app.find({ testID: 'btn-increment' });
    await inc.tap();
    await inc.tap();

    const reset = await app.find({ testID: 'btn-reset' });
    await reset.tap();

    const value = await app.find({ testID: 'counter-value' });
    expect(await value.text()).toBe('0');
  });

  it('shows async result after the operation completes', async (app: AppSession) => {
    const btn = await app.find({ testID: 'btn-async' });
    await btn.tap();
    const result = await app.waitForElement('async-result', { timeout: 5_000 });
    expect(await result.text()).toBe('Done!');
  });

  it('disabled button has accessibilityState.disabled', async (app: AppSession) => {
    const btn = await app.find({ testID: 'btn-disabled' });
    const props = await btn.props();
    expect((props.accessibilityState as Record<string, unknown>)?.disabled).toBe(true);
  });

  it('finds all action buttons', async (app: AppSession) => {
    const buttons = await app.findAll({ component: 'TouchableOpacity' });
    // At least the 5 action buttons + counter buttons should be present
    expect(buttons.length).toBeGreaterThan(5);
  });

  it('longPress triggers the long-press handler', async (app: AppSession) => {
    const btn = await app.find({ testID: 'btn-long-press' });
    await btn.longPress();
    const result = await app.waitForElement('long-press-result', { timeout: 3_000 });
    expect(await result.text()).toBe('Long pressed!');
    await app.waitForElementToDisappear('long-press-result', { timeout: 5_000 });
  });

  it('element appears then disappears', async (app: AppSession) => {
    const btn = await app.find({ testID: 'btn-show-hide' });
    await btn.tap();
    await app.waitForElement('timed-element', { timeout: 3_000 });
    await app.waitForElementToDisappear('timed-element', { timeout: 5_000 });
  });

  it('dismisses the swipe card on a left swipe', async (app: AppSession) => {
    const card = await app.find({ testID: 'swipe-card' });
    await card.swipe('left', 120);
    await app.waitForElement('swipe-dismissed');
  });
});
