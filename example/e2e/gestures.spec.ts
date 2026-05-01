import { describe, it, expect } from 'stowaway';
import type { AppSession } from 'stowaway';

async function goToGestures(app: AppSession) {
  const tab = await app.find({ testID: 'tab-gestures' });
  await tab.tap();
}

async function goToForm(app: AppSession) {
  const tab = await app.find({ testID: 'tab-form' });
  await tab.tap();
}

describe('Gestures', () => {
  it('doubleTap increments the double-tap counter', async (app: AppSession) => {
    await goToGestures(app);
    const target = await app.find({ testID: 'double-tap-target' });
    const count = await app.find({ testID: 'double-tap-count' });
    expect(await count.text()).toBe('0');
    await target.doubleTap();
    expect(await count.text()).toBe('1');
  });

  it('dragTo fires the pan gesture toward the drop zone', async (app: AppSession) => {
    await goToGestures(app);
    const dragItem = await app.find({ testID: 'drag-item' });
    const dropZone = await app.find({ testID: 'drop-zone' });
    await dragItem.dragTo(dropZone);
    await app.waitForElement('drop-result', { timeout: 3_000 });
  });

  it('inputValue reads the current TextInput value', async (app: AppSession) => {
    await goToForm(app);
    const input = await app.find({ testID: 'input-name' });
    await input.typeText('Jane Doe');
    expect(await input.inputValue()).toBe('Jane Doe');
  });

  it('finds a TextInput by exact placeholder text', async (app: AppSession) => {
    await goToForm(app);
    const input = await app.find({ placeholder: 'Enter your email' });
    await input.typeText('hello@example.com');
    expect(await input.inputValue()).toBe('hello@example.com');
  });

  it('finds a TextInput by partial placeholder text', async (app: AppSession) => {
    await goToForm(app);
    const input = await app.find({ placeholder: 'your name', exact: false });
    await input.typeText('Partial match');
    expect(await input.inputValue()).toBe('Partial match');
  });

  it('finds all tab elements by accessibilityRole', async (app: AppSession) => {
    const tabs = await app.findAll({ accessibilityRole: 'tab' });
    expect(tabs.length).toBe(6);
  });

  it('find returns first element by accessibilityRole', async (app: AppSession) => {
    const tab = await app.find({ accessibilityRole: 'tab' });
    expect(await tab.exists()).toBe(false); // no testID on the result, exists() returns false
    // confirm we got a real element by tapping it without error
    await tab.tap();
  });
});
