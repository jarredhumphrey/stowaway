import { describe, it, expect } from 'stowaway';
import type { AppSession } from 'stowaway';

async function goToScroll(app: AppSession) {
  const tab = await app.find({ testID: 'tab-scroll' });
  await tab.tap();
}

describe('Scroll', () => {
  it('finds a horizontal card', async (app: AppSession) => {
    await goToScroll(app);

    const card = await app.find({ testID: 'card-0' });
    expect(await card.exists()).toBe(true);
  });

  it('taps a card and shows the selected label', async (app: AppSession) => {
    await goToScroll(app);

    const card = await app.find({ testID: 'card-2' });
    await card.tap();

    const label = await app.find({ testID: 'card-selected-label' });
    expect(await label.text()).toContain('Card 3');
  });

  it('finds a chip in a horizontal section', async (app: AppSession) => {
    await goToScroll(app);

    const chip = await app.find({ testID: 'chip-0-0' });
    expect(await chip.text()).toBe('1.1');
  });

  it('finds a section via vertical scroll', async (app: AppSession) => {
    await goToScroll(app);

    const section = await app.scrollAndFind('section-7', { timeout: 12_000 });
    expect(await section.exists()).toBe(true);
  });

  it('scrollToX scrolls the horizontal card list', async (app: AppSession) => {
    await goToScroll(app);

    // Cards are 120 px wide each; card-10 is off-screen on a standard phone
    const list = await app.find({ testID: 'cards-horizontal' });
    await list.scrollToX(1_200);

    const card = await app.waitForElement('card-10', { timeout: 3_000 });
    expect(await card.exists()).toBe(true);
  });
});
