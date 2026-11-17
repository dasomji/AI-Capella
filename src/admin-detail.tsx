import { Badge, Button, EmptyState, Loading, Status, Table, TableCell, TableHeader, TableRow, TableWrap } from "./design-system/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { adminRequest, managementError, AdminRequestError } from "./admin-request";
import { AdminMemberships, AdminRole, ReasonDialog } from "./admin-management";
import { Bytes, Count, Definitions, Identifier, Instant, PermissionBadges, Section, StateBadge, ui, useAdmin, vocabulary, type AdminRow } from "./admin-format";

type Column = { id: string; label: string; mono?: boolean; cell?: (row: AdminRow) => ReactNode };

/** Bounded detail section: the first 30 rows arrive with the detail, continuation uses its cursor. */
function SectionTable({ caption, initial, path, columns, empty }: {
  caption: string;
  initial?: { items: AdminRow[]; nextCursor: string | null };
  path: string;
  columns: Column[];
  empty: string;
}) {
  const { t, language } = useAdmin();
  const [rows, setRows] = useState<AdminRow[]>(initial?.items ?? []),
    [cursor, setCursor] = useState<string | null>(initial?.nextCursor ?? null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function load(next?: string) {
    setBusy(true);
    setError("");
    try {
      const r = await adminRequest(path + (next ? (path.includes("?") ? "&" : "?") + "cursor=" + encodeURIComponent(next) : ""));
      setRows((old) => (next ? [...old, ...r.items] : r.items));
      setCursor(r.nextCursor);
    } catch (e) {
      setError(managementError(e, language));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!initial) void load();
  }, [path]);
  return (
    <>
      {error && <Status variant="admin" intent="error" role="alert">{error}</Status>}
      {rows.length ? (
        <TableWrap variant="records" tabIndex={0} aria-label={caption}>
          <Table>
            <caption hidden>{caption}</caption>
            <thead>
              <TableRow>{columns.map((c) => <TableHeader key={c.id} scope="col">{c.label}</TableHeader>)}</TableRow>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <TableRow key={row.id ?? i}>
                  {columns.map((c) => (
                    <TableCell key={c.id} mono={c.mono} data-label={c.label}>
                      <span>{c.cell ? c.cell(row) : (row[c.id] ?? "—")}</span>
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      ) : (
        !busy && !error && <EmptyState variant="compact" title={empty} />
      )}
      {busy && <Loading layout="tw:sr-only">{t.loading}</Loading>}
      {cursor && (
        <div className={ui.actions}>
          <Button size="compact" type="button" busy={busy} onClick={() => void load(cursor)}>{t.more}</Button>
        </div>
      )}
    </>
  );
}

function useAuditColumns(): Column[] {
  const { t, language } = useAdmin();
  const columns: Column[] = [
    { id: "created_at", label: t.time, cell: (r) => <Instant value={r.created_at} /> },
    { id: "actor_id", label: t.actor, cell: (r) => r.actor_id ? <>{r.actor_name ?? ""} <Identifier value={r.actor_id} label={t.actorId} /></> : "—" },
    { id: "action", label: t.action },
    { id: "outcome", label: t.outcome, cell: (r) => <StateBadge value={r.outcome} /> },
    { id: "reason_excerpt", label: t.reasonExcerpt, cell: (r) => r.reason_excerpt || "—" },
  ];
  return columns.map((c) => ({ ...c, label: c.label || vocabulary(c.id, language) }));
}

function AuditSection({ initial, params, id }: { initial?: { items: AdminRow[]; nextCursor: string | null }; params: Record<string, string>; id: string }) {
  const { t } = useAdmin();
  return (
    <Section title={t.recentAudit} data-admin="audit">
      <SectionTable
        key={id}
        caption={t.recentAudit}
        initial={initial}
        path={"audit?" + new URLSearchParams({ ...params, sort: "created", direction: "desc" })}
        columns={useAuditColumns()}
        empty={t.emptyTitle}
      />
    </Section>
  );
}

/** Loads one detail bundle (a single audited request) and reloads it after management changes. */
function useDetail(kind: string, id: string) {
  const { setZone } = useAdmin();
  const [detail, setDetail] = useState<AdminRow | null>(null),
    [error, setError] = useState<unknown>(null),
    [retry, setRetry] = useState(0);
  const generation = useRef(0);
  async function load() {
    const current = ++generation.current;
    const result = await adminRequest(kind + "/" + encodeURIComponent(id));
    if (current !== generation.current) return;
    if (result.timeZone) setZone(result.timeZone);
    setDetail(result);
    setError(null);
  }
  useEffect(() => {
    setDetail(null);
    setError(null);
    const current = generation.current + 1;
    load().catch((e) => { if (current === generation.current) setError(e); });
    return () => { generation.current++; };
  }, [kind, id, retry]);
  return { detail, error, reload: load, retry: () => setRetry((v) => v + 1) };
}

function DetailFrame({ list, listLabel, title, meta, error, loading, onRetry, children }: {
  list: string;
  listLabel: string;
  title: string;
  meta?: ReactNode;
  error: unknown;
  loading: boolean;
  onRetry: () => void;
  children?: ReactNode;
}) {
  const { t, language } = useAdmin();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (!loading) heading.current?.focus({ preventScroll: true }); }, [loading, title]);
  const missing = error instanceof AdminRequestError && error.status === 404;
  return (
    <div className={ui.stack} data-admin="detail">
      <header className={ui.titleBlock}>
        <Link to="/admin/$" params={{ _splat: list }} className={ui.crumb}>← {listLabel}</Link>
        <h1 ref={heading} tabIndex={-1} className={ui.title}>{missing ? t.notFoundTitle : title}</h1>
        {meta && !error && <div className={ui.meta}>{meta}</div>}
      </header>
      {loading && <Status variant="admin" role="status">{t.loading}</Status>}
      {error !== null && (missing ? (
        <Status variant="admin" intent="error" role="alert">{t.notFoundBody}</Status>
      ) : (
        <div className={ui.actions}>
          <Status variant="admin" intent="error" role="alert">{managementError(error, language)}</Status>
          <Button size="compact" type="button" onClick={onRetry}>{t.retry}</Button>
        </div>
      ))}
      {!loading && error === null && children}
    </div>
  );
}

export function UserDetail({ id }: { id: string }) {
  const { t, language } = useAdmin();
  const { detail, error, reload, retry } = useDetail("users", id);
  const profile = detail?.profile;
  const sysadmin = !!detail?.roles?.some((r: AdminRow) => r.role === "sysadmin");
  return (
    <DetailFrame
      list="users"
      listLabel={t.allUsers}
      title={profile?.name ?? profile?.email ?? id}
      error={error}
      loading={!detail && !error}
      onRetry={retry}
      meta={profile && <>
        <span>{profile.email}</span>
        <Identifier value={profile.id} />
        <span className={ui.badges}>
          {profile.email_verified ? <Badge intent="success">{t.verifiedBadge}</Badge> : <Badge intent="warning">{t.unverifiedBadge}</Badge>}
          {sysadmin && <Badge intent="accent">{t.sysadminBadge}</Badge>}
        </span>
      </>}
    >
      {profile && <>
        <div className={ui.columns}>
          <Section title={t.overview}>
            <Definitions items={[
              [t.email, profile.email],
              [t.verified, profile.email_verified ? t.yes : t.no],
              [t.uiLanguage, profile.language ?? "—"],
              [t.created, <Instant value={profile.created_at} />],
              [t.sessions, <Count value={detail.sessions?.count} />],
              [t.lastActive, <Instant value={detail.sessions?.last_active} />],
              [t.lastSignIn, <Instant value={detail.sessions?.last_sign_in} />],
              [t.devices, detail.devices?.length
                ? detail.devices.map((device: AdminRow) => `${device.device === "Mobile" ? vocabulary("Mobile", language) : vocabulary(device.device, language)}: ${device.count}`).join(" · ")
                : t.none],
            ]} />
          </Section>
          <AdminRole profile={profile} sysadmin={sysadmin} onChanged={reload} />
        </div>
        <AdminMemberships entity="users" profile={profile} onChanged={reload} />
        <AuditSection id={profile.id} initial={detail.sections?.audit} params={{ user: profile.id }} />
      </>}
    </DetailFrame>
  );
}

export function EnsembleDetail({ id }: { id: string }) {
  const { t, language } = useAdmin();
  const { detail, error, reload, retry } = useDetail("ensembles", id);
  const profile = detail?.profile;
  return (
    <DetailFrame
      list="ensembles"
      listLabel={t.allEnsembles}
      title={profile?.name ?? id}
      error={error}
      loading={!detail && !error}
      onRetry={retry}
      meta={profile && <><span>{vocabulary(profile.kind, language)}</span><Identifier value={profile.id} /></>}
    >
      {profile && <>
        <Section title={t.overview}>
          <Definitions items={[
            [t.kind, vocabulary(profile.kind, language)],
            [t.created, <Instant value={profile.created_at} />],
            [t.id, <Identifier value={profile.id} />],
          ]} />
        </Section>
        <AdminMemberships entity="ensembles" profile={profile} onChanged={reload} />
        <Section title={t.invitations} data-admin="invitations">
          <SectionTable
            key={"i" + profile.id + JSON.stringify(detail.sections?.invitations?.items?.length)}
            caption={t.invitations}
            initial={detail.sections?.invitations}
            path={"invitations?ensemble=" + encodeURIComponent(profile.id)}
            empty={t.emptyTitle}
            columns={[
              { id: "email", label: t.email },
              { id: "state", label: t.state, cell: (r) => <StateBadge value={r.state} /> },
              { id: "permissions", label: t.permissions, cell: (r) => <PermissionBadges row={r} /> },
              { id: "expires_at", label: vocabulary("expires_at", language), cell: (r) => <Instant value={r.expires_at} /> },
              { id: "created_at", label: t.created, cell: (r) => <Instant value={r.created_at} /> },
            ]}
          />
        </Section>
        <Section title={t.pieces} data-admin="pieces">
          <SectionTable
            key={"p" + profile.id}
            caption={t.pieces}
            initial={detail.sections?.pieces}
            path={"pieces?ensemble=" + encodeURIComponent(profile.id)}
            empty={t.emptyTitle}
            columns={[
              { id: "title", label: t.title, cell: (r) => <Link to="/admin/$" params={{ _splat: "pieces/" + r.id }} className={ui.rowLink}>{r.title}</Link> },
              { id: "format", label: t.format, cell: (r) => vocabulary(r.format, language) },
              { id: "versions", label: t.versions, cell: (r) => <Count value={r.versions} /> },
              { id: "updated_at", label: t.updated, cell: (r) => <Instant value={r.updated_at} /> },
            ]}
          />
        </Section>
        <Section title={t.jobs} data-admin="jobs">
          <SectionTable
            key={"j" + profile.id}
            caption={t.jobs}
            initial={detail.sections?.jobs}
            path={"transcription/jobs?ensemble=" + encodeURIComponent(profile.id)}
            empty={t.emptyTitle}
            columns={jobColumns(t, language)}
          />
        </Section>
        <AuditSection id={profile.id} initial={detail.sections?.audit} params={{ ensemble: profile.id }} />
      </>}
    </DetailFrame>
  );
}

export function jobColumns(t: ReturnType<typeof useAdmin>["t"], language: "en" | "de"): Column[] {
  return [
    { id: "id", label: t.job, cell: (r) => <Identifier value={r.id} label={t.job} /> },
    { id: "state", label: t.state, cell: (r) => <StateBadge value={r.state} /> },
    { id: "ensemble_id", label: t.ensemble, cell: (r) => r.ensemble_id ? <Link to="/admin/$" params={{ _splat: "ensembles/" + r.ensemble_id }} className={ui.rowLink}>{r.ensemble_id.slice(0, 12)}</Link> : "—" },
    { id: "model", label: t.model },
    { id: "attempts", label: t.attempts, cell: (r) => <Count value={r.attempts} /> },
    { id: "failure_reason", label: t.failure, cell: (r) => r.failure_reason ? vocabulary(r.failure_reason, language) : "—" },
    { id: "created_at", label: t.created, cell: (r) => <Instant value={r.created_at} /> },
  ];
}

type Access = { kind: "content" } | { kind: "original"; row: AdminRow };

export function PieceDetail({ id }: { id: string }) {
  const { t, fill, language } = useAdmin();
  const { detail, error, retry } = useDetail("pieces", id);
  const profile = detail?.profile;
  const [access, setAccess] = useState<Access | null>(null), [content, setContent] = useState("");
  const opener = useRef<HTMLElement | null>(null);
  const ask = (next: Access, from: HTMLElement) => { opener.current = from; setAccess(next); };
  return (
    <DetailFrame
      list="pieces"
      listLabel={t.allPieces}
      title={profile?.title ?? id}
      error={error}
      loading={!detail && !error}
      onRetry={retry}
      meta={profile && <><span>{vocabulary(profile.format, language)}</span><Identifier value={profile.id} /></>}
    >
      {profile && <>
        <div className={ui.columns}>
          <Section title={t.overview}>
            <Definitions items={[
              [t.ensemble, <Link to="/admin/$" params={{ _splat: "ensembles/" + profile.ensemble_id }} className={ui.rowLink}>{profile.ensemble_id}</Link>],
              [t.format, vocabulary(profile.format, language)],
              [t.created, <Instant value={profile.created_at} />],
              [t.updated, <Instant value={profile.updated_at} />],
              [vocabulary("current_version_id", language), <Identifier value={profile.current_version_id} />],
              [vocabulary("transcription_job_id", language), profile.transcription_job_id
                ? <Link to="/admin/$" params={{ _splat: "transcription" }} search={{ search: profile.transcription_job_id }} className={ui.rowLink}>{profile.transcription_job_id}</Link>
                : "—"],
            ]} />
          </Section>
          <Section title={t.contentTitle} note={t.contentNote} data-admin="content-access">
            <div className={ui.actions}>
              {content
                ? <Button size="compact" type="button" onClick={() => setContent("")}>{t.hideContent}</Button>
                : <Button size="compact" type="button" onClick={(e) => ask({ kind: "content" }, e.currentTarget)}>{t.viewContent}</Button>}
            </div>
            {content && <pre className={ui.content} data-admin="content" tabIndex={0}>{content}</pre>}
          </Section>
        </div>
        <Section title={vocabulary("versions", language)} data-admin="versions">
          <SectionTable
            key={"v" + profile.id}
            caption={vocabulary("versions", language)}
            initial={detail.sections?.versions}
            path={"pieces/" + encodeURIComponent(profile.id) + "/versions"}
            empty={t.emptyTitle}
            columns={[
              { id: "version_no", label: vocabulary("version_no", language) },
              { id: "format", label: t.format, cell: (r) => vocabulary(r.format, language) },
              { id: "size", label: t.size, cell: (r) => <Bytes value={r.size} /> },
              { id: "content_hash", label: vocabulary("content_hash", language), cell: (r) => <Identifier value={r.content_hash} label={vocabulary("content_hash", language)} /> },
              { id: "created_by", label: vocabulary("created_by", language), cell: (r) => <Identifier value={r.created_by} label={vocabulary("created_by", language)} /> },
              { id: "created_at", label: t.created, cell: (r) => <Instant value={r.created_at} /> },
            ]}
          />
        </Section>
        <Section title={vocabulary("originals", language)} data-admin="originals">
          <SectionTable
            key={"o" + profile.id}
            caption={vocabulary("originals", language)}
            initial={detail.sections?.originals}
            path={"pieces/" + encodeURIComponent(profile.id) + "/originals"}
            empty={t.noOriginals}
            columns={[
              { id: "original_filename", label: vocabulary("original_filename", language), cell: (r) => r.original_filename ?? "—" },
              { id: "content_type", label: vocabulary("content_type", language) },
              { id: "size", label: t.size, cell: (r) => <Bytes value={r.size} /> },
              { id: "sha256", label: "SHA-256", cell: (r) => <Identifier value={r.sha256} label="SHA-256" /> },
              { id: "created_at", label: t.created, cell: (r) => <Instant value={r.created_at} /> },
              { id: "download", label: vocabulary("actions", language), cell: (r) => (
                <Button size="compact" type="button" onClick={(e) => ask({ kind: "original", row: r }, e.currentTarget)}>{t.download}</Button>
              ) },
            ]}
          />
        </Section>
        <AuditSection id={profile.id} initial={detail.sections?.audit} params={{ target: profile.id }} />
        {access && (
          <ReasonDialog
            title={access.kind === "content"
              ? fill(t.contentDialogTitle, { title: profile.title })
              : fill(t.downloadTitle, { file: access.row.original_filename ?? access.row.id })}
            body={access.kind === "content" ? t.contentNote : t.downloadBody}
            hint={t.accessHint}
            confirmLabel={access.kind === "content" ? t.contentConfirm : t.downloadConfirm}
            opener={opener.current}
            onCancel={() => setAccess(null)}
            onConfirm={async (reason) => {
              if (access.kind === "content") {
                const r = await adminRequest("pieces/" + encodeURIComponent(profile.id) + "/content", "POST", { reason });
                setContent(typeof r.body === "string" ? r.body : JSON.stringify(r.body, null, 2));
                setAccess(null);
              } else {
                const r = await adminRequest("pieces/" + encodeURIComponent(profile.id) + "/originals/" + encodeURIComponent(access.row.id) + "/download", "POST", { reason });
                setAccess(null);
                location.assign(r.url);
              }
            }}
          />
        )}
      </>}
    </DetailFrame>
  );
}
