import { Button, Checkbox, Field, Input, Textarea, ConfirmDialog, Status, Workspace } from "./design-system/react";
import { useEffect, useMemo, useCallback, useRef, useState } from "react";
import {
  AdminDataTable,
  type AdminRow,
  type AdminColumn,
} from "./admin-data-table";
import { adminRequest, managementError } from "./admin-request";
import {
  adminMessages,
  adminManagementMessages,
  adminFieldMessages,
  type Lang,
} from "./i18n";
type Permissions = {
  isLead: boolean;
  manageMembers: boolean;
  editPieces: boolean;
  transcribe: boolean;
};
const empty: Permissions = {
  isLead: false,
  manageMembers: false,
  editPieces: false,
  transcribe: false,
};
const permissionKeys = Object.keys(empty) as (keyof Permissions)[];
const permissions = (r: AdminRow): Permissions => ({
  isLead: r.is_lead,
  manageMembers: r.manage_members,
  editPieces: r.edit_music_pieces,
  transcribe: r.ai_transcription,
});
type Pending = {
  path: string;
  method: string;
  body: AdminRow;
  title: string;
  before?: Permissions;
  after?: Permissions;
};
function PermissionFields({
  value,
  onChange,
  language,
  invitation = false,
}: {
  value: Permissions;
  onChange: (p: Permissions) => void;
  language: Lang;
  invitation?: boolean;
}) {
  const d = adminManagementMessages[language];
  return (
    <Workspace part="permissions">
      {value.isLead && !invitation && <p>{d.leadHint}</p>}
      {permissionKeys
        .filter((k) => !invitation || k !== "isLead")
        .map((k) => (
          <Checkbox variant="permission" key={k} label={k === "isLead" ? d.lead : d[k]}
              checked={value[k]}
              onChange={(e) => onChange({ ...value, [k]: e.target.checked })}
            />
        ))}
    </Workspace>
  );
}
function MemberEditor({
  row,
  language,
  onPending,
}: {
  row: AdminRow;
  language: Lang;
  onPending: (p: Pending) => void;
}) {
  const [draft, setDraft] = useState(() => permissions(row));
  const d = adminManagementMessages[language];
  useEffect(() => setDraft(permissions(row)), [JSON.stringify(row)]);
  const path =
    "ensembles/" +
    encodeURIComponent(row.ensemble_id) +
    "/members/" +
    encodeURIComponent(row.id);
  const name = row.name + " · " + row.email + " · " + row.ensemble_name;
  return (
    <>
      <PermissionFields value={draft} onChange={setDraft} language={language} />
      <Button variant="dense" layout="tw:m-compact"
        type="button"
        disabled={JSON.stringify(draft) === JSON.stringify(permissions(row))}
        onClick={() =>
          onPending({
            path,
            method: "PATCH",
            body: { permissions: draft, expected: permissions(row) },
            title: d.save + " · " + name,
            before: permissions(row),
            after: draft,
          })
        }
      >
        {d.save}
      </Button>
      <Button variant="dense" layout="tw:m-compact"
        type="button"
        onClick={() =>
          onPending({
            path,
            method: "DELETE",
            body: { expected: permissions(row) },
            title: d.remove + " · " + name,
            before: permissions(row),
          })
        }
      >
        {d.remove}
      </Button>
    </>
  );
}
function Confirmation({
  pending,
  language,
  onCancel,
  onConfirm,
  opener,
}: {
  pending: Pending;
  language: Lang;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<void>;
  opener: HTMLElement | null;
}) {
  const [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const d = adminManagementMessages[language], a = adminMessages[language];
  const values = (p: Permissions) =>
    permissionKeys
      .map(
        (k) => (k === "isLead" ? d.lead : d[k]) + ": " + (p[k] ? a.yes : a.no),
      )
      .join(" · ");
  return (
    <ConfirmDialog open variant="admin-confirm" title={pending.title} data-admin="confirm"
      behavior={{opener,busy,busyCancel:'block',outside:'ignore'}} onCancel={onCancel}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || !reason.trim()) return;
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
        <Workspace as="p" part="paragraph">{d.confirmNote}</Workspace>
        {pending.before && (
          <Workspace as="p" part="paragraph">
            {d.before}: {values(pending.before)}
          </Workspace>
        )}
        {pending.after && (
          <Workspace as="p" part="paragraph">
            {d.after}: {values(pending.after)}
          </Workspace>
        )}
        {error && <Status variant="admin" role="alert">{error}</Status>}
        <Field variant="admin" label={d.reason}>{association => <Textarea {...association}
            autoFocus
            required
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />}</Field>
        <Button variant="dense" layout="tw:m-compact" type="submit" busy={busy} disabled={!reason.trim()}>
          {d.confirm}
        </Button>
        <Button variant="dense" layout="tw:m-compact" type="button" disabled={busy} onClick={onCancel}>
          {d.cancel}
        </Button>
      </form>
    </ConfirmDialog>
  );
}
export function AdminMembershipManagement({
  entity,
  profile,
  sysadmin = false,
  language,
  onChanged,
}: {
  entity: "users" | "ensembles";
  profile: AdminRow;
  sysadmin?: boolean;
  language: Lang;
  onChanged: () => Promise<void>;
}) {
  const d = adminManagementMessages[language],
    a = adminMessages[language],
    f = adminFieldMessages[language] as Record<string, string>;
  const [pending, setPending] = useState<Pending | null>(null),
    [revision, setRevision] = useState(0),
    [adding, setAdding] = useState(false),
    [chosen, setChosen] = useState<AdminRow | null>(null),
    [draft, setDraft] = useState<Permissions>(empty),
    [email, setEmail] = useState(""),
    [status, setStatus] = useState("");
  const heading = useRef<HTMLHeadingElement>(null),
    confirmOpener = useRef<HTMLElement | null>(null),
    focusAfterRemove = useRef(false);
  useEffect(() => {
    if (!pending && focusAfterRemove.current) {
      focusAfterRemove.current = false;
      heading.current?.focus();
    }
  }, [pending]);
  const queue = useCallback((p: Pending) => {
    confirmOpener.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    setStatus("");
    setPending(p);
  }, []);
  const columns = useMemo<AdminColumn[]>(
    () => [
      {
        id: entity === "users" ? "ensemble_name" : "name",
        label: entity === "users" ? a.ensembles : a.name,
        sort: entity === "ensembles" ? "name" : "ensemble",
      },
      { id: "email", label: f.email, sort: "email" },
      {
        id: "permissions",
        label: d.actions,
        cell: (row) => (
          <MemberEditor row={row} language={language} onPending={queue} />
        ),
      },
    ],
    [entity, language, queue],
  );
  const pickerColumns = useMemo<AdminColumn[]>(
    () => [
      { id: "name", label: a.name, sort: "name" },
      ...(entity === "ensembles"
        ? [{ id: "email", label: f.email, sort: "email" }]
        : []),
      {
        id: "choose",
        label: d.actions,
        cell: (r) => (
          <Button variant="dense" layout="tw:m-compact"
            type="button"
            aria-pressed={chosen?.id === r.id}
            onClick={() => setChosen(r)}
          >
            {entity === "ensembles" ? d.chooseUser : d.chooseEnsemble}
          </Button>
        ),
      },
    ],
    [entity, language, chosen?.id],
  );
  const ensemble = entity === "ensembles" ? profile.id : chosen?.id,
    user = entity === "users" ? profile.id : chosen?.id;
  return (
    <Workspace as="section" part="region" data-admin="management">
      <Workspace as="h3" part="subheading" ref={heading} tabIndex={-1}>{a.memberships}</Workspace>
      {status && <Status variant="admin">{status}</Status>}
      {entity === "users" && (
        <Workspace part="inset">
          <Workspace as="h3" part="subheading">
            {d.sysadmin}: {sysadmin ? a.yes : a.no}
          </Workspace>
          <Workspace as="p" part="paragraph">{d.verifiedNote}</Workspace>
          <Button variant="dense" layout="tw:m-compact"
            type="button"
            disabled={!profile.email_verified}
            onClick={() =>
              queue({
                path: "users/" + encodeURIComponent(profile.id) + "/sysadmin",
                method: "PUT",
                body: { sysadmin: !sysadmin, expected: sysadmin },
                title: (sysadmin ? d.revoke : d.grant) + " · " + profile.email,
              })
            }
          >
            {sysadmin ? d.revoke : d.grant}
          </Button>
        </Workspace>
      )}
      <AdminDataTable
        actionLayout="tw:m-compact"
        path="memberships"
        caption={a.memberships}
        columns={columns}
        language={language}
        filters={
          entity === "users" ? { user: profile.id } : { ensemble: profile.id }
        }
        revision={revision}
      />
      <Button variant="dense" layout="tw:m-compact"
        type="button"
        onClick={() => {
          setAdding(!adding);
          setChosen(null);
          setDraft(empty);
          setEmail("");
        }}
      >
        {adding ? d.cancel : d.add}
      </Button>
      {adding && (
        <Workspace part="inset" data-admin="add">
          <Workspace as="h3" part="subheading">{entity === "ensembles" ? d.findUser : a.ensembles}</Workspace>
          <AdminDataTable
            actionLayout="tw:m-compact"
            path={entity === "ensembles" ? "users" : "ensembles"}
            caption={entity === "ensembles" ? d.chooseUser : a.ensembles}
            columns={pickerColumns}
            language={language}
          />
          {chosen && (
            <>
              <Workspace as="p" part="paragraph">
                {d.selected}: {chosen.name}
                {chosen.email ? " · " + chosen.email : ""}
              </Workspace>
              <PermissionFields
                value={draft}
                onChange={setDraft}
                language={language}
              />
              <Button variant="dense" layout="tw:m-compact"
                type="button"
                onClick={() =>
                  queue({
                    path:
                      "ensembles/" + encodeURIComponent(ensemble) + "/members",
                    method: "POST",
                    body: { userId: user, permissions: draft },
                    title:
                      d.add +
                      " · " +
                      (entity === "users" ? profile.email : chosen.email) +
                      " · " +
                      (entity === "ensembles" ? profile.name : chosen.name),
                    after: draft,
                  })
                }
              >
                {d.add}
              </Button>
            </>
          )}
          {entity === "ensembles" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                queue({
                  path:
                    "ensembles/" +
                    encodeURIComponent(profile.id) +
                    "/invitations",
                  method: "POST",
                  body: {
                    email,
                    language,
                    capabilities: {
                      manageMembers: draft.manageMembers,
                      editPieces: draft.editPieces,
                      transcribe: draft.transcribe,
                    },
                    idempotencyKey: crypto.randomUUID(),
                  },
                  title: d.invite + " · " + email + " · " + profile.name,
                  after: { ...draft, isLead: false },
                });
              }}
            >
              <Field variant="admin" label={d.invitationEmail}>{association => <Input {...association}
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />}</Field>
              <Workspace as="p" part="paragraph">{d.inviteNote}</Workspace>
              <PermissionFields
                value={draft}
                onChange={setDraft}
                language={language}
                invitation
              />
              <Button variant="dense" layout="tw:m-compact" type="submit" disabled={!email.trim()}>
                {d.invite}
              </Button>
            </form>
          )}
        </Workspace>
      )}
      {pending && (
        <Confirmation
          opener={confirmOpener.current}
          pending={pending}
          language={language}
          onCancel={() => setPending(null)}
          onConfirm={async (reason) => {
            let r;
            try {
              r = await adminRequest(pending.path, pending.method, {
                ...pending.body,
                reason,
              });
            } catch (error) {
              setRevision((v) => v + 1);
              try {
                await onChanged();
              } catch {
                /* Preserve the mutation error. */
              }
              throw error;
            }
            setStatus(
              pending.path.endsWith("/invitations")
                ? r.deliveryState === "not_sent"
                  ? d.invitationNotSent
                  : d.invitationCreated
                : d.success,
            );
            focusAfterRemove.current = pending.method === "DELETE";
            setPending(null);
            setAdding(false);
            setRevision((v) => v + 1);
            // The mutation has committed. A refresh error belongs to the open detail, not its closed dialog.
            try {
              await onChanged();
            } catch {
              setStatus(d.refreshFailed);
            }
          }}
        />
      )}
    </Workspace>
  );
}
