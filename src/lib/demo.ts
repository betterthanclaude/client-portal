import type { IssuedKey, QcKey, UsageLedger, UsageRun } from './qc-api.ts';
import type { Member, ProjectRequirements, StoredFile, UploadKey, WorkspaceProject } from './workspace-api.ts';

// Explicit MVP mode, never an automatic fallback for a failed production request.
export const DEMO_MODE = typeof window !== 'undefined' && import.meta.env?.VITE_DEMO_MODE !== 'false';
export const DEMO_STORAGE_KEY = 'kanook-mvp-workspace-v1';
type Detail = WorkspaceProject & { members: Member[]; files: StoredFile[] };
type DemoState = { projects: Detail[]; keys: Record<string, UploadKey[]>; qcKeys: QcKey[]; invitations: Record<string, string> };
const day = 86400;
const now = () => Math.floor(Date.now() / 1000);
const uid = () => crypto.randomUUID();
const round = (value: number) => Math.round(value * 100) / 100;
const hash = (value: string) => {
  let result = [...value].reduce((sum, char) => Math.imul(sum ^ char.charCodeAt(0), 16777619) >>> 0, 2166136261);
  result = Math.imul(result ^ (result >>> 16), 0x45d9f3b);
  return (result ^ (result >>> 16)) >>> 0;
};

function requirements(labels = ['Vehicles', 'Pedestrians', 'Cyclists']): ProjectRequirements {
  return { mode: 'structured', component_weights: { visual_similarity: 60, label_balance: 40 },
    visual_similarity: { context: 30, temporal: 15, layout: 20, family: 10, scene: 25 },
    label_balance: labels.map((label, index) => ({ label, target: [45, 35, 20][index] })),
    notes: 'Prioritize diverse environments, balanced labels, and clear footage across different lighting conditions.' };
}

function sampleFiles(id: string, count: number, folders: string[]): StoredFile[] {
  return Array.from({ length: count }, (_, index) => ({ id: `${id}-file-${index + 1}`,
    name: `${folders[index % folders.length]}/capture_${String(index + 1).padStart(3, '0')}.${index % 5 === 4 ? 'jpg' : 'mp4'}`,
    size: index % 5 === 4 ? 2_400_000 + index * 130_000 : 82_000_000 + index * 7_400_000,
    source: index % 3 ? 's3' : 'device', sha256: null }));
}

function seed(): DemoState {
  const stamp = now();
  const samples = [
    { id: 'urban-mobility', name: 'Urban mobility', count: 24, age: 3, status: 'ongoing', folders: ['daylight', 'night', 'rain'], labels: ['Vehicles', 'Pedestrians', 'Cyclists'] },
    { id: 'retail-spaces', name: 'Retail spaces', count: 18, age: 8, status: 'ongoing', folders: ['checkout', 'aisles', 'entrance'], labels: ['Customers', 'Staff', 'Products'] },
    { id: 'warehouse-activity', name: 'Warehouse activity', count: 32, age: 12, status: 'ongoing', folders: ['loading', 'sorting', 'packing'], labels: ['People', 'Packages', 'Equipment'] },
    { id: 'street-scenes', name: 'Street scenes', count: 16, age: 21, status: 'completed', folders: ['residential', 'commercial', 'junctions'], labels: ['Roads', 'Buildings', 'People'] },
    { id: 'indoor-navigation', name: 'Indoor navigation', count: 12, age: 28, status: 'completed', folders: ['corridors', 'stairs', 'lobbies'], labels: ['Walkways', 'Obstacles', 'Signage'] },
  ] as const;
  const projects: Detail[] = samples.map((sample, index) => ({ id: sample.id, name: sample.name,
    created: stamp - sample.age * day, updated: stamp - (index + 1) * 3600, status: sample.status,
    configuration: { target_score: index > 2 ? 80 : 85, selected_file_ids: null },
    requirements: requirements([...sample.labels]), files: sampleFiles(sample.id, sample.count, [...sample.folders]),
    members: ['maya', 'alex', 'sam'].slice(0, index % 3 + 1).map((name) => ({ id: `${sample.id}-${name}`, email: `${name}@acme.example`, status: 'accepted' })) }));
  return { projects, invitations: { 'demo-join': 'urban-mobility' },
    keys: Object.fromEntries(projects.map((project) => [project.id, [{ id: `demo-upload-${project.id}`, name: 'Dataset uploader', created: stamp - 5 * day, last_used: stamp - 7200, expires: stamp + 25 * day }]])),
    qcKeys: [
      { id: 'demo-qc-production', name: 'Production pipeline', scopes: ['jobs:read', 'jobs:write', 'results:read'], created: stamp - 18 * day, last_used: stamp - 1800, expires: stamp + 72 * day, revoked: false },
      { id: 'demo-qc-notebook', name: 'Research notebook', scopes: ['jobs:read', 'results:read'], created: stamp - 7 * day, last_used: stamp - day, expires: stamp + 23 * day, revoked: false },
      { id: 'demo-qc-archived', name: 'Previous experiment', scopes: ['jobs:read'], created: stamp - 60 * day, last_used: stamp - 31 * day, expires: stamp - day, revoked: false },
    ] };
}

