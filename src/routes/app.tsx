import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
export const Route = createFileRoute("/app")({ component: Rehearsal });
function Rehearsal() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    let mounted = false;
    const check = async () => {
      if (active && !mounted) {
        const { initializeEnsembles } = await import("../ensembles");
        try { await initializeEnsembles(); }
        catch { location.replace('/?state=expired'); return; }
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
