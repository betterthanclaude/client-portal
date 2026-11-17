import { DEMO_MODE } from '../lib/demo';
import { useState, type FormEvent } from 'react';
import { inviteMember, type Member } from '../lib/workspace-api';

export function ProjectMembers({ projectId, members, onInvite, onClose }: { projectId: string; members: Member[]; onInvite: (member: Member) => void; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice(null);
    try {
      const result = await inviteMember(projectId, email.trim().toLowerCase());
      onInvite(result); setEmail('');
      setNotice(DEMO_MODE ? 'Demo invitation created. No email was sent.' : result.status === 'sent' ? 'Invitation email sent.' : 'Invitation created. Email was not sent; copy the link to share it.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not create an invitation.'); }
    finally { setBusy(false); }
  }
  return <section className="members-panel" id="project-members" aria-labelledby="members-title"><div className="members-heading"><div><h2 id="members-title">Invite people</h2><p>Work solo or bring your team in whenever you’re ready.</p></div><button className="text-hit" type="button" onClick={onClose}>Done</button></div><form className="invite-row" onSubmit={(event) => void invite(event)}><label className="sr" htmlFor="member-email">Member email</label><input id="member-email" type="email" value={email} required placeholder="name@company.com" disabled={busy} onChange={(event) => setEmail(event.target.value)} /><button disabled={busy}>{busy ? 'Inviting…' : 'Create invitation'}</button></form>{members.length > 0 && <ul className="member-list">{members.map((member) => <li key={member.id}><span>{member.email}</span><small>{({ pending_delivery: 'Email not sent', delivery_failed: 'Email failed', sent: 'Email sent', accepted: 'Joined' })[member.status]}</small>{member.invitation_url && <button type="button" className="outline-btn" onClick={async () => { try { await navigator.clipboard.writeText(member.invitation_url!); setNotice('Invitation link copied.'); } catch { setNotice(`Copy this link: ${member.invitation_url}`); } }}>Copy link</button>}</li>)}</ul>}{notice && <p className="home-note" role="status">{notice}</p>}<p className="preview-note">{DEMO_MODE ? 'Sample invitations work in this browser only. No emails are sent.' : 'Links expire in 7 days. Copy a new link before leaving this page. Email delivery requires workspace email setup.'}</p></section>;
}
