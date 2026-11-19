import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';
import { apiRequest, clearSession, getSession, login, logout } from '../src/lib/http.ts';
import { dispatchProject } from '../src/lib/jobs-api.ts';
const session = { organization: 'alpha', organization_name: 'Alpha', member_id: 'owner', email: 'owner@example.test', role: 'owner', permissions: ['jobs:write'], csrf: 'fixture-csrf' };
beforeEach(() => clearSession());

test('login uses the backend session and never stores the key in browser storage', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (path, init) => { calls.push({ path, init }); return Response.json(path.endsWith('/login') ? { signed_in: true } : session); });
  assert.deepEqual(await login('fixture-console-key'), session);
  assert.deepEqual(calls.map((call) => call.path), ['/account/v1/login', '/account/v1/session']);
  assert.equal(calls[0].init.credentials, 'include');
  assert.equal(calls[0].init.headers.has('Authorization'), false);
  assert.deepEqual(JSON.parse(calls[0].init.body), { key: 'fixture-console-key' });
});

test('concurrent writes share session lookup and attach CSRF', async (t) => {
  let reads = 0;
  t.mock.method(globalThis, 'fetch', async (path, init) => {
    if (path === '/account/v1/session') { reads++; return Response.json(session); }
    assert.equal(init.headers.get('X-CSRF-Token'), session.csrf);
    assert.equal(init.cache, 'no-store'); assert.equal(init.credentials, 'include');
    return Response.json({ ok: true });
  });
  await Promise.all([apiRequest('/workspace/projects', { method: 'POST', body: '{}' }), apiRequest('/workspace/grievances', { method: 'POST', body: '{}' })]);
  assert.equal(reads, 1);
});

test('expired sessions invalidate cached CSRF without falling back to demo data', async (t) => {
  let reads = 0;
  const mock = t.mock.method(globalThis, 'fetch', async (path) => {
    if (path.endsWith('/session')) { reads++; return Response.json(session); }
    return Response.json({ error: 'authentication_required' }, { status: 401 });
  });
  await getSession();
  await assert.rejects(apiRequest('/workspace/projects'), /Sign in/);
  await getSession(); assert.equal(reads, 2);
  mock.mock.restore();
});

test('logout revokes the cookie session with CSRF before clearing client state', async (t) => {
  t.mock.method(globalThis, 'fetch', async (path, init) => {
    if (path.endsWith('/session')) return Response.json(session);
    assert.equal(path, '/account/v1/logout');
    assert.equal(init.headers.get('X-CSRF-Token'), session.csrf);
    return Response.json({ signed_in: false });
  });
  await logout();
});

test('job dispatch preserves request identity across retries', async (t) => {
  const sent = [];
  const payload = { connection_id: 'source', dataset: { manifest_id: 'a'.repeat(32), manifest_sha256: 'b'.repeat(64) }, specification: { manifest_id: 'c'.repeat(32), manifest_sha256: 'd'.repeat(64) }, execution_profile: 'technical-v1', coverage: { mode: 'all' }, deadline_seconds: 3600 };
  t.mock.method(globalThis, 'fetch', async (path, init) => {
    if (path.endsWith('/session')) return Response.json(session);
    assert.equal(path, '/workspace/projects/project-1/runs');
    sent.push(init.headers.get('Idempotency-Key'));
    assert.deepEqual(JSON.parse(init.body), payload);
    return Response.json({ id: 'queued-job', status: 'QUEUED' });
  });
  await dispatchProject('project-1', payload, 'same-request');
  await dispatchProject('project-1', payload, 'same-request');
  assert.deepEqual(sent, ['same-request', 'same-request']);
});
