import { useEffect, useState, type FormEvent } from 'react';
const messages = {
 en: { signin: 'Sign in', signup: 'Create account', forgot: 'Forgot password', reset: 'Reset password', email: 'Email', password: 'Password', name: 'Name', check: 'Check your email for the next step.', verified: 'Email verified. You can now sign in.', invalid: 'This link is invalid or expired. Request a new email.', expired: 'Your session expired or was revoked. Please sign in again.', signedout: 'You have signed out.', error: 'Unable to continue. Check your details or request a new link.', done: 'Password updated. Please sign in.', unverified: 'Please verify your email before signing in.' },
 de: { signin: 'Anmelden', signup: 'Konto erstellen', forgot: 'Passwort vergessen', reset: 'Passwort zurücksetzen', email: 'E-Mail', password: 'Passwort', name: 'Name', check: 'Prüfe dein E-Mail-Postfach für den nächsten Schritt.', verified: 'E-Mail bestätigt. Du kannst dich jetzt anmelden.', invalid: 'Dieser Link ist ungültig oder abgelaufen. Fordere eine neue E-Mail an.', expired: 'Deine Sitzung ist abgelaufen oder wurde widerrufen. Bitte erneut anmelden.', signedout: 'Du wurdest abgemeldet.', error: 'Das hat nicht funktioniert. Prüfe deine Angaben oder fordere einen neuen Link an.', done: 'Passwort geändert. Bitte anmelden.', unverified: 'Bitte bestätige vor der Anmeldung deine E-Mail.' },
};
export function AuthPage() {
 const [language, setLanguage] = useState<'en'|'de'>('en');
 const [mode, setMode] = useState<'signin'|'signup'|'forgot'|'reset'>('signin');
 const [status, setStatus] = useState(''); const [busy, setBusy] = useState(false);
 const m = messages[language];
 useEffect(() => { document.documentElement.lang = language; }, [language]);
 useEffect(() => {
   const stored = localStorage.getItem('ai-capella-lang');
   setLanguage(stored === 'de' || (!stored && navigator.language.startsWith('de')) ? 'de' : 'en');
   const params = new URLSearchParams(location.search);
   if (params.has('token')) setMode('reset');
   if (params.has('error')) setStatus('invalid');
   else if (params.get('state')) setStatus(params.get('state') === 'signed-out' ? 'signedout' : params.get('state')!);
 }, []);
 async function submit(event: FormEvent<HTMLFormElement>) {
   event.preventDefault(); setBusy(true); setStatus('');
   const data = new FormData(event.currentTarget);
   const email = String(data.get('email') ?? ''); const password = String(data.get('password') ?? '');
   const endpoint = { signin: 'sign-in/email', signup: 'sign-up/email', forgot: 'request-password-reset', reset: 'reset-password' }[mode];
   const body = mode === 'reset' ? { newPassword: password, token: new URLSearchParams(location.search).get('token') } : mode === 'forgot' ? { email, redirectTo: `${location.origin}/` } : { email, password, name: String(data.get('name') ?? ''), language, callbackURL: `${location.origin}/?state=verified` };
   try {
     const response = await fetch(`/api/auth/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
     const result = await response.json();
     if (!response.ok) { setStatus(result.code === 'EMAIL_NOT_VERIFIED' ? 'unverified' : 'error'); return; }
     if (mode === 'signin') location.assign('/app');
     else if (mode === 'reset') { history.replaceState(null, '', '/'); setMode('signin'); setStatus('done'); }
     else setStatus('check');
   } catch { setStatus('error'); } finally { setBusy(false); }
 }
 return <main className="auth-shell"><h1>LightScore</h1><select aria-label="Language / Sprache" value={language} onChange={e => { const value = e.target.value as 'en'|'de'; setLanguage(value); localStorage.setItem('ai-capella-lang', value); }}><option value="en">English</option><option value="de">Deutsch</option></select><h2>{m[mode]}</h2><form onSubmit={submit}>
 {mode === 'signup' && <label>{m.name}<input name="name" autoComplete="name" required /></label>}
 {mode !== 'reset' && <label>{m.email}<input type="email" name="email" autoComplete="email" required /></label>}
 {mode !== 'forgot' && <label>{m.password}<input name="password" type="password" minLength={8} maxLength={128} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required /></label>}
 <button disabled={busy}>{m[mode]}</button></form><p role="status">{m[status as keyof typeof m] ?? ''}</p><nav>{(['signin','signup','forgot'] as const).map(value => <button key={value} onClick={() => { setMode(value); setStatus(''); }}>{m[value]}</button>)}</nav></main>;
}
