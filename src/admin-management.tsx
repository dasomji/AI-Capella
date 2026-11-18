import { Button, Checkbox, ConfirmDialog, Dialog, Field, Input, Status, Textarea } from "./design-system/react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AdminToolbar } from "./admin-toolbar";
import { AdminDataTable, type AdminColumn } from "./admin-data-table";
import { adminRequest, managementError, AdminRequestError } from "./admin-request";
import { adminManagementMessages } from "./i18n";
import { Instant, PermissionBadges, Section, ui, useAdmin, type AdminRow } from "./admin-format";

type Permissions = {
  isLead: boolean;
  manageMembers: boolean;
  editPieces: boolean;
  transcribe: boolean;
};
const empty: Permissions = { isLead: false, manageMembers: false, editPieces: false, transcribe: false };
const permissionKeys = Object.keys(empty) as (keyof Permissions)[];
const permissions = (r: AdminRow): Permissions => ({
  isLead: !!r.is_lead,
  manageMembers: !!r.manage_members,
  editPieces: !!r.edit_music_pieces,
  transcribe: !!r.ai_transcription,
});
const same = (a: Permissions, b: Permissions) => permissionKeys.every((k) => a[k] === b[k]);

/**
 * Every audited administration action ends in this form: an explicit title and consequence, a
 * required reason and an action-specific confirm button. Destructive actions get the danger
 * treatment (D14 A); form dialogs use the centered admin dialog (D12 B).
 */
export function ReasonDialog({
  title,
  body,
  confirmLabel,
  destructive = false,
  form = false,
  hint,
  canConfirm = true,
  opener,
  onCancel,
  onConfirm,
  children,
}: {
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  /** Form dialogs (edit/add/invite) collect more than a confirmation. */
  form?: boolean;
  hint?: string;
  canConfirm?: boolean;
  opener: HTMLElement | null;
  onCancel: () => void;
  /** Resolve to close; throw to keep the dialog open with the error inside it. */
  onConfirm: (reason: string) => Promise<void>;
  children?: ReactNode;
}) {
  const { language, t } = useAdmin();
  const [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const errorId = useId();
  const content = (
    <form
      className={ui.dialogBody}
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy || !reason.trim() || !canConfirm) return;
        setBusy(true);
        setError("");
        try {
          await onConfirm(reason);
        } catch (e) {
          setError(managementError(e, language));
        } finally {
          setBusy(false);
        }
      }}
    >
      {body && <p className={ui.summary}>{body}</p>}
      {children}
      <Field label={adminManagementMessages[language].reason} hint={hint ?? t.reasonHint}>
        {(association) => (
          <Textarea
            {...association}
            autoFocus={!form}
            required
            maxLength={1000}
            value={reason}
            aria-errormessage={error ? errorId : undefined}
            onChange={(e) => setReason(e.target.value)}
          />
        )}
      </Field>
      {error && <Status id={errorId} variant="admin" intent="error" role="alert">{error}</Status>}
      <div className={ui.dialogActions}>
        <Button size="compact" type="button" disabled={busy} onClick={onCancel}>
          {t.cancel}
        </Button>
        <Button
          size="compact"
          type="submit"
          intent={destructive ? "danger" : "primary"}
          busy={busy}
          disabled={!reason.trim() || !canConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </form>
  );
  const behavior = { opener, busy, busyCancel: "block" as const, outside: "ignore" as const };
  return form ? (
    <Dialog open variant="admin-detail" role={destructive ? "alertdialog" : "dialog"} title={title} data-admin="confirm" destructive={destructive} behavior={behavior} onCancel={onCancel}>
      {content}
    </Dialog>
  ) : (
    <ConfirmDialog open title={title} data-admin="confirm" destructive={destructive} behavior={behavior} onCancel={onCancel}>
      {content}
    </ConfirmDialog>
  );
}

