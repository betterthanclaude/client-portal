import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';
import { clearSession, getSession } from '../src/lib/http.ts';
import { createApiKey, listConnections, readConnection } from '../src/lib/qc-api.ts';

beforeEach(async (t) => {
  clearSession();
  const mock = t.mock.method(globalThis, 'fetch', async () => Response.json({ csrf: 'test-csrf', organization: 'org', permissions: ['keys:manage'] }));
  await getSession();
  mock.mock.restore();
});

test('reads the real connection-list contract and pagination', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/qc-api/v1/connections?after=customer-videos');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.headers.get('Authorization'), null);
    return Response.json({ items: [{ id: 'bucket-two' }], next_cursor: null });
  });
  assert.deepEqual(await listConnections('customer-videos'), { items: [{ id: 'bucket-two' }], next_cursor: null });
});

test('does not upgrade registered storage into verified readiness', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(url, '/qc-api/v1/connections/customer-videos');
    return Response.json({ id: 'customer-videos', registered: true, storage: 'customer_owned', worker_readiness: 'not_verified' });
  });
  assert.equal((await readConnection('customer-videos')).worker_readiness, 'not_verified');
});

test('issues keys using the backend payload and returns only the server-issued key', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/qc-api/v1/api-keys');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.get('X-CSRF-Token'), 'test-csrf');
    assert.equal(options.credentials, 'include');
    assert.deepEqual(JSON.parse(options.body), { lifetime_hours: 24, name: "Kanook QC", scopes: ["jobs:read", "jobs:write", "results:read", "usage:read"] });
    return Response.json({ id: 'test-key', token: 'test-fixture-only', expires: 2000000000, shown_once: true, scope: 'organization_client_api' }, { status: 201 });
  });
  const key = await createApiKey(24);
  assert.equal(key.token, 'test-fixture-only');
  assert.equal(key.scope, 'organization_client_api');
});

test('reports role restrictions without fabricating a key', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'role_not_permitted' }, { status: 403 }));
  await assert.rejects(createApiKey(24), /does not have permission/);
});

test('reports offline, expired-credential and misconfigured-proxy errors', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('network'); });
  await assert.rejects(listConnections(), /could not be reached/);
  fetch.mock.mockImplementation(async () => Response.json({ error: 'authentication_required' }, { status: 401 }));
  await assert.rejects(listConnections(), /Sign in/);
  fetch.mock.mockImplementation(async () => new Response('<html>Vite fallback</html>', { headers: { 'Content-Type': 'text/html' } }));
  await assert.rejects(listConnections(), /route is unavailable/);
});

test('rejects malformed success payloads', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json({ items: [{ label: 'no id' }] }));
  await assert.rejects(listConnections(), /invalid connection list/);
  fetch.mock.mockImplementation(async () => Response.json({ id: 'test-key' }));
  await assert.rejects(createApiKey(24), /did not return a usable key/);
});
