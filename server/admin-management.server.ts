import type { Context } from "hono";
import type { PoolClient } from "pg";
import { z } from "zod";
import {
  adminMemberAdd,
  adminMemberEdit,
  adminMemberRemove,
  adminRoleEdit,
  adminInvitation,
  safeAdminText,
} from "../src/api/admin";
import {
  DomainError,
  transaction,
  lockEnsemble,
  protectLead,
  removeMembership,
  revokeMemberInvitations,
  membershipChanged,
} from "./domain.server";
import { createInvitation, sendInvite, inviteView } from "./domain-http.server";
import { changePlatformRole, lockPlatformRoles } from "./platform-role.server";
import { pool } from "./db/index.server";
import type { admin as AdminRouter } from "./admin.server";

export function permissionValues(m: Record<string, any>) {
  return {
    isLead: !!m.is_lead,
    manageMembers: !!m.manage_members,
    editPieces: !!m.edit_music_pieces,
    transcribe: !!m.ai_transcription,
  };
}
function expectPermissions(m: Record<string, any>, expected: unknown) {
  if (JSON.stringify(permissionValues(m)) !== JSON.stringify(expected))
    throw new DomainError("stale_permissions", 409);
}
async function member(db: PoolClient, ensemble: string, id: string) {
  const m = (
    await db.query("select * from memberships where ensemble_id=$1 and id=$2", [
      ensemble,
      id,
    ])
  ).rows[0];
  if (!m) throw new DomainError("not_found", 404);
  return m;
}
async function event(
  db: PoolClient,
  actor: string,
  type: string,
  target: string,
  ensemble: string | null,
  action: string,
  outcome: string,
  reason: string,
  before: unknown = null,
  after: unknown = null,
) {
  await db.query(
    "insert into audit_events(actor_id,target_id,ensemble_id,action,outcome,metadata) values($1,$2,$3,$4,$5,$6)",
    [
      actor,
      target,
      ensemble,
      "admin." + type + "." + action,
      outcome,
      { targetType: type, reason, before, after },
    ],
  );
}
/** Also used by the outer Origin boundary, after its database-backed session check. */
export async function rejectedAdminOrigin(actor: string, path: string) {
  const match = path.match(
    /^\/api\/admin\/(?:ensembles\/([^/]+)\/(members|invitations)(?:\/([^/]+))?|users\/([^/]+)\/sysadmin)$/,
  );
  if (!match) return;
  const [, ensemble, kind, id, user] = match;
  await event(
    pool as unknown as PoolClient,
    actor,
    user ? "user" : kind === "members" ? "membership" : "invitation",
    user ?? id ?? ensemble,
    null,
    "rejected",
    "untrusted_origin",
    "",
  );
}
export function registerAdminManagement(
  admin: typeof AdminRouter,
  limit: (actor: string, kind: string, max: number) => Promise<void>,
  json: (c: Context, data: any, status?: any) => Response,
) {
  type Result = {
    data: unknown;
    before?: unknown;
    after?: unknown;
    target?: string;
    notify?: () => void | Promise<void>;
  };
  const mutate =
    (
      type: string,
      action: string,
      work: (db: PoolClient, c: Context, input: unknown) => Promise<Result>,
    ) =>
    async (c: Context) => {
      const actor = c.get("actor") as string,
        ensemble = c.req.param("ensemble") ?? null;
      let target = c.req.param("member") ?? c.req.param("id") ?? ensemble ?? "",
        reason = "";
      let notification: Result["notify"];
      const result = await transaction(async (db) => {
        // Exclusive for role changes; shared for membership changes. Recheck under this lock.
        await lockPlatformRoles(db, type === "user");
        if (
          !(
            await db.query(
              'select 1 from platform_roles r join "user" u on u.id=r.user_id where r.user_id=$1 and u.email_verified',
              [actor],
            )
          ).rowCount
        )
          throw new DomainError("not_found", 404);
        await db.query("savepoint management");
        try {
          await limit(actor, "mutation", 20);
          const input = await c.req.json();
          const parsedReason = safeAdminText
            .trim()
            .min(1)
            .max(1000)
            .safeParse(input?.reason);
          if (parsedReason.success) reason = parsedReason.data;
          if (ensemble) {
            await lockEnsemble(db, ensemble);
            if (
              !(
                await db.query("select 1 from ensembles where id=$1", [
                  ensemble,
                ])
              ).rowCount
            )
              throw new DomainError("not_found", 404);
          }
          const r = await work(db, c, input);
          target = r.target ?? target;
          notification = r.notify;
          await event(
            db,
            actor,
            type,
            target,
            ensemble,
            action,
            "ok",
            reason,
            r.before ?? null,
            r.after ?? null,
          );
          return { data: r.data };
        } catch (error) {
          await db.query("rollback to savepoint management");
          const outcome =
            error instanceof DomainError
              ? error.code
              : error instanceof z.ZodError || error instanceof SyntaxError
                ? "invalid_input"
                : "failed";
          // Only recognized ensemble IDs can be stored in the audit FK.
          const scope =
            ensemble &&
            (await db.query("select 1 from ensembles where id=$1", [ensemble]))
              .rowCount
              ? ensemble
              : null;
          await event(db, actor, type, target, scope, action, outcome, reason);
          return { error };
        }
      });
      if ("error" in result) throw result.error;
      await notification?.();
      return json(c, result.data);
    };
  admin.post(
    "/ensembles/:ensemble/members",
    mutate("membership", "add", async (db, c, raw) => {
      const input = adminMemberAdd.parse(raw),
        e = c.req.param("ensemble")!;
      if (
        !(await db.query('select 1 from "user" where id=$1', [input.userId]))
          .rowCount
      )
        throw new DomainError("not_found", 404);
      const p = input.permissions;
      const m = (
        await db.query(
          "insert into memberships(ensemble_id,user_id,is_lead,manage_members,edit_music_pieces,ai_transcription) values($1,$2,$3,$4,$5,$6) on conflict(ensemble_id,user_id) do nothing returning *",
          [
            e,
            input.userId,
            p.isLead,
            p.manageMembers,
            p.editPieces,
            p.transcribe,
          ],
        )
      ).rows[0];
      if (!m) throw new DomainError("already_member", 409);
      return {
        data: { status: true },
        target: m.id,
        after: permissionValues(m),
        notify: () => membershipChanged(e, input.userId),
      };
    }),
  );
  admin.patch(
    "/ensembles/:ensemble/members/:member",
    mutate("membership", "permissions", async (db, c, raw) => {
      const input = adminMemberEdit.parse(raw),
        e = c.req.param("ensemble")!,
        m = await member(db, e, c.req.param("member")!);
      expectPermissions(m, input.expected);
      if (!input.permissions.isLead) await protectLead(db, e, m);
      const p = input.permissions;
      await db.query(
        "update memberships set is_lead=$1,manage_members=$2,edit_music_pieces=$3,ai_transcription=$4 where id=$5",
        [p.isLead, p.manageMembers, p.editPieces, p.transcribe, m.id],
      );
      if ((m.is_lead && !p.isLead) || (m.manage_members && !p.manageMembers))
        await revokeMemberInvitations(db, e, m.user_id);
      return {
        data: { status: true },
        before: permissionValues(m),
        after: p,
        notify: () => membershipChanged(e, m.user_id),
      };
    }),
  );
  admin.delete(
    "/ensembles/:ensemble/members/:member",
    mutate("membership", "remove", async (db, c, raw) => {
      const input = adminMemberRemove.parse(raw),
        e = c.req.param("ensemble")!,
        m = await member(db, e, c.req.param("member")!);
      expectPermissions(m, input.expected);
      await removeMembership(db, e, m);
      return {
        data: { status: true },
        before: permissionValues(m),
        notify: () => membershipChanged(e, m.user_id, true),
      };
    }),
  );
  admin.put(
    "/users/:id/sysadmin",
    mutate("user", "sysadmin", async (db, c, raw) => {
      const input = adminRoleEdit.parse(raw),
        id = c.req.param("id")!;
      const before = await changePlatformRole(db, id, input.sysadmin, {
        actor: c.get("actor"),
        expected: input.expected,
      });
      return {
        data: { status: true },
        before: { sysadmin: before },
        after: { sysadmin: input.sysadmin },
      };
    }),
  );
  admin.post(
    "/ensembles/:ensemble/invitations",
    mutate("invitation", "create", async (db, c, raw) => {
      const { reason, ...input } = adminInvitation.parse(raw);
      // Invitations are offered only for emails without an account; existing users use direct membership.
      if (
        (
          await db.query('select 1 from "user" where lower(email)=$1', [
            input.email,
          ])
        ).rowCount
      )
        throw new DomainError("account_exists", 409);
      const delivery = await createInvitation(
        db,
        c.req.param("ensemble")!,
        { id: c.get("actor") },
        input,
        true,
      );
      const i = delivery.invitation;
      const data = inviteView(i);
      return {
        data,
        target: String(i.id),
        after: { ...permissionValues(i), isLead: false },
        notify: async () => {
          if (delivery.raw) await sendInvite(pool, i, delivery.raw);
          Object.assign(data, inviteView(i));
        },
      };
    }),
  );
}
