import { Badge, Button, EmptyState, Status, Table, TableCell, TableHeader, TableRow, TableWrap } from "./design-system/react";
import { useEffect, useRef, useState } from "react";
import { adminRequest, managementError } from "./admin-request";
import { ReasonDialog } from "./admin-management";
import { AdminDataTable, type AdminColumn } from "./admin-data-table";
import { jobColumns } from "./admin-detail";
import { dayStart, Count, Identifier, Instant, Section, ui, useAdmin, vocabulary, type AdminRow } from "./admin-format";
import { calendarRange } from "./admin-time";
import { AdminToolbar } from "./admin-toolbar";

type Query = Record<string, string>;

/** Processing control, usage, latency, failures and cross-ensemble jobs. */
export function TranscriptionScreen({ query, setQuery }: { query: Query; setQuery: (next: Query) => void }) {
  const { t, language, zone } = useAdmin();
  const [control, setControl] = useState<AdminRow | null>(null),
    [usage, setUsage] = useState<AdminRow | null>(null),
    [failures, setFailures] = useState<AdminRow | null>(null),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false),
    [revision, setRevision] = useState(0);
  const opener = useRef<HTMLElement | null>(null);
  const defaults = calendarRange(zone);
  const from = query.all ? "1970-01-01T00:00:00Z" : (dayStart(query.from, zone) ?? dayStart(defaults.from, zone)!);
  const to = dayStart(query.to, zone) ?? dayStart(defaults.to, zone)!;
  const range = new URLSearchParams({ from, to, ...(query.all ? { all: "true" } : {}), ...(query.ensemble ? { ensemble: query.ensemble } : {}) });
  useEffect(() => {
    let live = true;
    setError("");
    const timer = setTimeout(async () => {
      try {
        const [c, u, f] = await Promise.all([
          adminRequest("transcription/control"),
          adminRequest("transcription/usage?" + range),
          adminRequest("transcription/failures?" + range),
        ]);
        if (!live) return;
        setControl(c);
        setUsage(u);
        setFailures(f);
      } catch (e) {
        if (live) setError(managementError(e, language));
      }
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [range.toString(), revision]);
  const groups: AdminRow[] = usage?.groups ?? [];
  const sum = (key: string) => groups.reduce((n, r) => n + Number(r[key] ?? 0), 0);
  const paused = !!control?.paused;
  const tiles: [string, string, boolean?][] = [
    [t.calls, "calls"], [vocabulary("pages", language), "pages"], [vocabulary("Input tokens", language), "input_tokens"],
    [vocabulary("Output tokens", language), "output_tokens"], [vocabulary("Estimated cost (USD)", language), "estimated_cost_usd", true],
    [vocabulary("Unpriced (count)", language), "unpriced_calls"],
  ];
  const columns: AdminColumn[] = jobColumns(t, language).map((c) => ({ ...c, mono: c.id === "id", sort: c.id === "created_at" ? "created" : c.id === "id" ? "id" : undefined }));
  return (
    <div className={ui.stack}>
      {error && <Status variant="admin" intent="error" role="alert">{error}</Status>}
      <Section title={t.processing} data-admin="ops">
        <div className={ui.actions}>
          {control && <Badge intent={paused ? "error" : "success"}>{paused ? t.stopped : t.running}</Badge>}
          <Status variant="admin" intent={paused ? "error" : "neutral"}>{control ? (paused ? t.stoppedBody : t.runningBody) : t.loading}</Status>
        </div>
        {control?.last && (
          <dl className={ui.definitions}>
            <div className={ui.definition}>
              <dt className={ui.term}>{t.lastChange}</dt>
              <dd className={ui.value}>
                <Instant value={control.last.created_at} /> · {control.last.actor_name ?? "—"} <Identifier value={control.last.actor_id} label={t.actorId} />
              </dd>
            </div>
            <div className={ui.definition}>
              <dt className={ui.term}>{t.reason}</dt>
              <dd className={ui.value}>{control.last.reason ?? "—"}</dd>
            </div>
          </dl>
        )}
        <div className={ui.actions}>
          <Button
            size="compact"
            type="button"
            disabled={!control}
            onClick={(e) => { opener.current = e.currentTarget; setConfirm(true); }}
          >
            {paused ? t.resumeAction : t.stopAction}
          </Button>
        </div>
      </Section>
      {confirm && control && (
        <ReasonDialog
          destructive={!paused}
          title={paused ? t.resumeTitle : t.stopTitle}
          body={paused ? t.resumeBody : t.stopBody}
          confirmLabel={paused ? t.resumeConfirm : t.stopConfirm}
          opener={opener.current}
          onCancel={() => setConfirm(false)}
          onConfirm={async (reason) => {
            await adminRequest("transcription/control", "PUT", { paused: !paused, reason });
            setConfirm(false);
            setRevision((v) => v + 1);
          }}
        />
      )}
      <AdminToolbar query={query} setQuery={setQuery} fields={["ensemble"]} range="stats" />
      <Section title={t.usage} data-admin="usage">
        <div className={ui.metrics}>
          {tiles.map(([label, key, cost]) => (
            <div className={ui.metric} key={key}>
              <h3 className={ui.metricLabel}>{label}</h3>
              <strong className={ui.metricValue}>
                {!usage ? "—" : cost && groups.some((r) => r[key] === null) ? "—" : <Count value={sum(key)} />}
              </strong>
            </div>
          ))}
        </div>
      </Section>
      <div className={ui.columns}>
        <Section title={t.latency} data-admin="latency">
          {groups.length ? (
            <TableWrap variant="metrics" tabIndex={0} aria-label={t.latency}>
              <Table variant="metrics">
                <thead><TableRow><TableHeader scope="col">{t.day}</TableHeader><TableHeader scope="col">{t.model}</TableHeader><TableHeader scope="col">{t.p50}</TableHeader><TableHeader scope="col">{t.p95}</TableHeader></TableRow></thead>
                <tbody>{groups.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>{r.day}</TableCell><TableCell>{r.model}</TableCell>
                    <TableCell><Count value={r.latency_p50_ms} /></TableCell><TableCell><Count value={r.latency_p95_ms} /></TableCell>
                  </TableRow>
                ))}</tbody>
              </Table>
            </TableWrap>
          ) : usage && <EmptyState variant="compact" title={t.noUsage} />}
        </Section>
        <Section title={t.failures} data-admin="failures">
          {failures?.items?.length ? (
            <TableWrap variant="metrics" tabIndex={0} aria-label={t.failures}>
              <Table variant="metrics">
                <thead><TableRow><TableHeader scope="col">{t.reason}</TableHeader><TableHeader scope="col">{t.calls}</TableHeader></TableRow></thead>
                <tbody>{failures.items.map((r: AdminRow) => (
                  <TableRow key={r.reason}><TableCell>{vocabulary(r.reason, language)}</TableCell><TableCell><Count value={r.calls} /></TableCell></TableRow>
                ))}</tbody>
              </Table>
            </TableWrap>
          ) : failures && <EmptyState variant="compact" title={t.noFailures} />}
        </Section>
      </div>
      <Section title={t.jobs} data-admin="jobs">
        <AdminToolbar query={query} setQuery={setQuery} fields={["state"]} search={t.searchJobs} />
        <AdminDataTable
          key="jobs"
          path="transcription/jobs"
          caption={t.jobs}
          columns={columns}
          search={query.search ?? ""}
          filters={{
            ...(query.state ? { state: query.state } : {}),
            ...(query.ensemble ? { ensemble: query.ensemble } : {}),
            // One range for the whole page: statistics and jobs answer the same period.
            ...(query.all ? {} : { from, to }),
          }}
          filtered={!!(query.search || query.state || query.ensemble)}
          onClear={() => setQuery({})}
          revision={revision}
        />
      </Section>
    </div>
  );
}
