import pg from 'pg';
import {userInfo,hostname} from 'node:os';
import {logError} from '../server/logger.server';
export async function changeAdminRole(connectionString: string, email: string, grant: boolean) {
    const db = new pg.Client({ connectionString, connectionTimeoutMillis: 5000, query_timeout: 10000, statement_timeout: 5000 });
    await db.connect();
    try {
        await db.query('begin');
        const u = (await db.query('select id,email_verified from "user" where lower(email)=lower($1) for update', [email.trim()])).rows[0];
        if (!u || !u.email_verified)
            throw Error('A verified account is required');
        const changed = grant
            ? await db.query("insert into platform_roles(user_id,role) values($1,'sysadmin') on conflict(user_id) do nothing", [u.id])
            : await db.query('delete from platform_roles where user_id=$1', [u.id]);
        await db.query("insert into audit_events(action,target_id,outcome,metadata) values($1,$2,'ok',$3)", ['admin.user.' + (grant ? 'grant' : 'revoke'), u.id, { targetType: 'user', source: 'server-cli', operator: userInfo().username, sudoUser: process.env.SUDO_USER ?? null, hostname: hostname(), changed: !!changed.rowCount }]);
        await db.query('commit');
    }
    catch (e) {
        try {await db.query('rollback');} catch(rollbackError) {logError('admin.cli.rollback',rollbackError);}
        throw e;
    }
    finally {
        await db.end();
    }
}
if (process.argv[1]?.endsWith('admin-role.ts')) {
    const [operation, email, ...extra] = process.argv.slice(2);
    if (!process.env.DATABASE_URL || !['grant', 'revoke'].includes(operation) || !email || extra.length) {
        console.error('Requires DATABASE_URL. Usage: npm run admin:grant -- <email> / npm run admin:revoke -- <email>');
        process.exitCode = 1;
    }
    else
        try {
            await changeAdminRole(process.env.DATABASE_URL, email, operation === 'grant');
            console.info('Platform role updated; effective on the next request.');
        }
        catch (e) {
            console.error(e instanceof Error ? e.message : 'Role update failed');
            process.exitCode = 1;
        }
}
