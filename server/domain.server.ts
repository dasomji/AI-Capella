import type { PoolClient } from "pg";
import { pool } from "./db/index.server";
export class DomainError extends Error {
  constructor(
    public code: string,
    public status = 400,
    public current?: unknown,
  ) {
    super(code);
  }
}
export async function transaction<T>(
  run: (db: PoolClient) => Promise<T>,
): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query("begin");
    const result = await run(db);
    await db.query("commit");
    return result;
  } catch (error) {
    await db.query("rollback");
    throw error;
  } finally {
    db.release();
  }
}
export type Capability = "lead" | "manageMembers" | "editPieces" | "transcribe";
export async function authorize(
  db: Pick<PoolClient, "query">,
  userId: string,
  ensembleId: string,
  capability?: Capability,
) {
  const { rows } = await db.query(
    "select * from memberships where ensemble_id=$1 and user_id=$2",
    [ensembleId, userId],
  );
  const member = rows[0];
  if (!member) throw new DomainError("not_found", 404);
  const columns = {
    lead: "is_lead",
    manageMembers: "manage_members",
    editPieces: "edit_music_pieces",
    transcribe: "ai_transcription",
  };
  if (capability && !member.is_lead && !member[columns[capability]])
    throw new DomainError("forbidden", 403);
  return member;
}
export async function lockEnsemble(db: PoolClient, id: string) {
  await db.query("select id from ensembles where id=$1 for update", [id]);
}
export async function protectLead(
  db: PoolClient,
  ensemble: string,
  member: { is_lead: boolean },
) {
  if (
    member.is_lead &&
    (
      await db.query(
        "select id from memberships where ensemble_id=$1 and is_lead",
        [ensemble],
      )
    ).rowCount! <= 1
  )
    throw new DomainError("last_lead", 409);
}
export async function audit(
  db: PoolClient,
  ensemble: string,
  actor: string,
  action: string,
  target: string,
) {
  await db.query(
    "insert into audit_events(ensemble_id,actor_id,action,target_id,outcome) values ($1,$2,$3,$4,'ok')",
    [ensemble, actor, action, target],
  );
}
const listeners = new Set<(ensemble: string, user?: string) => void>();
export const onMembershipChange = (
  fn: (ensemble: string, user?: string) => void,
) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
export function membershipChanged(ensemble: string, user?: string) {
  for (const fn of listeners) fn(ensemble, user);
}
const libraryListeners = new Set<
  (ensemble: string, changes: unknown[]) => Promise<void>
>();
export const onLibraryChange = (
  fn: (ensemble: string, changes: unknown[]) => Promise<void>,
) => {
  libraryListeners.add(fn);
  return () => {
    libraryListeners.delete(fn);
  };
};
export async function libraryChanged(ensemble: string, changes: unknown[]) {
  await Promise.all([...libraryListeners].map((fn) => fn(ensemble, changes)));
}
