import { useState } from 'react';
import { apiRequest, login, type Session } from '../lib/http';

export function LoginPage({ notice, onSignedIn }: { notice: string | null; onSignedIn: (session: Session) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState('');
  const [invite, setInvite] = useState(new URLSearchParams(window.location.search).get('account_invitation') ?? '');
  return <main className="login-page"><div className="login-brand"><span className="brand-symbol">K</span><strong>Kanook</strong></div><section className="login-card"><span className="eyebrow">YOUR DATA, A CLEARER PICTURE</span><h1>Welcome back.</h1><p>Sign in to your workspace to manage datasets, run quality checks, and see what comes next.</p>
    <form onSubmit={async (event) => {
      event.preventDefault(); if (busy) return; setBusy(true); setError(null);
      try {
        let consoleKey = key.trim();
        if (invite) { const accepted = await apiRequest<{ token: string }>('/account/v1/accept-invitation', { method: 'POST', body: JSON.stringify({ invitation_token: invite.trim() }) }, true); consoleKey = accepted.token; }
        const account = await login(consoleKey); setKey(''); setInvite(''); onSignedIn(account);
      } catch (problem) { setError(problem instanceof Error ? problem.message : 'Sign-in failed.'); } finally { setBusy(false); }
    }}><label className="field-stack">{invite ? 'Account invitation code' : 'Console access key'}<input type="password" value={invite || key} required autoComplete="current-password" maxLength={invite ? 43 : 49} minLength={invite ? 43 : 49} disabled={busy} placeholder={invite ? 'Paste your invitation code' : 'Enter your console key'} onChange={(event) => invite ? setInvite(event.target.value) : setKey(event.target.value)} /></label>
      {(error || notice) && <p className="page-notice" role="alert">{error || notice}</p>}<button className="brown-btn" disabled={busy}>{busy ? 'Signing in…' : 'Continue to workspace'} <span aria-hidden="true">→</span></button></form>
    <p className="login-help">Use the console key provided by your workspace administrator. API upload keys cannot sign in.</p><a href="?demo=1#home" className="text-hit">Explore the sample workspace</a>
  </section><footer>Kanook · Dataset intelligence</footer></main>;
}
