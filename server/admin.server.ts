import { Hono } from 'hono';
import { z } from 'zod';
import { pool } from './db/index.server';
import { adminSession } from './admin-auth.server';
import { DomainError, transaction } from './domain.server';
import { adminQuery, adminAccess, adminControl } from '../src/api/admin';
import { transcriptionUsage } from './usage.server';
import { processingPaused, transcriptionMetrics } from './transcription.server';
import { storage } from './storage.server';
import { env } from './env.server';
import { logError } from './logger.server';
export const admin = new Hono<{
    Variables: {
        actor: string;
    };
}>();
admin.onError((e, c) => { if (e instanceof DomainError)
    return c.json({ code: e.code }, e.status as 400); if (e instanceof z.ZodError || e instanceof SyntaxError)
    return c.json({ code: 'invalid_input', message: 'Use bounded filters and ISO instants with offset or Z.' }, 422); logError('admin.http', e); return c.json({ code: 'service_unavailable' }, 500); });
export async function adminLimit(actor: string, kind = 'read', max = 120) {
    const r = await pool.query(`insert into rate_limit(key,count,last_request) values($1,1,$2) on conflict(key) do update set count=case when rate_limit.last_request<=$2-60000 then 1 else rate_limit.count+1 end,last_request=case when rate_limit.last_request<=$2-60000 then $2 else rate_limit.last_request end returning count`, ['admin:' + kind + ':' + actor, Date.now()]);
    if (r.rows[0].count > max)
        throw new DomainError('rate_limited', 429);
}
admin.use('*', async (c, next) => { c.header('Cache-Control', 'no-store'); const s = await adminSession(c.req.raw.headers); if (!s)
    return c.json({ code: 'not_found' }, 404); c.set('actor', s.user.id); await adminLimit(s.user.id); await next(); });
