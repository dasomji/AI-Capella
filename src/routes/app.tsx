import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
export const Route = createFileRoute("/app")({ component: Rehearsal });
function Rehearsal() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    let mounted = false;
    const check = async () => {
      let response: Response;
      try {
        response = await fetch("/api/me");
      } catch {
        return;
      }
      if (response.status === 401) {
        location.replace("/?state=expired");
        return;
      }
      if (!response.ok) return;
      if (active && !mounted) {
        const { initializeEnsembles } = await import("../ensembles");
        await initializeEnsembles();
        mounted = true;
        setReady(true);
        await import("../main");
      }
    };
    void check();
    const timer = setInterval(() => {
      void check();
    }, 30_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  return (
    <>
      <div id="app" />
      {!ready && <p className="auth-shell">LightScore…</p>}
    </>
  );
}
