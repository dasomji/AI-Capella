import { createContext, useContext, useId, type ReactNode } from "react";
import { Badge, IconButton, toast } from "./design-system/react";
import { adminRecipe } from "./design-system/recipes/admin";
import { adminFieldMessages, adminManagementMessages, adminMessages, adminPolishMessages, adminUiMessages, type Lang } from "./i18n";
import { adminInstant, calendarInstant } from "./admin-time";

export type AdminRow = Record<string, any>;
/** Last filters of each list in this tab, so a detail page's breadcrumb returns to the same list. */
export const listQueries = new Map<string, Record<string, string>>();
export const ui = adminRecipe();

/** Language and business time zone shared by every administration screen. */
export const AdminContext = createContext<{ language: Lang; zone: string; setZone: (zone: string) => void }>({
  language: "en",
  zone: "UTC",
  setZone: () => {},
});
export function useAdmin() {
  const context = useContext(AdminContext);
  const t = adminUiMessages[context.language];
  return { ...context, t, fill: (text: string, values: Record<string, string | number>) => fill(text, values) };
}
export function fill(text: string, values: Record<string, string | number>) {
  return text.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ""));
}

/** Server vocabulary (states, failure reasons, field names) in the selected language. */
export function vocabulary(key: string | null | undefined, language: Lang) {
  if (key === null || key === undefined || key === "") return "—";
  for (const table of [adminManagementMessages, adminPolishMessages, adminFieldMessages, adminMessages] as const) {
    const value = (table[language] as Record<string, string>)[key];
    if (value) return value;
  }
  return key.replaceAll("_", " ");
}

export function Instant({ value }: { value: string | null | undefined }) {
  const { zone, language } = useAdmin();
  if (!value) return <>—</>;
  // Date and time stay on one line; the date part may wrap from the time on narrow records.
  const [date, time] = adminInstant(value, zone, language).split(", ");
  return <time dateTime={value} title={new Date(value).toISOString()}><span className={ui.nowrap}>{date},</span> <span className={ui.nowrap}>{time}</span></time>;
}

export function Count({ value }: { value: number | null | undefined }) {
  const { language } = useAdmin();
  if (value === null || value === undefined) return <>—</>;
  return <>{new Intl.NumberFormat(language, { maximumFractionDigits: 6 }).format(Number(value))}</>;
}

const copyIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <rect x="8" y="8" width="12" height="12" rx="1" />
    <path d="M16 8V4H4v12h4" />
  </svg>
);

/** Shortened identifier with a copy action; the full value stays in the title and clipboard. */
export function Identifier({ value, label }: { value: string | null | undefined; label?: string }) {
  const { t, fill: f } = useAdmin();
  if (!value) return <>—</>;
  return (
    <span className={ui.identifier}>
      <span title={value}>{value.length > 12 ? value.slice(0, 12) + "…" : value}</span>
      <IconButton
        variant="small"
        size="compact"
        label={label ? f(t.copy, { label }) : t.copyId}
        onClick={(event) => {
          event.stopPropagation();
          void navigator.clipboard.writeText(value).then(
            () => toast(t.copied),
            () => toast(t.copyFailed, "error"),
          );
        }}
      >
        {copyIcon}
      </IconButton>
    </span>
  );
}

export function StateBadge({ value }: { value: string | null | undefined }) {
  const { language } = useAdmin();
  if (!value) return <>—</>;
  const intent = ["failed", "error", "revoked", "expired", "cancelled", "not_sent"].includes(value)
    ? "error"
    : ["completed", "ok", "success", "accepted", "imported", "ready"].includes(value)
      ? "success"
      : ["queued", "running", "pending", "paused", "processing_paused"].includes(value)
        ? "warning"
        : "neutral";
  return <Badge intent={intent}>{vocabulary(value, language)}</Badge>;
}

export function YesNo({ value, yes, no }: { value: boolean | null | undefined; yes?: string; no?: string }) {
  const { t } = useAdmin();
  if (value === null || value === undefined) return <>—</>;
  return value ? <Badge intent="success">{yes ?? t.yes}</Badge> : <span>{no ?? t.no}</span>;
}

/** Lead and capability booleans as one readable badge group. */
export function PermissionBadges({ row }: { row: AdminRow }) {
  const { t, language } = useAdmin();
  const m = adminManagementMessages[language];
  if (row.is_lead) return <span className={ui.badges}><Badge intent="accent">{t.leadBadge}</Badge></span>;
  const granted = [
    row.manage_members && m.manageMembers,
    row.edit_music_pieces && m.editPieces,
    row.ai_transcription && m.transcribe,
  ].filter(Boolean) as string[];
  return (
    <span className={ui.badges}>
      {granted.length ? granted.map((label) => <Badge key={label}>{label}</Badge>) : <span>{t.memberBadge}</span>}
    </span>
  );
}

export function Definitions({ items }: { items: readonly (readonly [string, ReactNode])[] }) {
  return (
    <dl className={ui.definitions}>
      {items.map(([term, value]) => (
        <div className={ui.definition} key={term}>
          <dt className={ui.term}>{term}</dt>
          <dd className={ui.value}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Section({ title, note, actions, children, ...props }: {
  title: string;
  note?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  "data-admin"?: string;
}) {
  const id = useId();
  return (
    <section className={ui.section} aria-labelledby={id} data-admin={props["data-admin"]}>
      <div className={ui.sectionHead}>
        <h2 id={id} className={ui.sectionTitle} tabIndex={-1}>{title}</h2>
        {actions && <div className={ui.actions}>{actions}</div>}
      </div>
      {note && <p className={ui.sectionNote}>{note}</p>}
      {children}
    </section>
  );
}

export function Bytes({ value }: { value: number | null | undefined }) {
  const { language } = useAdmin();
  if (value === null || value === undefined) return <>—</>;
  const units = ["B", "KB", "MB", "GB"];
  let n = Number(value), unit = 0;
  while (n >= 1024 && unit < units.length - 1) { n /= 1024; unit++; }
  return <span title={String(value)}>{new Intl.NumberFormat(language, { maximumFractionDigits: unit ? 1 : 0 }).format(n)} {units[unit]}</span>;
}

/** First instant of a business-zone calendar day, or undefined for a malformed URL value. */
export function dayStart(day: string | undefined, zone: string) {
  if (!day) return undefined;
  try { return calendarInstant(day, zone); } catch { return undefined; }
}