export async function adminAudit(actor: string, type: string, target: string, action = 'detail', reason = '') {
    await pool.query("insert into audit_events(actor_id,action,target_id,outcome,metadata) values($1,$2,$3,'ok',$4)", [actor, 'admin.' + type + '.' + action, target, { targetType: type, reason }]);
}
const memberFields = 'm.id,m.user_id,m.ensemble_id,e.name as ensemble_name,u.name,u.email,m.is_lead,m.manage_members,m.edit_music_pieces,m.ai_transcription,m.created_at';
const sources = {
    users: { table: '"user" t', fields: `t.id,t.name,t.email,t.email_verified,t.created_at,exists(select 1 from platform_roles r where r.user_id=t.id) as sysadmin`, search: 't.email || \' \' || t.name', name: 't.name', date: 't.created_at' },
    ensembles: { table: 'ensembles t', fields: `t.id,t.name,t.kind,t.created_at,(select count(*)::int from memberships m where m.ensemble_id=t.id) as members,(select count(*)::int from memberships m where m.ensemble_id=t.id and m.is_lead) as leads,(select count(*)::int from music_pieces p where p.ensemble_id=t.id) as pieces,(select count(*)::int from invitations i where i.ensemble_id=t.id and i.state='pending' and i.expires_at>now()) as pending_invitations,(select coalesce(sum(size),0) from stored_objects o where o.ensemble_id=t.id and o.kind='original' and o.state='ready') as storage_bytes`, search: 't.name', name: 't.name', date: 't.created_at' },
    pieces: { table: 'music_pieces t', fields: `t.id,t.title,t.ensemble_id,t.format,t.created_at,t.updated_at,(select size from score_versions v where v.id=t.current_version_id) as size,(select count(*)::int from score_versions v where v.piece_id=t.id) as versions`, search: 't.title', name: 't.title', date: 't.updated_at' },
    jobs: { table: 'transcription_jobs t', fields: 't.id,t.ensemble_id,t.user_id,t.state,t.failure_reason,t.attempts,t.model,t.prompt_version,t.imported_piece_id,t.created_at,t.updated_at', search: 't.id', name: 't.id', date: 't.created_at' },
    audit: { table: 'audit_events t', fields: 't.id,t.actor_id,t.ensemble_id,t.action,t.target_id,t.outcome,t.created_at', search: 't.action', name: 't.action', date: 't.created_at' },
    memberships: { table: 'memberships m join ensembles e on e.id=m.ensemble_id join "user" u on u.id=m.user_id', fields: memberFields, search: 'u.email', name: 'u.name', date: 'm.created_at' },
    invitations: { table: 'invitations t', fields: "t.id,t.ensemble_id,t.email,t.inviter_id,case when t.state='pending' and t.expires_at<=now() then 'expired' else t.state end as state,t.expires_at,t.created_at,t.manage_members,t.edit_music_pieces,t.ai_transcription", search: 't.email', name: 't.email', date: 't.created_at' },
} as const;
for (const kind of Object.keys(sources) as (keyof typeof sources)[])
    admin.get('/' + (kind === 'jobs' ? 'transcription/jobs' : kind), async (c) => {
        const q = adminQuery.parse(c.req.query()), s = sources[kind], alias = kind === 'memberships' ? 'm' : 't', values: unknown[] = [], where: string[] = [];
        const bind = (v: unknown) => { values.push(v); return '$' + values.length; };
        if (q.search)
            where.push(`${s.search} ilike ${bind('%' + q.search.replace(/[\\%_]/g, '\\$&') + '%')}`);
        if (q.from)
            where.push(`${s.date}>=${bind(q.from)}`);
        if (q.to)
            where.push(`${s.date}<${bind(q.to)}`);
        if (q.ensemble && kind !== 'users' && kind !== 'ensembles')
            where.push(`${alias}.ensemble_id=${bind(q.ensemble)}`);
        if (q.user && kind === 'memberships')
            where.push(`m.user_id=${bind(q.user)}`);
        if (kind === 'users') {
            if (q.verified)
                where.push(`t.email_verified=${bind(q.verified === 'true')}`);
            if (q.sysadmin)
                where.push(`exists(select 1 from platform_roles r where r.user_id=t.id)=${bind(q.sysadmin === 'true')}`);
        }
        if (kind === 'pieces' && q.format)
            where.push(`t.format=${bind(q.format)}`);
        if (kind === 'jobs' && q.state)
            where.push(`t.state=${bind(q.state)}`);
        if (kind === 'audit') {
            for (const [key, col] of [['actor', 'actor_id'], ['target', 'target_id'], ['action', 'action'], ['outcome', 'outcome']] as const)
                if (q[key])
                    where.push(`t.${col}=${bind(q[key])}`);
            if (q.user)
                where.push(`(t.actor_id=${bind(q.user)} or t.target_id=${bind(q.user)})`);
            if (q.targetType)
                where.push(`(t.metadata->>'targetType'=${bind(q.targetType)} or t.action like ${bind(q.targetType + '.%')})`);
        }
        const order = q.sort === 'created' ? s.date : q.sort === 'name' ? s.name : alias + '.id', dir = q.direction === 'asc' ? 'asc' : 'desc';
        if (q.cursor) {
            let cursor;
            try {
                cursor = z.tuple([z.string(), z.string()]).parse(JSON.parse(Buffer.from(q.cursor, 'base64url').toString()));
            }
            catch {
                throw new DomainError('invalid_cursor', 422);
            }
            where.push(`(${order},${alias}.id) ${dir === 'asc' ? '>' : '<'} (${bind(cursor[0])},${bind(cursor[1])})`);
        }
        const rows = (await pool.query(`select ${s.fields},${order} as _cursor from ${s.table} ${where.length ? 'where ' + where.join(' and ') : ''} order by ${order} ${dir},${alias}.id ${dir} limit ${bind(q.limit + 1)}`, values)).rows;
        const more = rows.length > q.limit;
        const items = rows.slice(0, q.limit), last = items.at(-1);
        const cursor = more && last ? Buffer.from(JSON.stringify([last._cursor instanceof Date ? last._cursor.toISOString() : String(last._cursor), last.id])).toString('base64url') : null;
        for (const row of items)
            delete row._cursor;
        if (['memberships', 'invitations'].includes(kind))
            await adminAudit(c.get('actor'), q.user ? 'user' : 'ensemble', q.user ?? q.ensemble ?? 'all');
        return c.json({ items, nextCursor: cursor, timeZone: env.APP_TIME_ZONE });
    });
admin.get('/users/:id', async (c) => {
    const id = c.req.param('id');
    const u = (await pool.query('select id,name,email,email_verified,language,created_at from "user" where id=$1', [id])).rows[0];
    if (!u)
        throw new DomainError('not_found', 404);
    const sessions = (await pool.query(`select count(*)::int as count,max(updated_at) as last_active,max(created_at) as last_sign_in from session where user_id=$1 and expires_at>now()`, [id])).rows[0];
    const devices = (await pool.query(`select case when user_agent ~* 'mobile|android|iphone|ipad' then 'Mobile' else 'Desktop / other' end as device,count(*)::int as count,max(updated_at) as last_active from session where user_id=$1 and expires_at>now() group by 1`, [id])).rows;
    const roles = (await pool.query('select role,created_at from platform_roles where user_id=$1', [id])).rows;
    await adminAudit(c.get('actor'), 'user', id);
    return c.json({ profile: u, sessions, devices, roles, timeZone: env.APP_TIME_ZONE });
});
admin.get('/ensembles/:id', async (c) => { const id = c.req.param('id'); const row = (await pool.query('select id,name,kind,created_at from ensembles where id=$1', [id])).rows[0]; if (!row)
    throw new DomainError('not_found', 404); await adminAudit(c.get('actor'), 'ensemble', id); return c.json({ profile: row, timeZone: env.APP_TIME_ZONE }); });