function save(state: DemoState) { localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state)); }
function read(): DemoState {
  const raw = localStorage.getItem(DEMO_STORAGE_KEY);
  if (raw) {
    try { const state = JSON.parse(raw); if (Array.isArray(state.projects) && state.keys && state.qcKeys && state.invitations) return state; }
    catch { /* Restore sample data if this demo's browser storage was corrupted. */ }
  }
  const state = seed(); save(state); return state;
}
function summary(project: Detail): WorkspaceProject {
  const { files, members, ...rest } = project;
  return { ...rest, file_count: files.length, invitation_count: members.length };
}

export function demoUsage(since: number, until: number): UsageLedger {
  const items: UsageRun[] = [];
  const midnight = Math.floor(now() / day) * day;
  for (let offset = 0; offset < 90; offset++) {
    const created = midnight - offset * day + 2 * 3600;
    if (created < since || created >= until) continue;
    const hours = round(2.8 + hash(`hours-${offset}`) % 820 / 100);
    items.push({ id: `demo_${new Date(created * 1000).toISOString().slice(2, 10).replaceAll('-', '')}`, created,
      status: 'Completed', run_kind: offset % 4 === 1 ? 'rerun' : 'first_run', measured_hours: hours,
      measurement: 'sample', cost_usd: round(hours * 8.5) });
  }
  const totals = (kind: string) => { const runs = items.filter((item) => item.run_kind === kind); return { runs: runs.length, measured_runs: runs.length, measured_hours: round(runs.reduce((sum, item) => sum + (item.measured_hours || 0), 0)) }; };
  return { since, until, demo: true, prices_configured: true, spend_usd: round(items.reduce((sum, item) => sum + (item.cost_usd || 0), 0)),
    summary: { first_run: totals('first_run'), rerun: totals('rerun'), unmeasured_runs: 0, unmetered_dataset_jobs: 0 }, items, next_cursor: null };
}

export function demoAnalysis(files: StoredFile[], rules?: ProjectRequirements | null) {
  if (!files.length) return null;
  const names = ['Context diversity', 'Temporal coverage', 'Layout variety', 'Family coverage', 'Scene diversity', 'Label balance', 'Visual clarity'];
  const baselines = [84, 69, 91, 62, 78, 73, 88];
  const averages = names.map((_, component) => round(files.reduce((sum, file) => sum + baselines[component] - 8 + hash(`${file.id}-${component}`) % 160 / 10, 0) / files.length));
  const visualWeights = Object.values(rules?.visual_similarity || {}).map((weight) => weight ?? 20);
  while (visualWeights.length < 5) visualWeights.push(20);
  const visualTotal = visualWeights.reduce((sum, weight) => sum + weight, 0);
  const visual = visualTotal ? averages.slice(0, 5).reduce((sum, score, index) => sum + score * visualWeights[index], 0) / visualTotal : averages.slice(0, 5).reduce((sum, score) => sum + score, 0) / 5;
  const v = rules?.component_weights.visual_similarity ?? 60, b = rules?.component_weights.label_balance ?? 40;
  const score = round(v + b ? (visual * v + averages[5] * b) / (v + b) : (visual + averages[5]) / 2);
  return { score, hours: round(files.filter((file) => file.name.endsWith('.mp4')).reduce((sum, file) => sum + (12 + hash(file.id) % 85) / 60, 0)),
    components: names.map((name, index) => ({ name, score: averages[index] })) };
}