/** D11 A: staged checkboxes, submitted together with the reason. */
function PermissionFields({ value, onChange, invitation = false }: {
  value: Permissions;
  onChange: (p: Permissions) => void;
  invitation?: boolean;
}) {
  const { language, t } = useAdmin();
  const d = adminManagementMessages[language];
  return (
    <fieldset className={ui.checks} data-admin="permissions">
      <legend className={ui.legend}>{t.permissions}</legend>
      {permissionKeys
        .filter((k) => !invitation || k !== "isLead")
        .map((k) => (
          <Checkbox
            key={k}
            density="compact"
            label={k === "isLead" ? d.lead : d[k]}
            checked={value[k]}
            onChange={(e) => onChange({ ...value, [k]: e.target.checked })}
          />
        ))}
      {value.isLead && !invitation && <p className={ui.summary}>{d.leadHint}</p>}
    </fieldset>
  );
}

function changeList(before: Permissions, after: Permissions, labels: Record<keyof Permissions, string>, yes: string, no: string) {
  return permissionKeys
    .filter((k) => before[k] !== after[k])
    .map((k) => `${labels[k]} ${before[k] ? yes : no} → ${after[k] ? yes : no}`)
    .join(" · ");
}

function EditPermissions({ row, opener, onCancel, onSaved, onStale }: {
  row: AdminRow;
  opener: HTMLElement | null;
  onCancel: () => void;
  onSaved: () => Promise<void>;
  onStale: () => Promise<void>;
}) {
  const { language, t, fill } = useAdmin();
  const d = adminManagementMessages[language];
  const baseline = permissions(row);
  const [draft, setDraft] = useState(baseline);
  // A refreshed snapshot (after 409 stale_permissions) resets the draft so the admin reviews it.
  const snapshot = JSON.stringify(baseline);
  const [stale, setStale] = useState(0);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setDraft(permissions(row));
  }, [snapshot, stale]);
  const labels = { isLead: d.lead, manageMembers: d.manageMembers, editPieces: d.editPieces, transcribe: d.transcribe };
  const changes = changeList(baseline, draft, labels, t.yes, t.no);
  return (
    <ReasonDialog
      form
      title={t.editTitle}
      body={fill(t.subject, { name: row.name ?? row.email, ensemble: row.ensemble_name })}
      confirmLabel={d.save}
      opener={opener}
      canConfirm={!same(baseline, draft)}
      onCancel={onCancel}
      onConfirm={async (reason) => {
        try {
          await adminRequest(
            "ensembles/" + encodeURIComponent(row.ensemble_id) + "/members/" + encodeURIComponent(row.id),
            "PATCH",
            { permissions: draft, expected: baseline, reason },
          );
        } catch (error) {
          if (error instanceof AdminRequestError && error.status === 409) {
            await onStale().catch(() => {});
            setStale((v) => v + 1);
          }
          throw error;
        }
        await onSaved();
      }}
    >
      <PermissionFields value={draft} onChange={setDraft} />
      <p className={ui.summary} aria-live="polite">{changes ? fill(t.changes, { list: changes }) : t.noChanges}</p>
    </ReasonDialog>
  );
}

