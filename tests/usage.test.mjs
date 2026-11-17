import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dailyHours } from '../src/lib/usage.ts';
import { getUsage, listQcKeys } from '../src/lib/qc-api.ts';

test('usage uses UTC boundaries, distinguishes unmeasured runs and avoids duplicate pagination', () => {
  const since = Date.parse('2026-11-16T00:00:00Z') / 1000;
  const until = since + 2 * 86400;
  const runs = [
    { id: 'a', created: since + 86399, measured_hours: 1.25 },
    { id: 'b', created: since + 86400, measured_hours: 0.5 },
    { id: 'a', created: since + 86399, measured_hours: 1.25 },
    { id: 'c', created: since + 800, measured_hours: null },
    { id: 'outside', created: until, measured_hours: 9 },
  ];
  assert.deepEqual(dailyHours(runs, since, until), [{ date: '2026-11-16', hours: 1.25 }, { date: '2026-11-17', hours: 0.5 }]);
});

test('QC key listing uses the deployed pagination contract', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(url, '/qc-api/v1/api-keys?limit=100&before=key-before');
    return Response.json({ items: [{ id: 'key-id', name: 'Automation' }], next_cursor: null });
  });
  assert.equal((await listQcKeys('key-before')).items[0].name, 'Automation');
});

test('usage preserves the no-pricing signal instead of inventing spend', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(url, '/qc-api/v1/usage/runs?since=100&until=200&limit=100&before=older');
    return Response.json({ items: [], summary: { first_run: { measured_hours: 0 }, rerun: { measured_hours: 0 } }, prices_configured: false });
  });
  assert.equal((await getUsage(100, 200, 'older')).prices_configured, false);
});

test('invalid measurements cannot appear as successful usage', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ items: [{ id: 'bad', created: 150, measured_hours: -5 }], summary: { first_run: {}, rerun: {} } }));
  await assert.rejects(getUsage(100, 200), /invalid usage/);
});
