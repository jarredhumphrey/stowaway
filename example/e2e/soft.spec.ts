import { describe, it, expect } from 'stowaway';
import type { AppSession } from 'stowaway';

describe('Soft assertions', () => {
  it('multiple soft checks pass when all correct', async (app: AppSession) => {
    const btn = await app.find({ testID: 'btn-increment' });
    await btn.tap();
    await btn.tap();
    const value = await app.find({ testID: 'counter-value' });
    expect.soft(await value.text()).toBe('2');
    expect.soft(await value.text()).toContain('2');
  });

  it('soft failure demo (intentional — 2 failures collected)', async (app: AppSession) => {
    const value = await app.find({ testID: 'counter-value' });
    expect.soft(await value.text()).toBe('999');   // wrong — soft fail 1
    expect.soft(await value.text()).toBe('1000');  // wrong — soft fail 2
    const btn = await app.find({ testID: 'btn-increment' });
    await btn.tap();
    expect.soft(await value.text()).toBe('1');     // correct — passes
    // TestRunner flushes: 2 soft assertions failed
  });
});
