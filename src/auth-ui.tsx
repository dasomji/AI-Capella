import { accountStageRecipe } from "./design-system/recipes/auth";
import { useEffect, useId, useState, type FormEvent } from "react";
import { AccountStage } from "./account-stage";
import { Button, ControlGroup, Field, Input, Status } from "./design-system/react";
import { authMessages } from "./i18n";
import { purgeLandingIdentity, storageUnavailable } from './offline-store';
export function AuthPage() {
  const [language, setLanguage] = useState<"en" | "de">("en");
  const [mode, setMode] = useState<"signin" | "signup" | "forgot" | "reset">(
    "signin",
  );
  const [verification, setVerification] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [invite, setInvite] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [confirmationError, setConfirmationError] = useState(false);
  const statusId = useId();
  const [maskedEmail, setMaskedEmail] = useState("");
  const [resendAt, setResendAt] = useState(0);
  const [clock, setClock] = useState(Date.now());
  useEffect(() => { void purgeLandingIdentity().catch(storageUnavailable); }, []);
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const m = authMessages[language];
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  useEffect(() => {
    const stored = localStorage.getItem("ai-capella-lang");
    setLanguage(
      stored === "de" || (!stored && navigator.language.startsWith("de"))
        ? "de"
        : "en",
    );
    const params = new URLSearchParams(location.search);
    const invitation =
      params.get("invite") || sessionStorage.getItem("lightscore-invite");
    if (params.get("mode") === "signup") setMode("signup");
    if (invitation) {
      void fetch(`/api/invitations/${encodeURIComponent(invitation)}`).then(r => r.ok ? r.json() : null).then(data => { if (data) setMaskedEmail(data.email); }).catch(() => {});
      setInvite(invitation);
      sessionStorage.setItem("lightscore-invite", invitation);
      if (params.get("mode") === "signup") setMode("signup");
    }
    if(params.has("verify")){setToken(params.get("verify"));setVerification(true);setMode("reset");history.replaceState(null,"","/");}
    if (params.has("token")) {
      setToken(params.get("token"));
      setMode("reset");
      history.replaceState(null, "", "/");
    }
    if (params.has("error")) setStatus("invalid");
    else {
      const state = params.get("state");
      if (state && ["verified", "expired", "signed-out"].includes(state))
        setStatus(state === "signed-out" ? "signedout" : state);
    }
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setConfirmationError(false);
    setBusy(true);
    setStatus("");
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "");
    const password = String(data.get("password") ?? "");
    if (verification && password !== String(data.get("confirm"))) { setConfirmationError(true); setBusy(false); return; }
    const endpoint = verification ? "verify-email-password" : {
      signin: "sign-in/email",
      signup: "sign-up/email",
      forgot: "request-password-reset",
      reset: "reset-password",
    }[mode];
    const body =
      mode === "reset"
        ? (verification ? {password,token} : { newPassword: password, token })
        : mode === "forgot"
          ? { email, redirectTo: `${location.origin}/` }
          : {
              email,
              password,
              name: String(data.get("name") ?? ""),
              language,
              callbackURL: invite
                ? `${location.origin}/invite/${encodeURIComponent(invite)}`
                : `${location.origin}/?state=verified`,
            };
    try {
      const response = await fetch(`/api/auth/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) {
        setStatus(
          response.status === 429
            ? "limited"
            : result.code === "EMAIL_NOT_VERIFIED"
              ? "unverified"
              : "error",
        );
        return;
      }
      if (mode === "signin") {
        localStorage.removeItem("lightscore-pending-signout");
        location.assign(
          invite ? `/invite/${encodeURIComponent(invite)}` : "/app",
        );
      } else if (mode === "reset") {
        history.replaceState(null, "", "/");
        setMode("signin");
        setVerification(false);
        setStatus(verification ? "verified" : "done");
      } else { setStatus("check"); setResendAt(Date.now() + 60000); }
    } catch {
      setStatus("error");
    } finally {
      setBusy(false);
    }
  }
  function changeMode(next: typeof mode) { setMode(next); setVerification(false); setToken(null); setStatus(""); setShowPassword(false); setConfirmationError(false); }
  async function resend() {
    if (busy || Date.now() < resendAt) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/auth/${mode === "forgot" ? "request-password-reset" : "send-verification-email"}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, redirectTo: location.origin + '/', callbackURL: invite ? `${location.origin}/invite/${encodeURIComponent(invite)}` : `${location.origin}/?state=verified` }),
      });
      setResendAt(Date.now() + 60000);
      if (!response.ok) setStatus(response.status === 429 ? "limited" : "error");
    } catch { setStatus("error"); } finally { setBusy(false); }
  }
  const checking = status === "check";
  const result = ["verified", "invalid", "done"].includes(status);
  return <AccountStage language={language} onLanguage={setLanguage}>
    <h2>{checking ? m.checkTitle : result ? m.resultTitle : verification ? m.confirmPassword : m[mode]}</h2>
    {checking || result ? <>
      <Status variant="account">{m[status as keyof typeof m]}</Status>
      {checking && <p className={accountStageRecipe().email}>{email}</p>}
      <nav className={accountStageRecipe().links}>
        {checking ? <><Button variant="account-link" busy={busy} disabled={clock < resendAt} onClick={() => void resend()}>{m.resend}{clock < resendAt ? ` (${Math.ceil((resendAt - clock) / 1000)} s)` : ""}</Button><span aria-hidden="true"> · </span><Button variant="account-link" onClick={() => setStatus("")}>{m.otherEmail}</Button></> : <Button variant="account-link" onClick={() => changeMode(status === "invalid" ? "forgot" : "signin")}>{status === "invalid" ? m.forgot : m.signin}</Button>}
      </nav>
    </> : <>
      {mode === "signup" && maskedEmail && <p className={accountStageRecipe().hint}>{m.inviteHint.replace('{email}', maskedEmail)}</p>}
      <form onSubmit={submit}>
        {mode === "signup" && <Field label={m.name} variant="ruled-account">
          {association => <Input {...association} name="name" autoComplete="name" required />}
        </Field>}
        {mode !== "reset" && <Field label={m.email} variant="ruled-account" describedBy={status === "error" ? statusId : undefined}>
          {association => <Input {...association} type="email" name="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required />}
        </Field>}
        {mode !== "forgot" && <Field label={m.password} variant="ruled-account" describedBy={status === "error" ? statusId : undefined}>
          {association => <ControlGroup>
            <Input {...association} aria-label={m.password} name="password" type={showPassword ? "text" : "password"} minLength={8} maxLength={128} autoComplete={mode === "signin" || verification ? "current-password" : "new-password"} layout="tw:pr-action-reserve" required />
            <Button variant="password-toggle" aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? m.hide : m.show}</Button>
          </ControlGroup>}
        </Field>}
        {verification && <><p>{m.verificationHelp}</p><Field label={m.repeatPassword} variant="ruled-account" error={confirmationError ? m.error : undefined}>
          {association => <Input {...association} name="confirm" type="password" autoComplete="current-password" onChange={() => setConfirmationError(false)} required />}
        </Field></>}
        <Status id={statusId} variant="account" intent={status && !['signedout', 'expired'].includes(status) ? 'error' : 'neutral'}>{m[status as keyof typeof m] ?? ""}</Status>
        <Button variant="cta" intent="primary" layout="tw:mt-inline" type="submit" busy={busy}>{verification ? m.verifyEmail : m[mode]}</Button>
      </form>
      {status === "unverified" && <nav className={accountStageRecipe().links}><Button variant="account-link" busy={busy} disabled={clock < resendAt} onClick={() => void resend()}>{m.resend}{clock < resendAt ? ` (${Math.ceil((resendAt - clock) / 1000)} s)` : ""}</Button></nav>}
      <nav className={accountStageRecipe().links}>
        {verification && <><Button variant="account-link" onClick={() => changeMode('forgot')}>{m.forgot}</Button><span aria-hidden="true"> · </span></>}
        {mode === "signin" ? <><Button variant="account-link" onClick={() => changeMode('signup')}>{m.signup}</Button><span aria-hidden="true"> · </span><Button variant="account-link" onClick={() => changeMode('forgot')}>{m.forgot}</Button></> : <Button variant="account-link" onClick={() => changeMode('signin')}>{mode === "signup" ? m.haveAccount + ' ' : ''}{m.signin}</Button>}
      </nav>
    </>}
  </AccountStage>;
}
