import { describe, it, expect } from 'stowaway';
import type { AppSession } from 'stowaway';

describe('Storage seeding', () => {
  it('sets and reads back a string value', async (app: AppSession) => {
    await app.setStorage('e2e-token', 'abc123');
    const val = await app.getStorage('e2e-token');
    expect(val).toBe('abc123');
  });

  it('removeStorage deletes the key', async (app: AppSession) => {
    await app.setStorage('e2e-temp', 'to-delete');
    await app.removeStorage('e2e-temp');
    const val = await app.getStorage('e2e-temp');
    expect(val).toBeNull();
  });

  it('clearStorage removes all keys', async (app: AppSession) => {
    await app.setStorage('e2e-a', 'one');
    await app.setStorage('e2e-b', 'two');
    await app.clearStorage();
    const a = await app.getStorage('e2e-a');
    const b = await app.getStorage('e2e-b');
    expect(a).toBeNull();
    expect(b).toBeNull();
  });
});
