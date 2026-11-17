import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

const storage = new Map();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
} });
globalThis.window = { location: { origin: 'https://portal.example' } };
globalThis.fetch = () => { throw new Error('The MVP must not contact a backend.'); };
const api = await import('../src/lib/workspace-api.ts');
const qc = await import('../src/lib/qc-api.ts');
const { DEMO_STORAGE_KEY, demoAnalysis } = await import('../src/lib/demo.ts');
beforeEach(() => storage.clear());

test('sample projects are consistent, persistent, and isolated from real workspace preferences', async () => {
  storage.set('kanook-project', 'real-project');
  const { items } = await api.listProjects();
  assert.equal(items.length, 5);
  assert.equal(items.filter((project) => project.status === 'completed').length, 2);
  for (const item of items) {
    const detail = await api.getProject(item.id);
    assert.equal(item.file_count, detail.files.length);
    assert.equal(item.invitation_count, detail.members.length);
  }
  assert.deepEqual(await api.listProjects(), { items });
  assert.equal(storage.get('kanook-project'), 'real-project');
});

test('solo creation, sample S3 intake and free configuration persist without retaining credentials', async () => {
  const project = await api.createProject('My MVP project');
  assert.equal((await api.getProject(project.id)).members.length, 0);
  await api.connectBucket(project.id, { bucket_url: 's3://demo-data/', region: 'us-east-1', access_key_id: 'do-not-store', secret_access_key: 'secret-never-persisted' });
  const detail = await api.getProject(project.id);
  assert.equal(detail.files.length, 6);
  await api.updateProject(project.id, { configuration: { target_score: 90, selected_file_ids: [detail.files[0].id] }, status: 'completed' });
  const restored = await api.getProject(project.id);
  assert.equal(restored.configuration.target_score, 90);
  assert.equal(restored.status, 'completed');
  assert.equal(restored.files.length, 6);
  assert.ok(!storage.get(DEMO_STORAGE_KEY).includes('secret-never-persisted'));
  await assert.rejects(api.updateProject(project.id, { configuration: { target_score: 85, selected_file_ids: ['another-project-file'] } }), /Choose files/);
});

test('demo invitations do not send email and resolve to the correct project', async () => {
  const member = await api.inviteMember('retail-spaces', 'teammate@example.test');
  assert.equal(member.status, 'pending_delivery');
  const token = new URL(member.invitation_url).searchParams.get('invitation');
  assert.equal((await api.acceptInvitation(token)).id, 'retail-spaces');
  assert.equal((await api.acceptInvitation('demo-join')).id, 'urban-mobility');
  await assert.rejects(api.acceptInvitation('invalid'), /sample invitation/);
});

test('generated sample keys persist as metadata and cannot be mistaken for live credentials', async () => {
  const key = await api.createUploadKey('urban-mobility', 24, 'Demo uploader');
  assert.match(key.token, /^demo_not_a_real_key_/);
  assert.equal((await api.listUploadKeys('urban-mobility')).items[0].name, 'Demo uploader');
  const qcKey = await qc.createApiKey(168, 'MVP research');
  assert.match(qcKey.token, /^demo_not_a_real_key_/);
  assert.equal((await qc.listQcKeys()).items[0].name, 'MVP research');
  assert.ok(!storage.get(DEMO_STORAGE_KEY).includes(key.token));
  assert.ok(!storage.get(DEMO_STORAGE_KEY).includes(qcKey.token));
});

test('file previews store metadata only and cancelled uploads do not change the dataset', async () => {
  const before = (await api.listFiles('urban-mobility')).items.length;
  const file = new File(['private-content-not-to-store'], 'test.mp4');
  await assert.rejects(api.uploadFile('urban-mobility', file, () => {}, AbortSignal.abort()), /cancelled/);
  assert.equal((await api.listFiles('urban-mobility')).items.length, before);
  let progress = 0;
  await api.uploadFile('urban-mobility', file, (value) => { progress = value; }, new AbortController().signal);
  assert.equal(progress, 100);
  assert.equal((await api.listFiles('urban-mobility')).items.length, before + 1);
  assert.ok(!storage.get(DEMO_STORAGE_KEY).includes('private-content-not-to-store'));
});

test('sample usage is time-filtered and its hours and spending reconcile to run history', async () => {
  const until = Date.now() / 1000;
  const usage = await qc.getUsage(until - 30 * 86400, until);
  const week = await qc.getUsage(until - 7 * 86400, until);
  assert.ok(usage.demo && usage.items.length > week.items.length && week.items.length > 0);
  assert.ok(usage.items.every((run) => run.created >= usage.since && run.created < usage.until));
  const round = (value) => Math.round(value * 100) / 100;
  assert.equal(usage.spend_usd, round(usage.items.reduce((sum, run) => sum + run.cost_usd, 0)));
  assert.equal(round(usage.summary.first_run.measured_hours + usage.summary.rerun.measured_hours), round(usage.items.reduce((sum, run) => sum + run.measured_hours, 0)));
});

test('sample analysis responds to file selection and requirements without scoring an empty dataset', async () => {
  const detail = await api.getProject('urban-mobility');
  const full = demoAnalysis(detail.files, detail.requirements);
  const selected = demoAnalysis(detail.files.slice(0, 2), detail.requirements);
  assert.equal(demoAnalysis([], detail.requirements), null);
  assert.ok(full.score >= 0 && full.score <= 100);
  assert.ok(full.hours > selected.hours);
  assert.notEqual(full.score, selected.score);
  const changed = structuredClone(detail.requirements);
  changed.component_weights = { visual_similarity: 0, label_balance: 100 };
  assert.notEqual(demoAnalysis(detail.files, changed).score, full.score);
  assert.deepEqual(demoAnalysis(detail.files, detail.requirements), full);
});
