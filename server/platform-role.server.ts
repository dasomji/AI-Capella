import type { PoolClient } from "pg";
import { DomainError } from "./domain-error.server";
/** CLI and web role changes share a single transaction lock and zero-admin guard. */
export async function lockPlatformRoles(
  db: Pick<PoolClient, "query">,
  exclusive = true,
) {
  await db.query(
    `select ${exclusive ? "pg_advisory_xact_lock" : "pg_advisory_xact_lock_shared"}(hashtextextended('platform:sysadmin',0))`,
  );
}
export async function changePlatformRole(
  db: Pick<PoolClient, "query">,
  user: string,
  grant: boolean,
  options: { actor?: string; expected?: boolean } = {},
) {
  const u = (
    await db.query(
      'select id,email_verified from "user" where id=$1 for update',
      [user],
    )
  ).rows[0];
  if (!u) throw new DomainError("not_found", 404);
  if (!u.email_verified) throw new DomainError("verified_email_required", 409);
  const before = !!(
    await db.query("select 1 from platform_roles where user_id=$1", [user])
  ).rowCount;
  if (!grant && options.actor === user)
    throw new DomainError("self_revoke", 409);
  if (
    !grant &&
    before &&
    (await db.query("select 1 from platform_roles")).rowCount! <= 1
  )
    throw new DomainError("last_sysadmin", 409);
  if (options.expected !== undefined && options.expected !== before)
    throw new DomainError("stale_permissions", 409);
  if (grant)
    await db.query(
      "insert into platform_roles(user_id,role) values($1,'sysadmin') on conflict(user_id) do nothing",
      [user],
    );
  else {
    await db.query("delete from platform_roles where user_id=$1", [user]);
    await db.query(
      "update invitations set state='revoked',revoked_at=now() where inviter_id=$1 and admin_issued and state='pending'",
      [user],
    );
  }
  return before;
}
