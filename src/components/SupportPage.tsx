import { useEffect, useRef, useState } from 'react';
import { readGrievances, submitGrievance, type Grievance } from '../lib/account-api';
import { DEMO_MODE } from '../lib/demo';
import type { WorkspaceProject } from '../lib/workspace-api';

export function SupportPage({ projects }: { projects: WorkspaceProject[] }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Grievance | null>(null);
  const [tickets, setTickets] = useState<Grievance[]>([]);
  const attempt = useRef({ payload: '', key: crypto.randomUUID() });
  useEffect(() => { if (!DEMO_MODE) readGrievances().then((result) => setTickets(result.items)).catch((error) => setNotice(error.message)); }, []);
  return <main className="home page-main"><header className="page-heading"><div><p className="project-eyebrow">Support</p><h1>Let's make it right.</h1><p>Share an issue or grievance with your workspace.</p></div></header>
    <div className="support-layout"><section className="surface"><div className="section-heading"><div><h2>Submit a grievance</h2><p>Tell us what happened and what resolution you need.</p></div></div>
      {receipt ? <div className="receipt" role="status"><span className="status-badge">{DEMO_MODE ? 'Preview only' : 'Received'}</span><h2>{DEMO_MODE ? 'Your form preview is ready.' : 'Your grievance has been recorded.'}</h2><p>{DEMO_MODE ? 'No support request was sent in the sample workspace.' : 'Keep this reference for follow-up. Your request is saved in your organization’s support queue.'}</p><code>{receipt.id}</code><button className="outline-btn" onClick={() => { setReceipt(null); setNotice(null); attempt.current = { payload: '', key: crypto.randomUUID() }; }}>Submit another</button></div> : <form className="stack-form" onSubmit={async (event) => {
        event.preventDefault(); if (busy) return;
        const data = new FormData(event.currentTarget);
        const body = { subject: String(data.get('subject')).trim(), category: String(data.get('category')), description: String(data.get('description')).trim(), project_id: String(data.get('project')) || null };
        const payload = JSON.stringify(body);
        if (attempt.current.payload !== payload) attempt.current = { payload, key: crypto.randomUUID() };
        setBusy(true); setNotice(null);
        try { const result = await submitGrievance(body, attempt.current.key); setReceipt(result); setTickets((current) => [result, ...current.filter((ticket) => ticket.id !== result.id)]); }
        catch (error) { setNotice(error instanceof Error ? error.message : 'Could not submit. Your form is still here.'); }
        finally { setBusy(false); }
      }}><div className="form-grid"><label className="field-stack">Category<select name="category"><option value="technical">Technical issue</option><option value="billing">Billing</option><option value="data">Data quality</option><option value="access">Account access</option><option value="other">Other grievance</option></select></label><label className="field-stack">Project <span className="muted">Optional</span><select name="project"><option value="">Workspace-wide</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label></div><label className="field-stack">Subject<input name="subject" required minLength={3} maxLength={160} placeholder="A short summary of the issue" /></label><label className="field-stack">What happened?<textarea name="description" required minLength={20} maxLength={10000} rows={7} placeholder="Include steps to reproduce, relevant job IDs, and your requested resolution." /></label><p className="preview-note">Please leave out passwords, access keys, and private dataset contents.</p>{notice && <p className="page-notice" role="alert">{notice}</p>}<div className="form-actions"><button className="brown-btn" disabled={busy}>{busy ? 'Submitting…' : DEMO_MODE ? 'Preview submission' : 'Submit grievance'} <span aria-hidden="true">→</span></button></div></form>}
    </section><aside className="support-context"><h2>What to include</h2><p>A project or job ID helps us locate the issue. Describe what you expected, what happened, and how it affected your work.</p><hr /><h2>Your requests</h2>{tickets.length ? tickets.map((ticket) => <div className="ticket-preview" key={ticket.id}><strong>{ticket.subject}</strong><span className="status-badge">{ticket.status}</span><small>{new Date(ticket.created * 1000).toLocaleDateString()}</small></div>) : <p>Your submitted requests will appear here.</p>}</aside></div>
  </main>;
}
