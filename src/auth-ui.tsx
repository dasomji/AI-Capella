import { useEffect, useState, type FormEvent } from "react";
import { authMessages } from "./i18n";
export function AuthPage() {
  const [language, setLanguage] = useState<"en" | "de">("en");
  const [mode, setMode] = useState<"signin" | "signup" | "forgot" | "reset">(
    "signin",
  );
  const [token, setToken] = useState<string | null>(null);
  const [invite, setInvite] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
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
    if (invitation) {
      setInvite(invitation);
      sessionStorage.setItem("lightscore-invite", invitation);
      if (params.get("mode") === "signup") setMode("signup");
    }
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
    setBusy(true);
    setStatus("");
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "");
    const password = String(data.get("password") ?? "");
    const endpoint = {
      signin: "sign-in/email",
      signup: "sign-up/email",
      forgot: "request-password-reset",
      reset: "reset-password",
    }[mode];
    const body =
      mode === "reset"
        ? { newPassword: password, token }
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
      if (mode === "signin")
        location.assign(
          invite ? `/invite/${encodeURIComponent(invite)}` : "/app",
        );
      else if (mode === "reset") {
        history.replaceState(null, "", "/");
        setMode("signin");
        setStatus("done");
      } else setStatus("check");
    } catch {
      setStatus("error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-shell">
      <h1>LightScore</h1>
      <select
        aria-label="Language / Sprache"
        value={language}
        onChange={(e) => {
          const value = e.target.value as "en" | "de";
          setLanguage(value);
          localStorage.setItem("ai-capella-lang", value);
        }}
      >
        <option value="en">English</option>
        <option value="de">Deutsch</option>
      </select>
      <h2>{m[mode]}</h2>
      <form onSubmit={submit}>
        {mode === "signup" && (
          <label>
            {m.name}
            <input name="name" autoComplete="name" required />
          </label>
        )}
        {mode !== "reset" && (
          <label>
            {m.email}
            <input
              type="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>
        )}
        {mode !== "forgot" && (
          <label>
            {m.password}
            <input
              name="password"
              type="password"
              minLength={8}
              maxLength={128}
              autoComplete={
                mode === "signin" ? "current-password" : "new-password"
              }
              required
            />
          </label>
        )}
        <button disabled={busy}>{m[mode]}</button>
      </form>
      <p role="status">{m[status as keyof typeof m] ?? ""}</p>
      <nav>
        {(["signin", "signup", "forgot"] as const).map((value) => (
          <button
            key={value}
            onClick={() => {
              setMode(value);
              setStatus("");
            }}
          >
            {m[value]}
          </button>
        ))}
      </nav>
    </main>
  );
}
