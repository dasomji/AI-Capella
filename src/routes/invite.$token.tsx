import { accountStageRecipe } from "../design-system/recipes/shell";
import { offlineAccountId, purgeAccount } from '../offline-store';
import { AccountStage } from "../account-stage";
import { Button, Status } from "../design-system/react";
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
    if (busy) return;
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
      sessionStorage.removeItem("lightscore-invite");
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
          sessionStorage.removeItem("lightscore-invite");
          setState("not_found");
          return;
        }
        setPreview(data);
        if (data.state !== "pending") {
          sessionStorage.removeItem("lightscore-invite");
          setState(data.state === "accepted" ? "already_used" : data.state);
        }
        if (me.ok) {
          setUser((await me.json()).user);
        }
      } catch {
        sessionStorage.removeItem("lightscore-invite");
        setState("error");
      }
    })();
  }, [token]);
  function authenticate(mode: string) {
    sessionStorage.setItem("lightscore-invite", token);
    location.assign(`/?invite=${encodeURIComponent(token)}&mode=${mode}`);
  }
  const invalid = ["revoked", "expired", "already_used", "not_found", "superseded"].includes(
    state,
  );
  return (
    <AccountStage language={language} onLanguage={setLanguage}>
      {preview && (
        <>
          <h2 className="invitation-title"><span className={accountStageRecipe().invitationKicker}>{text("invitationTitle", { name: "" }).trim()}</span>{" "}<span>{preview.ensembleName}</span></h2>
          <p>{text("invitedBy", { name: preview.inviter })}</p>
          <p className={accountStageRecipe().email}>{preview.email}</p>
        </>
      )}
      <Status variant="account">
        {state === "wrong_account"
          ? text("wrongAccount", {
              email: preview?.email ?? "",
              account: user?.email ?? "",
            })
          : state === "superseded"
            ? text("invitationSuperseded")
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
      </Status>
      {invalid ? (
        <>
          <p>{text("newInvitation")}</p>
          <a href="/app">LightScore</a>
        </>
      ) : state === "wrong_account" ? (
        <Button variant="cta" intent="primary" layout="tw:mt-inline" busy={busy}
          onClick={async () => {
            if (busy) return;
            setBusy(true);
            sessionStorage.removeItem("lightscore-invite");
            try {
              const r = await fetch("/api/auth/sign-out", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "{}",
              });
              if (r.ok) {
                const previous = offlineAccountId();
                if (previous) await purgeAccount(previous);
                authenticate("signin");
              } else setState("error");
            } catch {
              setState("error");
            } finally {
              setBusy(false);
            }
          }}
        >
          {text("switchAccount")}
        </Button>
      ) : preview && user ? (
        <Button variant="cta" intent="primary" layout="tw:mt-inline" busy={busy} onClick={() => void accept()}>
          {text("acceptInvitation")}
        </Button>
      ) : (
        preview && (
          <div>
            <Button variant="cta" intent="primary" layout="tw:mt-inline" onClick={() => authenticate("signup")}>
              {text("createAccount")}
            </Button>
            <nav className={accountStageRecipe().links}><Button variant="account-link" onClick={() => authenticate("signin")}>
              {text("signin")}
            </Button></nav>
          </div>
        )
      )}
    </AccountStage>
  );
}