export async function demoRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const state = read(), url = new URL(path, 'https://demo.invalid');
  const parts = url.pathname.split('/').filter(Boolean), method = init.method || 'GET';
  const body = typeof init.body === 'string' ? JSON.parse(init.body) : {};
  const result = (() => {
    if (parts[0] === 'v1') {
      if (parts[1] === 'usage') return demoUsage(Number(url.searchParams.get('since')), Number(url.searchParams.get('until')));
      if (parts[1] === 'connections') return parts[2] ? { id: parts[2], registered: true, storage: 'sample_bucket', worker_readiness: 'demo_only' } : { items: [{ id: 'demo-acme-datasets' }], next_cursor: null };
      if (parts[1] === 'api-keys') {
        if (method === 'GET') return { items: state.qcKeys, next_cursor: null };
        const key = { id: `demo-${uid()}`, name: body.name, scopes: body.scopes, created: now(), expires: now() + body.lifetime_hours * 3600, revoked: false, last_used: null };
        state.qcKeys.unshift(key); save(state);
        return { ...key, token: `demo_not_a_real_key_${uid()}`, shown_once: true, scope: 'organization_client_api' } satisfies IssuedKey;
      }
    }
    if (parts[0] === 'invitations') {
      const id = state.invitations[body.token];
      const project = state.projects.find((item) => item.id === id);
      if (!project) throw new Error('Use the sample invitation code demo-join, or an invitation created in this demo.');
      return summary(project);
    }
    if (parts[0] !== 'projects') throw new Error('This action is not available in the demo.');
    if (!parts[1]) {
      if (method === 'GET') return { items: state.projects.map(summary) };
      const name = String(body.name || '').trim();
      if (!name) throw new Error('Enter a project name.');
      const project: Detail = { id: `demo-${uid()}`, name, status: 'ongoing', created: now(), updated: now(), files: [], members: [], requirements: null, configuration: { target_score: 85, selected_file_ids: null } };
      state.projects.unshift(project); save(state); return summary(project);
    }
    const project = state.projects.find((item) => item.id === parts[1]);
    if (!project) throw new Error('This sample project could not be found. Open a project from the Projects page.');
    if (!parts[2]) {
      if (method === 'PATCH') {
        if (body.requirements) {
          const labels: { label: string; target: number }[] = body.requirements.label_balance;
          if (labels.reduce((sum, label) => sum + label.target, 0) > 100) throw new Error('Label targets must total 100% or less.');
          if (new Set(labels.map((label) => label.label.trim().toLowerCase())).size !== labels.length) throw new Error('Use a different name for each label.');
        }
        if (body.configuration?.selected_file_ids?.some((id: string) => !project.files.some((file) => file.id === id))) throw new Error('Choose files from this project.');
        for (const field of ['status', 'requirements', 'configuration'] as const) if (body[field] !== undefined) Object.assign(project, { [field]: body[field] });
        project.updated = now(); save(state);
      }
      return { ...summary(project), members: project.members, files: project.files };
    }
    if (parts[2] === 'invitations') {
      const token = `demo-invite-${uid()}`;
      const member: Member = { id: uid(), email: body.email, status: 'pending_delivery', invitation_url: `${window.location.origin}/?invitation=${token}` };
      project.members.push(member); state.invitations[token] = project.id; save(state); return member;
    }
    if (parts[2] === 'files') {
      if (method === 'GET') return { items: project.files };
      const file: StoredFile = { id: `demo-file-${uid()}`, name: body.name, size: body.size, source: 'device', sha256: null };
      project.files.unshift(file); save(state); return file;
    }
    if (parts[2] === 's3') {
      const bucket = String(body.bucket_url || '').replace(/^s3:\/\//, '').split('/')[0];
      if (!bucket) throw new Error('Enter a sample bucket URL.');
      const id = `demo-s3-${uid()}`;
      project.files.push(...sampleFiles(id, 6, ['sample-import'])); save(state);
      return { id, bucket, prefix: 'sample-import/', indexed: 6, next_cursor: null };
    }
    if (parts[2] === 'api-keys') {
      if (method === 'GET') return { items: state.keys[project.id] || [] };
      const key: UploadKey = { id: `demo-upload-${uid()}`, name: body.name, created: now(), last_used: null, expires: now() + body.lifetime_hours * 3600 };
      (state.keys[project.id] ||= []).unshift(key); save(state);
      return { ...key, token: `demo_not_a_real_key_${uid()}`, shown_once: true, scope: 'project_upload' } satisfies IssuedKey;
    }
    throw new Error('This action is not available in the demo.');
  })();
  return structuredClone(result) as T;
}
