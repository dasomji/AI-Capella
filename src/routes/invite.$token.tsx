import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { pt, lang, type Lang } from "../i18n";
export const Route = createFileRoute("/invite/$token")({
  component: Invitation,
});
function Invitation() {
  const { token } = Route.useParams();
  const [preview, setPreview] = useState<any>();
  const [user, setUser] = useState<any>();
  const [state, setState] = useState("");
  const [busy, setBusy] = useState(false);
  const [language, setLanguage] = useState<Lang>("en");
  const text = (
    key: Parameters<typeof pt>[0],
    values: Record<string, string> = {},
  ) => pt(key, values, language);
  async function accept() {
    setBusy(true);
    try {
      const r = await fetch(
        `/api/invitations/${encodeURIComponent(token)}/accept`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      );
      const data = await r.json();
      if (!r.ok) {
        setState(data.code);
        return;
      }
      const { initializeEnsembles, setActiveEnsemble } =
        await import("../ensembles");
      await initializeEnsembles();
      setActiveEnsemble(data.ensembleId);
      sessionStorage.setItem("ai-capella-mode-switch", "solo");
      sessionStorage.removeItem("lightscore-invite");
      location.assign("/app");
    } catch {
      setState("error");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    setLanguage(lang);
    void (async () => {
      try {
        const [r, me] = await Promise.all([
          fetch(`/api/invitations/${encodeURIComponent(token)}`),
          fetch("/api/me"),
        ]);
        const data = await r.json();
        if (!r.ok) {
          setState("not_found");
          return;
        }
        setPreview(data);
        if (data.state !== "pending")
          setState(data.state === "accepted" ? "already_used" : data.state);
        if (me.ok) {
          setUser((await me.json()).user);
          if (
            sessionStorage.getItem("lightscore-invite") === token &&
            data.state === "pending"
          )
            void accept();
        }
      } catch {
        setState("error");
      }
    })();
  }, [token]);
  function authenticate(mode: string) {
    sessionStorage.setItem("lightscore-invite", token);
    location.assign(`/?invite=${encodeURIComponent(token)}&mode=${mode}`);
  }
  const invalid = ["revoked", "expired", "already_used", "not_found"].includes(
    state,
  );
  return (
    <main className="auth-shell">
      <h1>LightScore</h1>
      <select
        aria-label="Language / Sprache"
        value={language}
        onChange={(e) => setLanguage(e.target.value as Lang)}
      >
        <option value="de">Deutsch</option>
        <option value="en">English</option>
      </select>
      {preview && (
        <>
          <h2>{text("invitationTitle", { name: preview.ensembleName })}</h2>
          <p>{text("invitedBy", { name: preview.inviter })}</p>
          <p>{preview.email}</p>
        </>
      )}
      <p role="status">
        {state === "wrong_account"
          ? text("wrongAccount", {
              email: preview?.email ?? "",
              account: user?.email ?? "",
            })
          : state === "revoked"
            ? text("invitationRevoked")
            : state === "expired"
              ? text("invitationExpired")
              : state === "already_used"
                ? text("alreadyUsed")
                : state === "not_found"
                  ? text("unavailable")
                  : state
                    ? text("errorGeneric")
                    : ""}
      </p>
      {invalid ? (
        <>
          <p>{text("newInvitation")}</p>
          <a href="/app">LightScore</a>
        </>
      ) : state === "wrong_account" ? (
        <button
          onClick={async () => {
            const r = await fetch("/api/auth/sign-out", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: "{}",
            });
            if (r.ok) authenticate("signin");
            else setState("error");
          }}
        >
          {text("switchAccount")}
        </button>
      ) : preview && user ? (
        <button disabled={busy} onClick={() => void accept()}>
          {text("acceptInvitation")}
        </button>
      ) : (
        preview && (
          <nav>
            <button onClick={() => authenticate("signup")}>
              {text("createAccount")}
            </button>
            <button onClick={() => authenticate("signin")}>
              {text("signin")}
            </button>
          </nav>
        )
      )}
    </main>
  );
}
