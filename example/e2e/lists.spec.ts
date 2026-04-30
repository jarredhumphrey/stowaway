import { describe, it, expect } from 'stowaway';
import type { AppSession } from 'stowaway';

async function goToLists(app: AppSession) {
  const tab = await app.find({ testID: 'tab-lists' });
  await tab.tap();
}

describe('Lists', () => {
  it('taps an item and shows it as selected', async (app: AppSession) => {
    await goToLists(app);

    const item = await app.find({ testID: 'list-item-0' });
    await item.tap();

    const label = await app.find({ testID: 'list-selected-label' });
    expect(await label.text()).toContain('Item 1');
  });

  it('reads item title text', async (app: AppSession) => {
    await goToLists(app);

    const title = await app.find({ testID: 'list-item-title-4' });
    expect(await title.text()).toBe('Item 5');
  });

  it('scrolls down to find a far item', async (app: AppSession) => {
    await goToLists(app);

    const item = await app.scrollAndFind('list-item-49', { timeout: 15_000 });
    expect(await item.exists()).toBe(true);

    const title = await app.find({ testID: 'list-item-title-49' });
    expect(await title.text()).toBe('Item 50');
  });

  it('selects an item scrolled into view', async (app: AppSession) => {
    await goToLists(app);

    const item = await app.scrollAndFind('list-item-29', { timeout: 15_000 });
    await item.tap();

    const label = await app.find({ testID: 'list-selected-label' });
    expect(await label.text()).toContain('Item 30');
  });
});
