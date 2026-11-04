import { currentSession } from './auth.server';
import { pool } from './db/index.server';
export async function isSysadmin(user: string) {
    return !!(await pool.query("select 1 from platform_roles where user_id=$1 and role='sysadmin'", [user])).rowCount;
}
export async function adminSession(headers: Headers) {
    const s = await currentSession(headers);
    return s?.user.emailVerified && await isSysadmin(s.user.id) ? s : null;
}
