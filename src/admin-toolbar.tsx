import { Button, Field, Input, Select, ToggleGroup } from "./design-system/react";
import { calendarRange } from "./admin-time";
import { fill, ui, useAdmin, vocabulary } from "./admin-format";

type Query = Record<string, string>;
const choices: Record<string, string[]> = {
  verified: ["true", "false"],
  sysadmin: ["true", "false"],
  format: ["musicxml", "score"],
  targetType: ["user", "ensemble", "piece", "original", "transcription", "membership", "invitation"],
  state: ["queued", "running", "completed", "failed", "cancelled"],
};

/**
 * One toolbar for every list: boxed search, boxed filters (D09 A), a created/statistics range with
 * presets and the business time zone, and a single Clear filters action. State lives in the URL.
 */
export function AdminToolbar({ query, setQuery, fields, search, range }: {
  query: Query;
  setQuery: (next: Query) => void;
  fields: string[];
  search?: string;
  range?: "created" | "stats";
}) {
  const { t, zone, language } = useAdmin();
  const set = (key: string, value: string) => {
    const next = { ...query, [key]: value };
    if (!value) delete next[key];
    setQuery(next);
  };
  const labels: Record<string, string> = {
    verified: t.verified, sysadmin: t.sysadmin, format: t.format, targetType: t.targetType, state: t.state,
    outcome: t.outcome, action: t.action, actor: t.actorId, target: t.targetId, ensemble: t.ensembleId,
  };
  const option = (key: string, value: string) =>
    ["verified", "sysadmin"].includes(key) ? (value === "true" ? t.yes : t.no) : vocabulary(value, language);
  const presets = [7, 30, 90];
  const preset = query.all
    ? "all"
    : (presets.find((days) => {
        const r = calendarRange(zone, days);
        return range === "stats" && !query.from && !query.to ? days === 7 : query.from === r.from && query.to === r.to;
      }) ?? (range === "created" && !query.from && !query.to ? "all" : "")).toString();
  const active = Object.keys(query).some((key) => query[key]);
  return (
    <div className={ui.toolbar} data-admin="filters" role="search">
      {search && (
        <div className={ui.search}>
          <Field variant="search" density="compact" label={search}>
            {(association) => <Input {...association} type="search" value={query.search ?? ""} onChange={(e) => set("search", e.target.value)} />}
          </Field>
        </div>
      )}
      {fields.map((key) => (
        <div className={ui.filter} key={key}>
          <Field variant="search" density="compact" label={labels[key] ?? key}>
            {(association) =>
              choices[key] ? (
                <Select {...association} value={query[key] ?? ""} onChange={(e) => set(key, e.target.value)}>
                  <option value="">{t.any}</option>
                  {choices[key].map((value) => <option key={value} value={value}>{option(key, value)}</option>)}
                </Select>
              ) : (
                <Input {...association} value={query[key] ?? ""} spellCheck={false} onChange={(e) => set(key, e.target.value)} />
              )
            }
          </Field>
        </div>
      ))}
      {range && (
        <div className={ui.range} role="group" aria-label={range === "stats" ? t.statsRange : t.range}>
          <ToggleGroup
            variant="segmented"
            label={range === "stats" ? t.statsRange : t.range}
            value={preset}
            items={[...presets.map((days) => ({ value: String(days), label: t[("d" + days) as "d7"] })), { value: "all", label: t.allTime }]}
            onChange={(value) => {
              const next = { ...query };
              delete next.from; delete next.to; delete next.all;
              if (value === "all") { if (range === "stats") next.all = "true"; }
              else if (!(range === "stats" && value === "7")) Object.assign(next, calendarRange(zone, Number(value)));
              setQuery(next);
            }}
          />
          {(["from", "to"] as const).map((key) => (
            <div className={ui.filter} key={key}>
              <Field variant="search" density="compact" label={key === "from" ? t.from : t.until}>
                {(association) => (
                  <Input
                    {...association}
                    type="date"
                    value={query[key] ?? (range === "stats" && !query.all ? calendarRange(zone)[key] : "")}
                    onChange={(e) => {
                      const next = { ...query, [key]: e.target.value };
                      delete next.all;
                      if (!e.target.value) delete next[key];
                      setQuery(next);
                    }}
                  />
                )}
              </Field>
            </div>
          ))}
          <span className={ui.note}>{fill(t.zoneNote, { zone })}</span>
        </div>
      )}
      {active && (
        <Button size="compact" intent="quiet" type="button" onClick={() => setQuery({})}>{t.clear}</Button>
      )}
    </div>
  );
}
