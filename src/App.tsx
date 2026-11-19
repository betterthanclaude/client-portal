import { useEffect, useState } from 'react';
import { HomePage } from './components/HomePage';
import { LoginPage } from './components/LoginPage';
import { DEMO_MODE } from './lib/demo';
import { ApiError, clearSession, getSession, logout, type Session } from './lib/http';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!DEMO_MODE);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (DEMO_MODE) return;
    let active = true;
    getSession().then((value) => { if (active) setSession(value); }).catch((error) => {
      if (active && !(error instanceof ApiError && error.status === 401)) setNotice(error.message);
    }).finally(() => { if (active) setLoading(false); });
    const expired = () => { clearSession(); setSession(null); setNotice('Your session expired. Sign in to continue.'); };
    window.addEventListener('kanook:session-expired', expired);
    return () => { active = false; window.removeEventListener('kanook:session-expired', expired); };
  }, []);
  if (loading) return <div className="app-loading" role="status"><span className="brand-symbol">K</span>Opening your workspace…</div>;
  if (DEMO_MODE || session) return <HomePage session={session} onSignOut={DEMO_MODE ? undefined : async () => {
    try { await logout(); setSession(null); setNotice(null); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not sign out.'); }
  }} accountNotice={notice} />;
  return <LoginPage notice={notice} onSignedIn={(value) => { setSession(value); setNotice(null); }} />;
}
