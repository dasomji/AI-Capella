import { ToggleGroup } from "./design-system/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AdminDataTable, type AdminColumn } from "./admin-data-table";
import { AdminToolbar } from "./admin-toolbar";
import { EnsembleDetail, PieceDetail, UserDetail } from "./admin-detail";
import { TranscriptionScreen } from "./admin-transcription";
import { AdminContext, Count, Identifier, Instant, StateBadge, YesNo, ui, useAdmin, vocabulary, type AdminRow } from "./admin-format";
import { calendarInstant } from "./admin-time";
import { adminUiMessages, type Lang } from "./i18n";
import { brandRecipe } from "./design-system/recipes/auth";

export const adminSections = ["users", "ensembles", "pieces", "transcription", "audit"] as const;
export type AdminSection = (typeof adminSections)[number];
type Query = Record<string, string>;

/** Resolves `/admin/<section>/<id>` from the router's splat on server and client alike (TAB-10). */
export function adminLocation(splat: string | undefined) {
  const [first, ...rest] = (splat ?? "").split("/").filter(Boolean);
  const section = (adminSections as readonly string[]).includes(first) ? (first as AdminSection) : "users";
  const id = ["users", "ensembles", "pieces"].includes(section) && rest.length ? decodeURIComponent(rest.join("/")) : undefined;
  return { section, id };
}

/** URL keys that are list filters; anything else (for example ?design=) is preserved untouched. */
const filterKeys = ["search", "verified", "sysadmin", "format", "ensemble", "targetType", "action", "outcome", "actor", "target", "state", "from", "to", "all"];

export function AdminPage({ splat, query: search }: { splat?: string; query: Query }) {
  const query = Object.fromEntries(Object.entries(search).filter(([key]) => filterKeys.includes(key)));
  const preserved = Object.fromEntries(Object.entries(search).filter(([key]) => !filterKeys.includes(key)));
  const [language, setLanguage] = useState<Lang>("en"), [zone, setZone] = useState("UTC");
  const navigate = useNavigate();
  const { section, id } = adminLocation(splat);
  // The first render matches SSR; the stored language applies after hydration.
  useEffect(() => { setLanguage(localStorage.getItem("ai-capella-lang") === "de" ? "de" : "en"); }, []);
  // MOB-11: assistive technology follows the visible administration language.
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  const t = adminUiMessages[language];
  const context = useMemo(() => ({ language, zone, setZone }), [language, zone]);
  const setQuery = (next: Query) => {
    void navigate({ to: "/admin/$", params: { _splat: splat ?? section }, search: { ...preserved, ...next }, replace: true });
  };
  const titles: Record<AdminSection, string> = {
    users: t.allUsers, ensembles: t.allEnsembles, pieces: t.allPieces,
    transcription: vocabulary("transcription", language), audit: vocabulary("audit", language),
  };
  return (
    <AdminContext value={context}>
      <main className={ui.shell} data-admin="shell" lang={language}>
        <div className={ui.frame}>
          <header className={ui.bar}>
            <a href="/app" className={ui.brand} aria-label={"LightScore · " + t.back}>
              <span className={brandRecipe().wordmark} aria-hidden="true"><span className={brandRecipe().script}>Light</span>Score</span>
              <span className={ui.area}>{t.area}</span>
            </a>
            <div className={ui.barEnd}>
              <a href="/app" className={ui.back}>{t.back}</a>
              <ToggleGroup
                variant="language"
                separator=" · "
                label={t.language}
                items={[{ value: "de", label: "DE" }, { value: "en", label: "EN" }]}
                value={language}
                onChange={(value) => {
                  const next = value as Lang;
                  localStorage.setItem("ai-capella-lang", next);
                  setLanguage(next);
                }}
              />
            </div>
          </header>
          <nav className={ui.nav} aria-label={t.sections}>
            {adminSections.map((name) => (
              <Link
                key={name}
                to="/admin/$"
                params={{ _splat: name }}
                className={ui.navItem(name === section)}
                aria-current={name === section ? (id ? "location" : "page") : undefined}
              >
                {titles[name]}
              </Link>
            ))}
          </nav>
          {id ? (
            section === "users" ? <UserDetail key={id} id={id} /> : section === "ensembles" ? <EnsembleDetail key={id} id={id} /> : <PieceDetail key={id} id={id} />
          ) : (
            <ListScreen key={section} section={section} title={titles[section]} query={query} setQuery={setQuery} />
          )}
        </div>
      </main>
    </AdminContext>
  );
}

