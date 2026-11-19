import { useEffect, useState } from 'react';
import { readActivity, type Activity } from '../lib/account-api';
import { DEMO_MODE } from '../lib/demo';
async function fetchActivity(cursor?: string) {
  return DEMO_MODE ? { items: ['Project created', 'Requirements saved', 'Files added'].map((action, i) => ({ id: String(i), action, status: 200, created: Date.now() / 1000 - i * 3600, duration_ms: 42 + i * 12, request_id: `sample-${i}` })), next_cursor: null } : readActivity(cursor);
}
export function LogsPage() {
  const [items, setItems] = useState<Activity[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  async function load(more = false) {
    setBusy(true); setError(null);
    try {
      const result = await fetchActivity(more ? cursor ?? undefined : undefined);
      setItems((current) => more ? [...current, ...result.items] : result.items); setCursor(result.next_cursor);
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'Activity unavailable.'); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    let active = true;
    fetchActivity().then((result) => {
      if (active) { setItems(result.items); setCursor(result.next_cursor); }
    }).catch((problem) => {
      if (active) setError(problem instanceof Error ? problem.message : 'Activity unavailable.');
    }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);
  const filtered = items.filter((item) => `${item.action} ${item.request_id} ${item.status}`.toLowerCase().includes(search.toLowerCase()));
  return <main className="home page-main"><header className="page-heading"><div><p className="project-eyebrow">Workspace</p><h1>Activity logs</h1><p>A clear record of requests and changes.</p></div><button className="outline-btn" disabled={busy} onClick={() => void load()}>Refresh</button></header><div className="page-toolbar"><label className="search-box"><input aria-label="Search activity" placeholder="Search activity or request ID" type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label></div>{error && <p className="page-notice" role="alert">{error}</p>}<div className="table-scroll"><table className="data-table"><thead><tr><th>Action</th><th>Time</th><th>Status</th><th>Duration</th><th>Request ID</th></tr></thead><tbody>{filtered.map((item) => <tr key={item.id}><td>{item.action}</td><td>{new Date(item.created * 1000).toLocaleString()}</td><td><span className={`status-badge ${item.status >= 400 ? 'warning' : ''}`}>{item.status || 'Pending'}</span></td><td>{item.duration_ms} ms</td><td><code>{item.request_id}</code></td></tr>)}</tbody></table></div>{!filtered.length && <p className="empty-copy">{busy ? 'Loading activity…' : 'No activity to show.'}</p>}{cursor && <button className="outline-btn" disabled={busy} onClick={() => void load(true)}>Load more</button>}</main>;
}
