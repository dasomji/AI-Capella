import { pool } from './db/index.server';
export async function cleanupUnverifiedAccounts() {
  await pool.query("delete from rate_limit where last_request < extract(epoch from now() - interval '48 hours')*1000");
  await pool.query("delete from idempotency_records where created_at < now() - interval '24 hours'");
  await pool.query("delete from invitation_sends where created_at < now() - interval '24 hours'");
  await pool.query("delete from superseded_invitations where created_at < now() - interval '15 days'");
  const result = await pool.query(`delete from "user" where email_verified = false and created_at < now() - interval '7 days' returning id`);
  return result.rowCount ?? 0;
}
