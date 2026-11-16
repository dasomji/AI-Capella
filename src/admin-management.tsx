import { useEffect, useRef, useState } from "react";
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
    <div className="admin-permissions">
      {value.isLead && !invitation && <p>{d.leadHint}</p>}
      {permissionKeys
        .filter((k) => !invitation || k !== "isLead")
        .map((k) => (
          <label key={k}>
            <input
              type="checkbox"
              checked={value[k]}
              onChange={(e) => onChange({ ...value, [k]: e.target.checked })}
            />
            {k === "isLead" ? d.lead : d[k]}
          </label>
        ))}
    </div>
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
      <button
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
      </button>
      <button
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
      </button>
    </>
  );
}
function Confirmation({
  pending,
  language,
  onCancel,
  onConfirm,
}: {
  pending: Pending;
  language: Lang;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const d = adminManagementMessages[language],
    a = adminMessages[language];
  useEffect(() => {
    const el = dialog.current!;
    el.showModal();
    return () => el.close();
  }, []);
  const values = (p: Permissions) =>
    permissionKeys
      .map(
        (k) => (k === "isLead" ? d.lead : d[k]) + ": " + (p[k] ? a.yes : a.no),
      )
      .join(" · ");
  return (
    <dialog
      ref={dialog}
      className="admin-confirm admin-management-confirm"
      aria-labelledby="admin-change-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
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
        <h3 id="admin-change-title">{pending.title}</h3>
        <p>{d.confirmNote}</p>
        {pending.before && (
          <p>
            {d.before}: {values(pending.before)}
          </p>
        )}
        {pending.after && (
          <p>
            {d.after}: {values(pending.after)}
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        <label>
          {d.reason}
          <textarea
            autoFocus
            required
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <button type="submit" disabled={busy || !reason.trim()}>
          {d.confirm}
        </button>
        <button type="button" disabled={busy} onClick={onCancel}>
          {d.cancel}
        </button>
      </form>
    </dialog>
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
  const queue = (p: Pending) => {
    setStatus("");
    setPending(p);
  };
  const columns: AdminColumn[] = [
    {
      id: entity === "users" ? "ensemble_name" : "name",
      label: entity === "users" ? a.ensembles : f.name,
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
  ];
  const ensemble = entity === "ensembles" ? profile.id : chosen?.id,
    user = entity === "users" ? profile.id : chosen?.id;
  return (
    <section className="admin-management">
      <h3>{a.memberships}</h3>
      {status && <p role="status">{status}</p>}
      {entity === "users" && (
        <div className="admin-role">
          <h3>
            {d.sysadmin}: {sysadmin ? a.yes : a.no}
          </h3>
          <p>{d.verifiedNote}</p>
          <button
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
          </button>
        </div>
      )}
      <AdminDataTable
        path="memberships"
        caption={a.memberships}
        columns={columns}
        language={language}
        filters={
          entity === "users" ? { user: profile.id } : { ensemble: profile.id }
        }
        revision={revision}
      />
      <button
        type="button"
        onClick={() => {
          setAdding(!adding);
          setChosen(null);
          setDraft(empty);
          setEmail("");
        }}
      >
        {adding ? d.cancel : d.add}
      </button>
      {adding && (
        <div className="admin-add">
          <h3>{entity === "ensembles" ? d.findUser : a.ensembles}</h3>
          <AdminDataTable
            path={entity === "ensembles" ? "users" : "ensembles"}
            caption={entity === "ensembles" ? d.chooseUser : a.ensembles}
            columns={[
              { id: "name", label: f.name, sort: "name" },
              ...(entity === "ensembles"
                ? [{ id: "email", label: f.email, sort: "email" }]
                : []),
              {
                id: "choose",
                label: d.actions,
                cell: (r) => (
                  <button
                    type="button"
                    aria-pressed={chosen?.id === r.id}
                    onClick={() => setChosen(r)}
                  >
                    {entity === "ensembles" ? d.chooseUser : d.chooseEnsemble}
                  </button>
                ),
              },
            ]}
            language={language}
          />
          {chosen && (
            <>
              <p>
                {d.selected}: {chosen.name}
                {chosen.email ? " · " + chosen.email : ""}
              </p>
              <PermissionFields
                value={draft}
                onChange={setDraft}
                language={language}
              />
              <button
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
              </button>
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
              <label>
                {d.invitationEmail}
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <p>{d.inviteNote}</p>
              <PermissionFields
                value={draft}
                onChange={setDraft}
                language={language}
                invitation
              />
              <button type="submit" disabled={!email.trim()}>
                {d.invite}
              </button>
            </form>
          )}
        </div>
      )}
      {pending && (
        <Confirmation
          pending={pending}
          language={language}
          onCancel={() => setPending(null)}
          onConfirm={async (reason) => {
            try {
              const r = await adminRequest(pending.path, pending.method, {
                ...pending.body,
                reason,
              });
              setStatus(
                pending.path.endsWith("/invitations")
                  ? r.deliveryState === "not_sent"
                    ? d.invitationNotSent
                    : d.invitationCreated
                  : d.success,
              );
              setPending(null);
              setAdding(false);
              setRevision((v) => v + 1);
              await onChanged();
            } catch (e) {
              if (e instanceof Error) {
                setRevision((v) => v + 1);
              }
              throw e;
            }
          }}
        />
      )}
    </section>
  );
}
