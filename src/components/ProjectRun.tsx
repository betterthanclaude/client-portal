import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../lib/http';
import { cancelJob, dispatchProject, executeJob, listProjectRuns, readJob, readResults, type Dispatch, type Job } from '../lib/jobs-api';

export function ProjectRun({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<string[]>([]);
  const [connections, setConnections] = useState<string[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selected, setSelected] = useState<Job | null>(null);
  const [results, setResults] = useState<Record<string, unknown> | null>(null);
  const [review, setReview] = useState<Dispatch | null>(null);
  const [confirm, setConfirm] = useState<'execute' | 'cancel' | null>(null);
  const [resultLoading, setResultLoading] = useState(false);
  const attempt = useRef({ payload: '', key: crypto.randomUUID() });
  const operations = useRef<Record<string, string>>({});
  const busyRef = useRef(false);
  useEffect(() => {
    let active = true;
    listProjectRuns(projectId).then((data) => { if (active) { setJobs(data.items); setSelected(data.items[0] ?? null); } }).catch((error) => { if (active) setNotice(error.message); });
    return () => { active = false; };
  }, [projectId]);
  useEffect(() => {
    if (!open) return;
    let active = true;
    Promise.all([apiRequest<{ items: { id: string }[] }>('/qc-api/v1/connections'), apiRequest<{ items: { id: string }[] }>('/qc-api/v1/execution-profiles')]).then(([storage, execution]) => {
      if (active) { setConnections(storage.items.map((item) => item.id)); setProfiles(execution.items.map((item) => item.id)); }
    }).catch((error) => { if (active) setNotice(error.message); });
    return () => { active = false; };
  }, [open]);
  useEffect(() => {
    if (!selected) return;
    const status = selected.execution?.status ?? selected.execution_status ?? selected.status;
    if (['COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'CANCELLED', 'EXPIRED', 'PLAN_READY'].includes(status)) return;
    let active = true;
    const timer = window.setInterval(() => { if (document.hidden) return; readJob(selected.id).then((job) => { if (active) setSelected(job); }).catch((error) => { if (active) setNotice(error.message); }); }, 8000);
    return () => { active = false; window.clearInterval(timer); };
  }, [selected]);
  async function mutate(task: () => Promise<Job>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setNotice(null);
    try { const result = await task(); setSelected(result); setJobs((current) => [result, ...current.filter((job) => job.id !== result.id)]); setReview(null); setConfirm(null); setOpen(false); setResults(null); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'The request could not be completed. Retry safely with the same request.'); }
    finally { busyRef.current = false; setBusy(false); }
  }
  function operationKey(action: string) { return operations.current[action] ??= crypto.randomUUID(); }
  return <section className="surface"><div className="section-heading"><div><h2>Quality check</h2><p>Dispatch a run using your enrolled dataset and specification.</p></div><button className="outline-btn" disabled={busy} onClick={() => { setOpen((value) => !value); setReview(null); }}>{open ? 'Close setup' : 'Set up a run'}</button></div>
    {notice && <p className="page-notice" role="alert">{notice}</p>}
    {open && <form className="dispatch-form" onSubmit={(event) => {
      event.preventDefault(); const data = new FormData(event.currentTarget);
      setReview({ connection_id: String(data.get('connection')), execution_profile: String(data.get('profile')), dataset: { manifest_id: String(data.get('dataset')).trim(), manifest_sha256: String(data.get('dataset_sha')).trim() }, specification: { manifest_id: String(data.get('specification')).trim(), manifest_sha256: String(data.get('specification_sha')).trim() }, coverage: data.get('coverage') === 'sample' ? { mode: 'sample', every_nth_recording: Number(data.get('every')), offset: 0 } : { mode: 'all' }, deadline_seconds: Number(data.get('deadline')) * 3600 });
    }}><p className="preview-note">The worker reads immutable references from enrolled storage. Your saved project preferences are planning notes; the specification below must contain the executable QC rules.</p><div className="form-grid"><label className="field-stack">Storage connection<select name="connection" required><option value="">Select connection</option>{connections.map((id) => <option key={id}>{id}</option>)}</select></label><label className="field-stack">Execution profile<select name="profile" required><option value="">Select profile</option>{profiles.map((id) => <option key={id}>{id}</option>)}</select></label></div><div className="form-grid">{[['dataset', 'Dataset manifest'], ['specification', 'Specification manifest']].map(([id, title]) => <div className="stack-form" key={id}><label className="field-stack">{title} ID<input name={id} required pattern="[a-f0-9]{32,64}" placeholder="32–64 lowercase hexadecimal characters" /></label><label className="field-stack">{title} SHA-256<input name={`${id}_sha`} required pattern="[a-f0-9]{64}" placeholder="64-character SHA-256 digest" /></label></div>)}</div><details><summary>Coverage & limits</summary><div className="form-grid"><label className="field-stack">Coverage<select name="coverage"><option value="all">All recordings</option><option value="sample">Sample recordings</option></select></label><label className="field-stack">Sample every N recordings<input name="every" type="number" min={2} max={1000000} defaultValue={10} /></label><label className="field-stack">Deadline in hours<input name="deadline" type="number" min={1} max={720} defaultValue={24} required /></label></div><p className="preview-note">Inference budgets are enforced by the backend's configured execution profile.</p></details><div className="form-actions"><button className="brown-btn" disabled={busy}>Review run →</button></div></form>}
    {review && <div className="dispatch-review page-notice"><h2>Ready to submit?</h2><p>This starts dataset planning for <strong>{review.connection_id}</strong> using <strong>{review.execution_profile}</strong>. Reruns are paid operations; your account's pricing applies. This API does not return a price quote.</p><dl className="detail-list"><div><dt>Dataset</dt><dd><code>{review.dataset.manifest_id}</code></dd></div><div><dt>Specification</dt><dd><code>{review.specification.manifest_id}</code></dd></div><div><dt>Coverage</dt><dd>{review.coverage.mode}</dd></div></dl><div className="form-actions"><button className="outline-btn" disabled={busy} onClick={() => setReview(null)}>Back to edit</button><button className="brown-btn" disabled={busy} onClick={() => { const payload = JSON.stringify(review); if (attempt.current.payload !== payload) attempt.current = { payload, key: crypto.randomUUID() }; void mutate(async () => { const job = await dispatchProject(projectId, review, attempt.current.key); attempt.current = { payload: '', key: crypto.randomUUID() }; return job; }); }}>{busy ? 'Submitting…' : 'Submit run'}</button></div></div>}
    {selected && <><div className="job-state"><span className="status-badge">{selected.execution?.status ?? selected.execution_status ?? selected.status}</span><code>{selected.id}</code></div><div className="inline-actions"><button className="outline-btn" disabled={busy} onClick={() => void mutate(() => readJob(selected.id))}>Refresh status</button>{selected.actions?.execute && <button className="brown-btn" disabled={busy} onClick={() => setConfirm('execute')}>Start execution</button>}<button className="outline-btn" disabled={busy || resultLoading} onClick={async () => { setResultLoading(true); try { setResults(await readResults(selected.id)); } catch (error) { setNotice(error instanceof Error ? error.message : 'Results unavailable.'); } finally { setResultLoading(false); } }}>View results</button>{selected.actions?.cancel && <button className="text-hit" disabled={busy} onClick={() => setConfirm('cancel')}>Cancel run</button>}</div>{confirm && <div className="page-notice"><p>{confirm === 'execute' ? 'Execute this dataset plan? This is a paid operation.' : 'Cancel this run? Already consumed processing may still be charged.'}</p><div className="inline-actions"><button className="outline-btn" disabled={busy} onClick={() => setConfirm(null)}>Go back</button><button className="brown-btn" disabled={busy} onClick={() => void mutate(() => confirm === 'execute' ? executeJob(selected.id, operationKey(`execute:${selected.id}`)) : cancelJob(selected.id, operationKey(`cancel:${selected.id}`)))}>Confirm {confirm}</button></div></div>}{results && <details open className="api-schema"><summary>Results returned by the backend</summary><pre>{JSON.stringify(results, null, 2)}</pre></details>}</>}
    {jobs.length > 1 && <details className="api-schema"><summary>Previous runs ({jobs.length})</summary>{jobs.map((job) => <button className="outline-btn" key={job.id} onClick={() => { setSelected(job); setResults(null); setConfirm(null); }}>{job.id.slice(0, 10)} · {job.status}</button>)}</details>}
  </section>;
}