admin.get('/pieces/:id', async (c) => {
    const id = c.req.param('id'), row = (await pool.query("select id,title,ensemble_id,format,current_version_id,created_at,updated_at,provenance->>'jobId' as transcription_job_id from music_pieces where id=$1", [id])).rows[0];
    if (!row)
        throw new DomainError('not_found', 404);
    await adminAudit(c.get('actor'), 'piece', id);
    return c.json({ profile: row, timeZone: env.APP_TIME_ZONE });
});
admin.get('/pieces/:id/versions', async (c) => { const q = adminQuery.parse(c.req.query()); const rows = (await pool.query('select id,version_no,created_by,format,content_hash,size,created_at from score_versions where piece_id=$1 and ($2::text is null or id>$2) order by id limit $3', [c.req.param('id'), q.cursor ?? null, q.limit + 1])).rows; await adminAudit(c.get('actor'), 'piece', c.req.param('id')); return c.json({ items: rows.slice(0, q.limit), nextCursor: rows.length > q.limit ? rows[q.limit - 1].id : null }); });
admin.get('/pieces/:id/originals', async (c) => { const q = adminQuery.parse(c.req.query()); const rows = (await pool.query(`select distinct o.id,o.original_filename,o.size,o.content_type,o.sha256,o.created_at from music_pieces p join transcription_jobs j on j.id=p.provenance->>'jobId' and j.ensemble_id=p.ensemble_id join job_pages pg on pg.job_id=j.id join stored_objects o on o.id=pg.object_id and o.kind='original' and o.state='ready' where p.id=$1 and ($2::text is null or o.id>$2) order by o.id limit $3`, [c.req.param('id'), q.cursor ?? null, q.limit + 1])).rows; await adminAudit(c.get('actor'), 'piece', c.req.param('id')); return c.json({ items: rows.slice(0, q.limit), nextCursor: rows.length > q.limit ? rows[q.limit - 1].id : null }); });
admin.post('/pieces/:id/content', async (c) => { const input = adminAccess.parse(await c.req.json()); await adminLimit(c.get('actor'), 'content', 10); const row = (await pool.query('select v.format,v.musicxml,v.native_score from music_pieces p join score_versions v on v.id=p.current_version_id and v.piece_id=p.id where p.id=$1', [c.req.param('id')])).rows[0]; if (!row)
    throw new DomainError('not_found', 404); await adminAudit(c.get('actor'), 'piece', c.req.param('id'), 'content', input.reason); return c.json({ format: row.format, body: row.musicxml ?? row.native_score }); });
admin.post('/pieces/:id/originals/:object/download', async (c) => { const input = adminAccess.parse(await c.req.json()); await adminLimit(c.get('actor'), 'content', 10); const row = (await pool.query(`select o.id,o.object_key,o.original_filename from music_pieces p join transcription_jobs j on j.id=p.provenance->>'jobId' and j.ensemble_id=p.ensemble_id join job_pages pg on pg.job_id=j.id join stored_objects o on o.id=pg.object_id where p.id=$1 and o.id=$2 and o.kind='original' and o.state='ready' limit 1`, [c.req.param('id'), c.req.param('object')])).rows[0]; if (!row)
    throw new DomainError('not_found', 404); await adminAudit(c.get('actor'), 'original', row.id, 'download', input.reason); return c.json({ url: await storage().signedGet(row.object_key, 60, row.original_filename ?? 'original'), expiresIn: 60 }); });
admin.get('/transcription/control', async (c) => { const last = (await pool.query("select actor_id,created_at,metadata->>'reason' as reason from audit_events where action='transcription.control' order by created_at desc,id desc limit 1")).rows[0] ?? null; return c.json({ paused: await processingPaused(), last, timeZone: env.APP_TIME_ZONE }); });
admin.put('/transcription/control', async (c) => { const input = adminControl.parse(await c.req.json()); await transaction(async (db) => { await db.query('insert into transcription_control(id,paused) values(1,$1) on conflict(id) do update set paused=$1,updated_at=now()', [input.paused]); await db.query("insert into audit_events(actor_id,action,outcome,metadata) values($1,'transcription.control','ok',$2)", [c.get('actor'), input]); }); return c.json({ paused: await processingPaused() }); });
admin.get('/transcription/usage', async (c) => { try {
    return c.json(await transcriptionUsage(c.req.query('from') ?? '', c.req.query('to') ?? ''));
}
catch (e) {
    if (e instanceof Error && e.message.startsWith('Expected'))
        return c.json({code:'invalid_range',message:e.message},422);
    throw e;
} });
admin.get('/transcription/metrics', async (c) => { const q = adminQuery.parse(c.req.query()); if (!q.from || !q.to)
    throw new DomainError('invalid_range', 422); return c.json(await transcriptionMetrics(new Date(q.from), new Date(q.to))); });
admin.get('/transcription/failures', async (c) => { const q = adminQuery.parse(c.req.query()); if (!q.from || !q.to)
    throw new DomainError('invalid_range', 422); return c.json({ items: (await pool.query("select coalesce(error_kind,'unknown') as reason,count(*)::int as calls from provider_calls where started_at >= $1 and started_at < $2 and outcome='failed' group by error_kind order by calls desc limit 100", [q.from, q.to])).rows }); });
admin.all('*', c => c.json({ code: 'not_found' }, 404));