function ListScreen({ section, title, query, setQuery }: { section: AdminSection; title: string; query: Query; setQuery: (next: Query) => void }) {
  const { t, language, zone } = useAdmin();
  const navigate = useNavigate();
  const ledes: Record<AdminSection, string> = {
    users: t.usersLede, ensembles: t.ensemblesLede, pieces: t.piecesLede, transcription: t.transcriptionLede, audit: t.auditLede,
  };
  const open = (kind: string) => (row: AdminRow) => void navigate({ to: "/admin/$", params: { _splat: kind + "/" + row.id } });
  const link = (kind: string, row: AdminRow, text: string) => (
    <Link to="/admin/$" params={{ _splat: kind + "/" + row.id }} className={ui.rowLink}>{text || "—"}</Link>
  );
  const config = useMemo(() => {
    const created: AdminColumn = { id: "created_at", label: t.created, sort: "created", cell: (r) => <Instant value={r.created_at} /> };
    const idColumn: AdminColumn = { id: "id", label: t.id, sort: "id", mono: true, cell: (r) => <Identifier value={r.id} /> };
    switch (section) {
      case "users":
        return {
          search: t.searchUsers, fields: ["verified", "sysadmin"], open: open("users"),
          columns: [
            { id: "name", label: t.name, sort: "name", cell: (r) => link("users", r, r.name) },
            { id: "email", label: t.email, sort: "email" },
            { id: "email_verified", label: t.verified, cell: (r) => <YesNo value={r.email_verified} yes={t.verifiedBadge} /> },
            { id: "sysadmin", label: t.role, cell: (r) => (r.sysadmin ? <YesNo value yes={t.sysadminBadge} /> : "—") },
            { id: "ensemble_count", label: t.ensembles, cell: (r) => <Count value={r.ensemble_count} /> },
            created,
            { id: "last_active", label: t.lastActive, cell: (r) => <Instant value={r.last_active} /> },
            idColumn,
          ] as AdminColumn[],
        };
      case "ensembles":
        return {
          search: t.searchEnsembles, fields: [], open: open("ensembles"),
          columns: [
            { id: "name", label: t.name, sort: "name", cell: (r) => link("ensembles", r, r.name) },
            { id: "kind", label: t.kind, cell: (r) => vocabulary(r.kind, language) },
            { id: "members", label: t.members, cell: (r) => <Count value={r.members} /> },
            { id: "leads", label: t.leads, cell: (r) => <Count value={r.leads} /> },
            { id: "pieces", label: t.pieces, cell: (r) => <Count value={r.pieces} /> },
            created,
            idColumn,
          ] as AdminColumn[],
        };
      case "pieces":
        return {
          search: t.searchPieces, fields: ["format", "ensemble"], open: open("pieces"),
          columns: [
            { id: "title", label: t.title, sort: "name", cell: (r) => link("pieces", r, r.title) },
            { id: "ensemble_id", label: t.ensemble, cell: (r) => <Link to="/admin/$" params={{ _splat: "ensembles/" + r.ensemble_id }} className={ui.rowLink}>{String(r.ensemble_id).slice(0, 12)}</Link> },
            { id: "format", label: t.format, cell: (r) => vocabulary(r.format, language) },
            { id: "versions", label: t.versions, cell: (r) => <Count value={r.versions} /> },
            created,
            { id: "updated_at", label: t.updated, sort: "updated", cell: (r) => <Instant value={r.updated_at} /> },
            idColumn,
          ] as AdminColumn[],
        };
      default:
        return {
          search: t.searchAudit, fields: ["action", "outcome", "targetType", "actor", "target"], open: undefined, defaultSort: { id: "created_at", desc: true },
          columns: [
            { ...created, label: t.time },
            { id: "actor_id", label: t.actor, cell: (r) => r.actor_id ? <>{r.actor_name ?? ""} <Identifier value={r.actor_id} label={t.actorId} /></> : "—" },
            { id: "action", label: t.action, sort: "name" },
            { id: "target_id", label: t.target, cell: (r) => <Identifier value={r.target_id} label={t.targetId} /> },
            { id: "outcome", label: t.outcome, cell: (r) => <StateBadge value={r.outcome} /> },
            { id: "reason_excerpt", label: t.reasonExcerpt, cell: (r) => r.reason_excerpt || "—" },
          ] as AdminColumn[],
        };
    }
  }, [section, language, zone]);
  const filters = Object.fromEntries(
    Object.entries(query)
      .filter(([key, value]) => value && key !== "search")
      .map(([key, value]) => [key, key === "from" || key === "to" ? calendarInstant(value, zone) : value]),
  );
  return (
    <section aria-labelledby="admin-page-title">
      <header className={ui.pageHead}>
        <div className={ui.titleBlock}>
          <h1 id="admin-page-title" className={ui.title}>{title}</h1>
          <p className={ui.lede}>{ledes[section]}</p>
        </div>
      </header>
      {section === "transcription" ? (
        <TranscriptionScreen query={query} setQuery={setQuery} />
      ) : (
        <>
          <AdminToolbar query={query} setQuery={setQuery} fields={config.fields} search={config.search} range="created" />
          <AdminDataTable
            key={section}
            path={section}
            caption={title}
            columns={config.columns}
            search={query.search ?? ""}
            filters={filters}
            filtered={Object.values(query).some(Boolean)}
            onClear={() => setQuery({})}
            onOpen={config.open}
            defaultSort={"defaultSort" in config ? config.defaultSort : undefined}
          />
        </>
      )}
    </section>
  );
}
