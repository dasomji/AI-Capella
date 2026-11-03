import { pool } from './db/index.server';
export async function cleanupUnverifiedAccounts() {
  const result = await pool.query(`delete from "user" where email_verified = false and created_at < now() - interval '7 days' returning id`);
  return result.rowCount ?? 0;
}