function Picker({ kind, chosen, onChoose }: { kind: "users" | "ensembles"; chosen: AdminRow | null; onChoose: (row: AdminRow | null) => void }) {
  const { t, language } = useAdmin();
  const [search, setSearch] = useState(""), [rows, setRows] = useState<AdminRow[]>([]), [error, setError] = useState("");
  useEffect(() => {
    if (chosen) return;
    let live = true;
    const timer = setTimeout(async () => {
      try {
        const r = await adminRequest(kind + "?" + new URLSearchParams({ limit: "10", sort: "name", direction: "asc", ...(search ? { search } : {}) }));
        if (live) { setRows(r.items); setError(""); }
      } catch (e) {
        if (live) setError(managementError(e, language));
      }
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [search, chosen, kind]);
  if (chosen)
    return (
      <div className={ui.actions} data-admin="chosen">
        <span className={ui.summary}>{t.chosen}: <strong>{chosen.name}</strong>{chosen.email ? " · " + chosen.email : ""}</span>
        <Button size="compact" intent="quiet" type="button" onClick={() => onChoose(null)}>{t.change}</Button>
      </div>
    );
  return (
    <div className={ui.stack} data-admin="picker">
      <Field variant="search" density="compact" label={kind === "users" ? t.pickUser : t.pickEnsemble}>
        {(association) => <Input {...association} type="search" value={search} onChange={(e) => setSearch(e.target.value)} />}
      </Field>
      {error && <Status variant="admin" intent="error" role="alert">{error}</Status>}
      <ul className={ui.picker} aria-label={kind === "users" ? t.pickUser : t.pickEnsemble}>
        {rows.map((row) => (
          <li key={row.id} className={ui.definition}>
            <span className={ui.value}>{row.name}{row.email ? <><br /><span className={ui.term}>{row.email}</span></> : null}</span>
            <span className={ui.rowActions}>
              <Button size="compact" type="button" aria-label={t.choose + " " + row.name} onClick={() => onChoose(row)}>{t.choose}</Button>
            </span>
          </li>
        ))}
        {!rows.length && !error && <li className={ui.summary}>{t.emptyFiltered}</li>}
      </ul>
    </div>
  );
}

function AddMember({ entity, profile, opener, onCancel, onSaved }: {
  entity: "users" | "ensembles";
  profile: AdminRow;
  opener: HTMLElement | null;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t, fill, language } = useAdmin();
  const [chosen, setChosen] = useState<AdminRow | null>(null), [draft, setDraft] = useState<Permissions>(empty);
  const ensemble = entity === "ensembles" ? profile.id : chosen?.id,
    user = entity === "users" ? profile.id : chosen?.id;
  return (
    <ReasonDialog
      form
      title={entity === "users" ? fill(t.addUserTitle, { name: profile.name ?? profile.email }) : fill(t.addEnsembleTitle, { name: profile.name })}
      confirmLabel={adminManagementMessages[language].add}
      opener={opener}
      canConfirm={!!chosen}
      onCancel={onCancel}
      onConfirm={async (reason) => {
        await adminRequest("ensembles/" + encodeURIComponent(ensemble) + "/members", "POST", { userId: user, permissions: draft, reason });
        await onSaved();
      }}
    >
      <Picker kind={entity === "users" ? "ensembles" : "users"} chosen={chosen} onChoose={setChosen} />
      {chosen && <PermissionFields value={draft} onChange={setDraft} />}
    </ReasonDialog>
  );
}

function Invite({ profile, opener, onCancel, onSaved }: {
  profile: AdminRow;
  opener: HTMLElement | null;
  onCancel: () => void;
  onSaved: (delivery: string) => Promise<void>;
}) {
  const { t, fill, language } = useAdmin();
  const d = adminManagementMessages[language];
  const [email, setEmail] = useState(""), [draft, setDraft] = useState<Permissions>(empty);
  const capabilities = { manageMembers: draft.manageMembers, editPieces: draft.editPieces, transcribe: draft.transcribe };
  // One idempotency key per distinct invitation; a retry of the same request stays idempotent.
  const idempotencyKey = useMemo(() => crypto.randomUUID(), [email.trim().toLowerCase(), JSON.stringify(capabilities)]);
  const valid = /^[^\s@]+@[^\s@]+$/.test(email.trim());
  return (
    <ReasonDialog
      form
      title={fill(t.inviteTitle, { name: profile.name })}
      body={d.inviteNote}
      confirmLabel={t.inviteConfirm}
      opener={opener}
      canConfirm={valid}
      onCancel={onCancel}
      onConfirm={async (reason) => {
        const r = await adminRequest("ensembles/" + encodeURIComponent(profile.id) + "/invitations", "POST", {
          email: email.trim(),
          language,
          capabilities,
          idempotencyKey,
          reason,
        });
        await onSaved(r.deliveryState);
      }}
    >
      <Field label={d.invitationEmail} hint={fill(t.inviteLanguage, { language: language === "de" ? "Deutsch" : "English" })}>
        {(association) => <Input {...association} type="email" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} />}
      </Field>
      <PermissionFields value={draft} onChange={setDraft} invitation />
    </ReasonDialog>
  );
}

type Action =
  | { kind: "edit" | "remove"; row: AdminRow }
  | { kind: "add" | "invite" };

/** Membership oversight and AICAP-26 management for one user or ensemble detail page. */
export function AdminMemberships({ entity, profile, onChanged, searchLabel }: {
  entity: "users" | "ensembles";
  searchLabel: string;
  profile: AdminRow;
  onChanged: () => Promise<void>;
}) {
  const { t, fill, language } = useAdmin();
  const d = adminManagementMessages[language];
  const [action, setAction] = useState<Action | null>(null),
    [search, setSearch] = useState(""),
    [revision, setRevision] = useState(0),
    [status, setStatus] = useState(""),
    [rows, setRows] = useState<AdminRow[]>([]);
  const opener = useRef<HTMLElement | null>(null),
    heading = useRef<HTMLDivElement>(null);
  const open = (next: Action) => {
    opener.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    setStatus("");
    setAction(next);
  };
  async function refresh(message: string) {
    setRevision((v) => v + 1);
    try {
      await onChanged();
      setStatus(message);
    } catch {
      setStatus(d.refreshFailed);
    }
  }
  const focusHeading = useRef(false);
  // Runs after the closed dialog has restored focus to its opener; a removed row's opener is gone.
  useEffect(() => {
    if (action || !focusHeading.current) return;
    focusHeading.current = false;
    heading.current?.querySelector<HTMLElement>("h2")?.focus();
  }, [action]);
  async function saved(message: string = d.success) {
    focusHeading.current = action?.kind === "remove";
    setAction(null);
    await refresh(message);
  }
  const current = (row: AdminRow) => rows.find((r) => r.id === row.id) ?? row;
  const subject = (row: AdminRow) => ({ name: row.name ?? row.email, ensemble: row.ensemble_name });
  const columns = useMemo<AdminColumn[]>(
    () => [
      entity === "users"
        ? {
            id: "ensemble_name",
            label: t.ensemble,
            sort: "ensemble",
            cell: (row) => <Link to="/admin/$" params={{ _splat: "ensembles/" + row.ensemble_id }} className={ui.rowLink}>{row.ensemble_name}</Link>,
          }
        : {
            id: "name",
            label: t.name,
            sort: "name",
            cell: (row) => <Link to="/admin/$" params={{ _splat: "users/" + row.user_id }} className={ui.rowLink}>{row.name}</Link>,
          },
      ...(entity === "ensembles" ? [{ id: "email", label: t.email, sort: "email" }] : []),
      { id: "permissions", label: t.permissions, cell: (row) => <PermissionBadges row={row} /> },
      { id: "created_at", label: t.since, cell: (row) => <Instant value={row.created_at} /> },
      {
        id: "actions",
        label: d.actions,
        cell: (row) => (
          <span className={ui.rowActions}>
            <Button size="compact" type="button" aria-label={fill(t.editLabel, subject(row))} onClick={() => open({ kind: "edit", row })}>
              {t.edit}
            </Button>
            <Button size="compact" type="button" aria-label={fill(t.removeLabel, subject(row))} onClick={() => open({ kind: "remove", row })}>
              {t.remove}
            </Button>
          </span>
        ),
      },
    ],
    [entity, language],
  );
  return (
    <div ref={heading}>
      <Section
        data-admin="management"
        title={entity === "users" ? t.userMemberships : t.ensembleMembers}
        actions={
          <>
            <Button size="compact" type="button" onClick={() => open({ kind: "add" })}>
              {entity === "users" ? t.addToEnsemble : t.addMember}
            </Button>
            {entity === "ensembles" && (
              <Button size="compact" type="button" onClick={() => open({ kind: "invite" })}>{t.inviteByEmail}</Button>
            )}
          </>
        }
      >
        {status && <Status variant="admin" intent={status === d.refreshFailed || status === d.invitationNotSent ? "warning" : "success"}>{status}</Status>}
        <AdminToolbar query={search ? { search } : {}} setQuery={q => setSearch(q.search ?? "")} fields={[]} search={searchLabel} />
        <AdminDataTable
          data-admin="memberships"
          search={search}
          filtered={!!search.trim()}
          onClear={() => setSearch("")}
          path="memberships"
          caption={entity === "users" ? t.userMemberships : t.ensembleMembers}
          columns={columns}
          filters={entity === "users" ? { user: profile.id } : { ensemble: profile.id }}
          revision={revision}
          onRows={setRows}
          emptyTitle={entity === "users" ? t.noMemberships : t.noMembers}
          pageSize={30}
        />
      </Section>
      {action?.kind === "edit" && (
        <EditPermissions
          row={current(action.row)}
          opener={opener.current}
          onCancel={() => setAction(null)}
          onSaved={() => saved()}
          onStale={async () => { setRevision((v) => v + 1); await onChanged(); }}
        />
      )}
      {action?.kind === "remove" && (
        <ReasonDialog
          destructive
          title={fill(t.removeTitle, subject(action.row))}
          body={t.removeBody}
          confirmLabel={t.removeConfirm}
          opener={opener.current}
          onCancel={() => setAction(null)}
          onConfirm={async (reason) => {
            const row = current(action.row);
            try {
              await adminRequest(
                "ensembles/" + encodeURIComponent(row.ensemble_id) + "/members/" + encodeURIComponent(row.id),
                "DELETE",
                { expected: permissions(row), reason },
              );
            } catch (error) {
              setRevision((v) => v + 1);
              await onChanged().catch(() => {});
              throw error;
            }
            await saved();
          }}
        />
      )}
      {action?.kind === "add" && (
        <AddMember entity={entity} profile={profile} opener={opener.current} onCancel={() => setAction(null)} onSaved={() => saved()} />
      )}
      {action?.kind === "invite" && (
        <Invite
          profile={profile}
          opener={opener.current}
          onCancel={() => setAction(null)}
          onSaved={(delivery) => saved(delivery === "not_sent" ? d.invitationNotSent : d.invitationCreated)}
        />
      )}
    </div>
  );
}

/** Platform role with a reasoned, audited grant/revoke; revoking is a destructive confirmation. */
export function AdminRole({ profile, sysadmin, onChanged }: { profile: AdminRow; sysadmin: boolean; onChanged: () => Promise<void> }) {
  const { t, fill, language } = useAdmin();
  const d = adminManagementMessages[language];
  const [open, setOpen] = useState(false), [status, setStatus] = useState("");
  const opener = useRef<HTMLElement | null>(null);
  return (
    <Section title={t.roleTitle} data-admin="role">
      <p className={ui.summary}>{sysadmin ? t.isSysadmin : t.notSysadmin}</p>
      <p className={ui.summary}>{d.verifiedNote}</p>
      {status && <Status variant="admin" intent="success">{status}</Status>}
      <div className={ui.actions}>
        <Button
          size="compact"
          type="button"
          disabled={!profile.email_verified}
          onClick={(event) => { opener.current = event.currentTarget; setStatus(""); setOpen(true); }}
        >
          {sysadmin ? t.revoke : t.grant}
        </Button>
        {!profile.email_verified && <span className={ui.note}>{t.needsVerified}</span>}
      </div>
      {open && (
        <ReasonDialog
          destructive={sysadmin}
          title={fill(sysadmin ? t.revokeTitle : t.grantTitle, { email: profile.email })}
          body={sysadmin ? t.revokeBody : t.grantBody}
          confirmLabel={sysadmin ? t.revokeConfirm : t.grantConfirm}
          opener={opener.current}
          onCancel={() => setOpen(false)}
          onConfirm={async (reason) => {
            await adminRequest("users/" + encodeURIComponent(profile.id) + "/sysadmin", "PUT", { sysadmin: !sysadmin, expected: sysadmin, reason });
            setOpen(false);
            try { await onChanged(); setStatus(d.success); } catch { setStatus(d.refreshFailed); }
          }}
        />
      )}
    </Section>
  );
}
