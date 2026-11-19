import { useEffect, useState, type FormEvent } from 'react';
import { createApiKey, getUsage, listQcKeys, revokeQcKey, type IssuedKey, type QcKey, type UsageLedger } from '../lib/qc-api';
import { createUploadKey, listUploadKeys, revokeUploadKey, type UploadKey, type WorkspaceProject } from '../lib/workspace-api';
import { dailyHours } from '../lib/usage';
import { DEMO_MODE } from '../lib/demo';
import { UsageChart } from './UsageChart';

type Props = { project: WorkspaceProject | null; projects: WorkspaceProject[]; tab: 'keys' | 'usage'; navigate: (path: string) => void };
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Could not load this information. Please try again.';
const dateText = (value: number | null) => value ? new Date(value * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export function ApiPage({ project, projects, tab, navigate }: Props) {
  const [revoking, setRevoking] = useState<(QcKey | UploadKey) | null>(null);
  const [scope, setScope] = useState(project?.id || 'qc');
  const [keys, setKeys] = useState<(QcKey | UploadKey)[]>([]);
  const [keyCursor, setKeyCursor] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [keyLoading, setKeyLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [issued, setIssued] = useState<IssuedKey | null>(null);
  const [visible, setVisible] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [days, setDays] = useState(30);
  const [usage, setUsage] = useState<UsageLedger | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60000); return () => window.clearInterval(timer); }, []);

  function refresh() {
    if (tab === 'keys') { setKeyLoading(true); setKeyError(null); }
    else { setUsageLoading(true); setUsageError(null); }
    setReload((value) => value + 1);
  }

  useEffect(() => {
    if (tab !== 'keys') return;
    let active = true;
    const task = scope === 'qc' ? listQcKeys() : listUploadKeys(scope);
    task.then((result) => { if (active) { setKeyError(null); setKeys(result.items); setKeyCursor('next_cursor' in result && typeof result.next_cursor === 'string' ? result.next_cursor : null); } })
      .catch((error) => { if (active) setKeyError(errorText(error)); })
      .finally(() => { if (active) setKeyLoading(false); });
    return () => { active = false; };
  }, [scope, tab, reload]);

  useEffect(() => {
    if (tab !== 'usage') return;
    let active = true;
    const until = Date.now() / 1000;
    getUsage(until - days * 86400, until).then((result) => { if (active) { setUsageError(null); setUsage(result); } })
      .catch((error) => { if (active) setUsageError(errorText(error)); })
      .finally(() => { if (active) setUsageLoading(false); });
    return () => { active = false; };
  }, [days, tab, reload]);

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get('name')).trim(), hours = Number(data.get('lifetime'));
    if (!name) return;
    setGenerating(true); setNotice(null);
    try {
      const key = scope === 'qc' ? await createApiKey(hours, name) : await createUploadKey(scope, hours, name);
      setIssued(key); setVisible(false); setShowForm(false); refresh();
      setNotice(DEMO_MODE ? 'Sample key created. This key is for the demo only.' : 'Key created. Copy it now; the full key is only shown once.');
    } catch (error) { setNotice(errorText(error)); }
    finally { setGenerating(false); }
  }

  async function moreKeys() {
    if (!keyCursor) return;
    setKeyLoading(true);
    try { const result = await listQcKeys(keyCursor); setKeys((current) => [...current, ...result.items]); setKeyCursor(result.next_cursor); }
    catch (error) { setKeyError(errorText(error)); }
    finally { setKeyLoading(false); }
  }

  async function moreUsage() {
    if (!usage?.next_cursor) return;
    setUsageLoading(true);
    try { const result = await getUsage(usage.since, usage.until, usage.next_cursor); setUsage({ ...result, items: [...usage.items, ...result.items] }); }
    catch (error) { setUsageError(errorText(error)); }
    finally { setUsageLoading(false); }
  }

  const filteredKeys = keys.filter((key) => `${key.name} ${key.id}`.toLowerCase().includes(search.toLowerCase()));
  const filteredRuns = usage?.items.filter((run) => `${run.id} ${run.status} ${run.run_kind}`.toLowerCase().includes(search.toLowerCase())) || [];
  const bars = usage ? dailyHours(filteredRuns, usage.since, usage.until) : [];
  const spendBars = usage?.demo ? dailyHours(filteredRuns.map((run) => ({ ...run, measured_hours: run.cost_usd ?? 0 })), usage.since, usage.until) : [];
  const spend = usage?.demo ? usage.spend_usd : undefined;
  const hours = usage ? usage.summary.first_run.measured_hours + usage.summary.rerun.measured_hours : null;

  return <main className="home page-main">
    <header className="page-heading"><div><p className="project-eyebrow">{project ? `Project / ${project.name}` : 'Workspace'}</p><h1>API</h1><nav className="project-breadcrumb" aria-label="Breadcrumb"><button onClick={() => navigate('home')}>Home</button><span>/</span><span>API</span><span>/</span><strong>{tab === 'keys' ? 'Keys' : 'Usage'}</strong></nav></div><span className="scope-note">QC usage is organization-wide</span></header>
    <div className="page-with-rail"><div className="page-content">
      <div className="page-toolbar"><label className="search-box"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg><input type="search" aria-label={tab === 'keys' ? 'Search keys' : 'Search usage by run ID or status'} placeholder={tab === 'keys' ? 'Search keys' : 'Search runs or status'} value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        {tab === 'usage' ? <select aria-label="Usage period" value={days} onChange={(event) => { setDays(Number(event.target.value)); setUsage(null); setUsageError(null); setUsageLoading(true); }}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select> : <select aria-label="Key scope" value={scope} disabled={generating} onChange={(event) => { setScope(event.target.value); setRevoking(null); setIssued(null); setNotice(null); setShowForm(false); setKeyLoading(true); setKeyError(null); setKeys([]); setKeyCursor(null); }}><option value="qc">Organization QC keys</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name} · upload keys</option>)}</select>}
        <button className="outline-btn" disabled={(tab === 'keys' ? keyLoading : usageLoading) || generating} onClick={refresh}>Refresh</button>
      </div>
      {tab === 'usage' ? <>
        {usageError && <div className="page-notice" role="alert">{usageError}</div>}
        <div className="metric-row">
          <div><span>Measured input hours</span><strong>{hours === null ? '—' : hours.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong><small>{usage?.demo ? 'Sample activity in this period' : usage ? `${usage.summary.unmeasured_runs} runs awaiting measurement` : usageLoading ? 'Loading usage…' : 'Usage unavailable'}</small></div>
          <div><span>{usage?.demo ? 'Sample spend' : 'Dollars spent'}</span><strong>{spend === undefined ? '—' : `$${spend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</strong><small>{usage?.demo ? 'Illustrative USD · no charges' : 'Billing data not available'}</small></div>
          <div><span>Runs</span><strong>{usage ? usage.summary.first_run.runs + usage.summary.rerun.runs : '—'}</strong><small>{usage ? `${usage.summary.rerun.runs} reruns` : 'Selected period'}</small></div>
        </div>
        <div className="chart-grid">
          {usage ? <UsageChart title="Hours consumed" subtitle="Input duration · daily, UTC" unit="h" bars={bars.map((bar) => ({ date: bar.date, value: bar.hours }))} /> : <section className="surface chart-card"><h2>Hours consumed</h2><div className="chart-empty">{usageLoading ? 'Loading hours…' : 'Connect your QC account to see usage.'}</div></section>}
          {usage?.demo ? <UsageChart title="Dollars spent" subtitle="Sample spend · USD" unit="$" bars={spendBars.map((bar) => ({ date: bar.date, value: bar.hours }))} /> : <section className="surface chart-card"><h2>Dollars spent</h2><p>Spend over time · USD</p><div className="chart-empty"><span className="empty-mark">$</span><strong>{usage ? 'Billing not connected' : 'Spend unavailable'}</strong><span>{usage ? 'The QC API does not return a priced spending timeline.' : 'Connect your QC account to check billing availability.'}</span></div></section>}
        </div>
        {usage?.next_cursor && <p className="preview-note">Charts show loaded runs. Load more below to complete the timeline.</p>}
        <p className="billing-note">{DEMO_MODE ? 'Illustrative activity and costs. Explore freely — no charges in this demo.' : 'Configuration is free. Reruns and new-project uploads are paid operations. Prices appear when billing is connected.'}</p>
        <section className="surface"><div className="section-heading"><h2>Run history</h2><span>{filteredRuns.length} loaded</span></div>{usage ? <><div className="table-scroll"><table className="data-table"><thead><tr><th>Run</th><th>Submitted</th><th>Type</th><th>Status</th><th>Input hours</th></tr></thead><tbody>{filteredRuns.map((run) => <tr key={run.id}><td><code>{run.id.slice(0, 12)}</code></td><td>{dateText(run.created)}</td><td>{run.run_kind === 'rerun' ? 'Rerun' : 'First run'}</td><td>{run.status}</td><td>{run.measured_hours === null ? 'Awaiting measurement' : run.measured_hours.toFixed(3)}</td></tr>)}</tbody></table></div>{filteredRuns.length === 0 && <p className="empty-copy">No runs match this view.</p>}{usage.next_cursor && <button className="outline-btn more-files" disabled={usageLoading} onClick={() => void moreUsage()}>Load more runs</button>}{usage.summary.unmetered_dataset_jobs > 0 && <p className="preview-note">{usage.summary.unmetered_dataset_jobs} dataset jobs have no hour measurements in this ledger.</p>}</> : <p className="empty-copy">{usageLoading ? 'Loading runs…' : 'Run history is unavailable.'}</p>}</section>
      </> : <>
        <section className="surface"><div className="section-heading"><div><h2>{scope === 'qc' ? 'Organization QC keys' : 'Project upload keys'}</h2><p>{scope === 'qc' ? 'Submit dataset references and read QC results across your organization.' : 'Upload and list files in the selected project.'}</p></div><button className="brown-btn" disabled={generating} onClick={() => setShowForm((value) => !value)}>{showForm ? 'Cancel' : '+ Generate new key'}</button></div>
          {showForm && <form className="key-form" onSubmit={(event) => void generate(event)}><label>Key name<input name="name" required maxLength={80} placeholder="e.g. Development" disabled={generating} /></label><label>Expires in<select name="lifetime" disabled={generating}><option value={24}>24 hours</option><option value={168}>7 days</option><option value={720}>30 days</option></select></label><button className="brown-btn" disabled={generating}>{generating ? 'Generating…' : 'Generate key'}</button></form>}
          {notice && <p className="page-notice" role="status">{notice}</p>}
          {issued && <div className="new-key"><label htmlFor="new-api-key">{DEMO_MODE ? 'Sample key · not valid for real API requests' : 'Save your new key'}</label><div><input id="new-api-key" type={visible ? 'text' : 'password'} readOnly autoComplete="off" value={issued.token} /><button className="outline-btn" onClick={() => setVisible((value) => !value)}>{visible ? 'Hide' : 'Reveal'}</button><button className="outline-btn" onClick={async () => { try { await navigator.clipboard.writeText(issued.token); setNotice('Key copied.'); } catch { setNotice('Reveal the key and copy it manually.'); } }}>Copy key</button></div><p>Expires {dateText(issued.expires)}. Existing secrets cannot be retrieved.</p></div>}
          {revoking && <div className="page-notice"><p>Revoke {revoking.name}? Requests using this key will stop working.</p><div className="inline-actions"><button className="outline-btn" disabled={generating} onClick={() => setRevoking(null)}>Keep key</button><button className="brown-btn" disabled={generating} onClick={async () => { setGenerating(true); try { if (scope === 'qc') await revokeQcKey(revoking.id); else await revokeUploadKey(scope, revoking.id); setRevoking(null); setIssued(null); refresh(); setNotice('Key revoked.'); } catch (error) { setNotice(errorText(error)); } finally { setGenerating(false); } }}>Revoke key</button></div></div>}
          {keyError && <p className="page-notice" role="alert">{keyError}</p>}
          <div className="table-scroll"><table className="data-table"><thead><tr><th>Name / Key ID</th><th>Status</th><th>Created</th><th>Last used</th><th>Expires</th><th /></tr></thead><tbody>{filteredKeys.map((key) => <tr key={key.id}><td><strong>{key.name}</strong><code className="key-id" title={key.id}>{key.id.slice(0, 12)}…</code></td><td><span className={`status-badge ${key.expires * 1000 <= now || ('revoked' in key && key.revoked) ? 'muted' : ''}`}>{'revoked' in key && key.revoked ? 'Revoked' : key.expires * 1000 <= now ? 'Expired' : 'Active'}</span></td><td>{dateText(key.created)}</td><td>{dateText(key.last_used)}</td><td>{dateText(key.expires)}</td><td><button className="text-hit" disabled={generating || Boolean(key.revoked) || key.expires * 1000 <= now} onClick={() => setRevoking(key)}>Revoke</button></td></tr>)}</tbody></table></div>
          {filteredKeys.length === 0 && <p className="empty-copy">{keyLoading ? 'Loading keys…' : keyError ? 'Keys could not be loaded.' : search ? 'No keys match your search.' : 'No keys yet. Generate one to get started.'}</p>}{keyCursor && <button className="outline-btn more-files" disabled={keyLoading} onClick={() => void moreKeys()}>Load more keys</button>}
        </section>
        {scope !== 'qc' && !DEMO_MODE && <details className="surface api-example"><summary>Upload with a project key</summary><ol className="upload-instructions"><li>POST filename, size, and SHA-256 to <code>/workspace/projects/{scope}/files/initiate</code> with your project key as a Bearer token.</li><li>PUT the file bytes to the returned <code>upload_url</code>.</li><li>POST the returned <code>upload_id</code> to <code>/workspace/projects/{scope}/files/complete</code>.</li></ol><button className="text-hit" onClick={() => navigate('docs')}>Read the full API reference</button></details>}
      </>}
    </div><aside className="page-rail" aria-label="API views"><button className={tab === 'keys' ? 'rail-button active' : 'rail-button'} aria-current={tab === 'keys' ? 'page' : undefined} onClick={() => { setSearch(''); navigate('api/keys'); }}>Keys</button><button className={tab === 'usage' ? 'rail-button active' : 'rail-button'} aria-current={tab === 'usage' ? 'page' : undefined} onClick={() => { setSearch(''); navigate('api/usage'); }}>Usage</button></aside></div>
  </main>;
}
