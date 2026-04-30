import { describe, it, beforeAll, expect } from 'stowaway';
import type { AppSession } from 'stowaway';

async function goToNetwork(app: AppSession) {
  const tab = await app.find({ testID: 'tab-network' });
  await tab.tap();
}

describe('Network — GET mocking', () => {
  it('shows user data from a mocked response', async (app: AppSession) => {
    await app.mockNetwork(
      { method: 'GET', url: /jsonplaceholder.*\/users\/1/ },
      { status: 200, body: { name: 'Jane Doe', email: 'jane@example.com' } },
    );

    await goToNetwork(app);
    await (await app.find({ testID: 'btn-fetch-user' })).tap();

    const name = await app.waitForElement('network-user-name');
    expect(await name.text()).toBe('Jane Doe');

    const email = await app.find({ testID: 'network-user-email' });
    expect(await email.text()).toBe('jane@example.com');
  });

  it('shows the error state on a 500 response', async (app: AppSession) => {
    await app.mockNetwork(
      { url: /jsonplaceholder.*\/users\/1/ },
      { status: 500, body: { error: 'Internal server error' } },
    );

    await goToNetwork(app);
    await (await app.find({ testID: 'btn-fetch-user' })).tap();

    const error = await app.waitForElement('network-error');
    expect(await error.text()).toContain('500');
  });
});

describe('Network — POST mocking', () => {
  it('shows success after a mocked POST', async (app: AppSession) => {
    await app.mockNetwork(
      { method: 'POST', url: /jsonplaceholder.*\/posts/ },
      { status: 201, body: { id: 101 } },
    );

    await goToNetwork(app);
    await (await app.find({ testID: 'btn-post-comment' })).tap();

    await app.waitForElement('post-success');
  });

  it('records the request payload', async (app: AppSession) => {
    await app.mockNetwork(
      { method: 'POST', url: /jsonplaceholder.*\/posts/ },
      { status: 201, body: { id: 101 } },
    );

    await goToNetwork(app);
    await (await app.find({ testID: 'btn-post-comment' })).tap();
    await app.waitForElement('post-success');

    const reqs = await app.networkRequests();
    const post = reqs.find(r => r.method === 'POST');
    expect(post).not.toBeUndefined();
    expect((post!.body as Record<string, unknown>).userId).toBe(1);
  });

  it('shows error state on a failed POST', async (app: AppSession) => {
    await app.mockNetwork(
      { method: 'POST', url: /jsonplaceholder.*\/posts/ },
      { status: 503, body: { error: 'Service unavailable' } },
    );

    await goToNetwork(app);
    await (await app.find({ testID: 'btn-post-comment' })).tap();

    await app.waitForElement('post-error');
  });
});

describe('Network — suite-level mock', () => {
  beforeAll(async (app: AppSession) => {
    await app.mockNetwork(
      { url: /jsonplaceholder.*\/users\/1/ },
      { status: 200, body: { name: 'Suite User', email: 'suite@example.com' } },
    );
  });

  it('first test sees the suite mock', async (app: AppSession) => {
    await goToNetwork(app);
    await (await app.find({ testID: 'btn-fetch-user' })).tap();

    const name = await app.waitForElement('network-user-name');
    expect(await name.text()).toBe('Suite User');
  });

  it('second test also sees the suite mock after relaunch', async (app: AppSession) => {
    await goToNetwork(app);
    await (await app.find({ testID: 'btn-fetch-user' })).tap();

    const name = await app.waitForElement('network-user-name');
    expect(await name.text()).toBe('Suite User');
  });
});
