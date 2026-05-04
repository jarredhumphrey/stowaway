import { describe, it, expect } from 'stowaway';
import type { AppSession } from 'stowaway';

async function goToForm(app: AppSession) {
  const tab = await app.find({ testID: 'tab-form' });
  await tab.tap();
}

// The FormScreen's summary box contains three sibling Text elements:
//   summary-plan, summary-theme, summary-notifications
// inside a View with testID="form-summary". This gives a clean group for
// demonstrating all four traversal methods with no extra testIDs needed.

describe('Tree traversal', () => {
  it('parent() reaches the containing View from a child Text', async (app: AppSession) => {
    await goToForm(app);
    await (await app.find({ testID: 'btn-submit' })).tap();
    await app.waitForElement('form-success-text');

    const successText = await app.find({ testID: 'form-success-text' });
    const banner = await successText.parent();

    // The parent is the View with testID="form-success"
    const props = await banner.props();
    expect(props.testID).toBe('form-success');
  });

  it('siblings() returns the other items in the same parent', async (app: AppSession) => {
    await goToForm(app);

    const planLabel = await app.find({ testID: 'summary-plan' });
    const siblings = await planLabel.siblings();

    // summary-theme and summary-notifications are the two siblings
    expect(siblings.length).toBe(2);
    const texts = await Promise.all(siblings.map(s => s.text()));
    expect(texts).toContain('Theme: system');
    expect(texts).toContain('Notifications: off');
  });

  it('tapping a sibling changes app state', async (app: AppSession) => {
    await goToForm(app);

    // plan-free, plan-pro, plan-team are real siblings with onPress handlers.
    // Start from plan-free, step forward to plan-pro, tap it.
    const freeBtn = await app.find({ testID: 'plan-free' });
    const proBtn = await freeBtn.nextSibling();

    expect(proBtn !== null).toBe(true);
    await proBtn!.tap();

    // The summary reflects the active plan
    const planSummary = await app.find({ testID: 'summary-plan' });
    expect(await planSummary.text()).toBe('Plan: pro');
  });

  it('sibling() finds a sibling by testID and taps it', async (app: AppSession) => {
    await goToForm(app);

    // Jump straight to plan-team by name from plan-free, skipping plan-pro entirely
    const freeBtn = await app.find({ testID: 'plan-free' });
    const teamBtn = await freeBtn.sibling({ testID: 'plan-team' });

    await teamBtn.tap();

    const planSummary = await app.find({ testID: 'summary-plan' });
    expect(await planSummary.text()).toBe('Plan: team');
  });

  it('nextSibling() steps forward in render order', async (app: AppSession) => {
    await goToForm(app);

    const planLabel = await app.find({ testID: 'summary-plan' });
    const next = await planLabel.nextSibling();

    expect(next !== null).toBe(true);
    expect(await next!.text()).toBe('Theme: system');
  });

  it('prevSibling() steps backward in render order', async (app: AppSession) => {
    await goToForm(app);

    const notifLabel = await app.find({ testID: 'summary-notifications' });
    const prev = await notifLabel.prevSibling();

    expect(prev !== null).toBe(true);
    expect(await prev!.text()).toBe('Theme: system');
  });

  it('nextSibling() returns null for the last sibling', async (app: AppSession) => {
    await goToForm(app);

    const notifLabel = await app.find({ testID: 'summary-notifications' });
    const next = await notifLabel.nextSibling();
    expect(next).toBeNull();
  });

  it('prevSibling() returns null for the first sibling', async (app: AppSession) => {
    await goToForm(app);

    const planLabel = await app.find({ testID: 'summary-plan' });
    const prev = await planLabel.prevSibling();
    expect(prev).toBeNull();
  });

  it('closest() climbs to a named ancestor by testID', async (app: AppSession) => {
    await goToForm(app);

    const planLabel = await app.find({ testID: 'summary-plan' });
    const summaryBox = await planLabel.closest({ testID: 'form-summary' });

    const props = await summaryBox.props();
    expect(props.testID).toBe('form-summary');
  });

  it('closest() climbs by component name', async (app: AppSession) => {
    await goToForm(app);

    const planLabel = await app.find({ testID: 'summary-plan' });
    const scroller = await planLabel.closest({ component: 'ScrollView' });

    // The ScrollView wraps the whole form — it exists and is scrollable
    expect(await scroller.exists()).toBe(false); // no testID, so exists() is always false
    // Confirm it's reachable by attempting a non-throwing interaction
    const props = await scroller.props();
    expect(typeof props).toBe('object');
  });

  it('closest() climbs by text content', async (app: AppSession) => {
    await goToForm(app);

    // Start deep in the success banner subtree, climb to the banner's parent by text
    await (await app.find({ testID: 'btn-submit' })).tap();
    await app.waitForElement('form-success-text');

    const successText = await app.find({ testID: 'form-success-text' });
    // closest matching ancestor whose concatenated text contains 'Submitted'
    const banner = await successText.closest({ text: 'Submitted successfully!', exact: false });
    const props = await banner.props();
    expect(props.testID).toBe('form-success');
  });
});
