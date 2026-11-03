import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
export const Route = createFileRoute('/app')({ component: Rehearsal });
function Rehearsal() {
  const [ready, setReady] = useState(false);
  const [language, setLanguage] = useState('en');
  useEffect(() => {
    setLanguage(localStorage.getItem('ai-capella-lang') ?? navigator.language);
    let active = true;
    const check = async () => {
      let response: Response;
      try { response = await fetch('/api/me'); } catch { return; }
      if (response.status === 401) { location.replace('/?state=expired'); return; }
      if (!response.ok) return;
      if (active) { setReady(true); await import('../main'); }
    };
    void check();
    const timer = setInterval(() => { void check(); }, 30_000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  return <><div id="app" /><button className="account-exit" onClick={async () => {
    const response = await fetch('/api/auth/sign-out', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (response.ok) location.replace('/?state=signed-out');
  }}>{language.startsWith('de') ? 'Abmelden' : 'Sign out'}</button>{!ready && <p className="auth-shell">LightScore…</p>}</>;
}
