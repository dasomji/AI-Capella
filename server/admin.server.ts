import { Hono,type Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import {calendarRange,calendarInstant} from '../src/admin-time';
import { offsetInstant } from './time.server';
import { z } from 'zod';
import { pool } from './db/index.server';
import { adminSession } from './admin-auth.server';
import { DomainError, transaction } from './domain.server';
import { adminQuery, adminAccess, adminControl, safeAdminText } from '../src/api/admin';
import { transcriptionUsage, usageSQL } from './usage.server';
import { processingPaused } from './transcription.server';
import { storage } from './storage.server';
import { env } from './env.server';
import { logError } from './logger.server';
function numericRow(row:Record<string,any>){return Object.fromEntries(Object.entries(row).map(([k,v])=>[k,v!==null&&['calls','pages','jobs','attempts','latency','estimated_cost','input_tokens','output_tokens','known_cost_usd','estimated_cost_usd','estimated_cost_per_page_usd','estimated_cost_per_job_usd'].includes(k)?Number(v):v]));}
/** Only actual database Date values are formatted; score bodies remain opaque. */
function adminJSON(c:Context,data:any,status:ContentfulStatusCode=200){
 const convert=(value:any):any=>value instanceof Date?offsetInstant(value):Array.isArray(value)?value.map(convert):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,k==='body'?v:convert(v)])):value;
 const body=convert(data);c.header('X-Display-Time-Zone',env.APP_TIME_ZONE);
 return c.json(body&&typeof body==='object'&&!Array.isArray(body)?{...body,timeZone:env.APP_TIME_ZONE}:body,status);
}
export const admin = new Hono<{
    Variables: {
        actor: string;
    };
}>();
admin.onError((e, c) => { if (e instanceof DomainError)
    return adminJSON(c, { code: e.code, message: e.code==='rate_limited' ? e.message : undefined }, e.status as 400); if (e instanceof z.ZodError || e instanceof SyntaxError || (typeof (e as any)?.code==='string' && (e as any).code.startsWith('22')))
    return adminJSON(c, { code: 'invalid_input', message: 'Use bounded filters and ISO instants with offset or Z.' }, 422); logError('admin.http', e); return adminJSON(c, { code: 'service_unavailable' }, 500); });
export async function adminLimit(actor: string, kind = 'read', max = 120, windowMs = 60000) {
    const r = await pool.query(`insert into rate_limit(key,count,last_request) values($1,1,$2) on conflict(key) do update set count=case when rate_limit.last_request<=$2-$3 then 1 else rate_limit.count+1 end,last_request=case when rate_limit.last_request<=$2-$3 then $2 else rate_limit.last_request end returning count`, ['admin:' + kind + ':' + actor, Date.now(),windowMs]);
    if (r.rows[0].count > max) {
        console.warn(JSON.stringify({timestamp:new Date().toISOString(),level:'warn',event:'admin.cap_hit',actor,kind,max,windowMs}));
        const error=new DomainError('rate_limited',429);error.message=`Admin ${kind} limit reached (${max} per ${windowMs/60000} minutes). Please wait before trying again.`;throw error;
    }
}
admin.use('*', async (c, next) => { c.header('Cache-Control', 'no-store'); const s = await adminSession(c.req.raw.headers); if (!s)
    return adminJSON(c, { code: 'not_found' }, 404); for(const v of Object.values(c.req.param()))safeAdminText.max(200).parse(v); c.set('actor', s.user.id); await adminLimit(s.user.id); await next(); if(['GET','HEAD'].includes(c.req.method) && c.res.status===200 && /\/transcription\/(control|metrics|failures)$/.test(c.req.path)){const data=await c.res.clone().json();await listAudit(c,c.req.path.split('/').at(-1)!,Array.isArray(data)?data.length:data.items?.length??1);} });
export async function adminAudit(actor: string, type: string, target: string, action = 'detail', reason = '') {
    await pool.query("insert into audit_events(actor_id,action,target_id,ensemble_id,outcome,metadata) values($1,$2,$3,case when $5='ensemble' then (select id from ensembles where id=$3) when $5='piece' then (select ensemble_id from music_pieces where id=$3) when $5='original' then (select ensemble_id from stored_objects where id=$3) end,'ok',$4)", [actor, 'admin.' + type + '.' + action, target, { targetType: type, reason },type]);
}
async function listAudit(c:Context,kind:string,count:number){
 const query=adminQuery.parse(c.req.query());const raw=c.req.query();const ids=Object.fromEntries(Object.entries(raw).filter(([k])=>['ensemble','user','actor','target'].includes(k)));
 await pool.query("insert into audit_events(actor_id,ensemble_id,action,outcome,metadata) values($1,coalesce((select id from ensembles where id=$2),(select ensemble_id from music_pieces where id=$5)),$3,'ok',$4)",[c.get('actor'),query.ensemble??null,'admin.'+kind+'.list',{endpoint:c.req.path,filterKeys:Object.keys(raw).sort(),ids,resultCount:count},c.req.param('id')??null]);
}
async function statsRange(c:Context){const q=adminQuery.parse(c.req.query()),days=calendarRange(env.APP_TIME_ZONE);return {...q,from:q.from??(q.all==='true'?'1970-01-01T00:00:00Z':calendarInstant(days.from,env.APP_TIME_ZONE)),to:q.to??calendarInstant(days.to,env.APP_TIME_ZONE)};}
async function contentLimit(actor:string){await adminLimit(actor,'content',10);await adminLimit(actor,'content-hour',30,3600000);await adminLimit(actor,'content-day',200,86400000);}
const memberFields = 'm.id,m.user_id,m.ensemble_id,e.name as ensemble_name,u.name,u.email,m.is_lead,m.manage_members,m.edit_music_pieces,m.ai_transcription,m.created_at';
const sources = {
    users: { table: '"user" t', fields: `t.id,t.name,t.email,t.email_verified,t.created_at,exists(select 1 from platform_roles r where r.user_id=t.id) as sysadmin`, search: 't.email || \' \' || t.name', name: 't.name', date: 't.created_at' },
    ensembles: { table: 'ensembles t', fields: `t.id,t.name,t.kind,t.created_at,(select count(*)::int from memberships m where m.ensemble_id=t.id) as members,(select count(*)::int from memberships m where m.ensemble_id=t.id and m.is_lead) as leads,(select count(*)::int from music_pieces p where p.ensemble_id=t.id) as pieces,(select count(*)::int from invitations i where i.ensemble_id=t.id and i.state='pending' and i.expires_at>now()) as pending_invitations,(select coalesce(sum(size),0)::float8 from stored_objects o where o.ensemble_id=t.id and o.kind='original' and o.state='ready') as storage_bytes`, search: 't.name', name: 't.name', date: 't.created_at' },
    pieces: { table: 'music_pieces t', fields: `t.id,t.title,t.ensemble_id,t.format,t.created_at,t.updated_at,(select size::float8 from score_versions v where v.id=t.current_version_id) as size,(select count(*)::int from score_versions v where v.piece_id=t.id) as versions`, search: 't.title', name: 't.title', date: 't.created_at' },
    jobs: { table: 'transcription_jobs t', fields: 't.id,t.ensemble_id,t.user_id,t.state,t.failure_reason,t.attempts,t.model,t.prompt_version,t.imported_piece_id,t.created_at,t.updated_at', search: 't.id', name: 't.id', date: 't.created_at' },
    audit: { table: 'audit_events t', fields: 't.id,t.actor_id,t.ensemble_id,t.action,t.target_id,t.outcome,t.created_at,case when t.action like \'admin.%\' then left(t.metadata->>\'reason\',160) end as reason_excerpt', search: 't.action', name: 't.action', date: 't.created_at' },
    memberships: { table: 'memberships m join ensembles e on e.id=m.ensemble_id join "user" u on u.id=m.user_id', fields: memberFields, search: 'u.email', name: 'u.name', date: 'm.created_at' },
    invitations: { table: 'invitations t', fields: "t.id,t.ensemble_id,t.email,t.inviter_id,case when t.state='pending' and t.expires_at<=now() then 'expired' else t.state end as state,t.expires_at,t.created_at,t.manage_members,t.edit_music_pieces,t.ai_transcription", search: 't.email', name: 't.email', date: 't.created_at' },
} as const;
for (const kind of Object.keys(sources) as (keyof typeof sources)[])
    admin.get('/' + (kind === 'jobs' ? 'transcription/jobs' : kind), async (c) => {
        await adminLimit(c.get('actor'),'list:'+kind,30);
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
        const order = q.sort === 'updated' && kind === 'pieces' ? 't.updated_at' : q.sort === 'created' ? s.date : q.sort === 'name' ? s.name : alias + '.id', dir = q.direction === 'asc' ? 'asc' : 'desc';
        if (q.cursor) {
            let cursor;
            try {
                cursor = z.tuple([(q.sort === 'created' || (q.sort==='updated' && kind==='pieces')) ? safeAdminText.regex(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}(?::?\d{2})?)$/).refine(v=>Number.isFinite(Date.parse(v))) : safeAdminText.max(200), safeAdminText.min(1).max(200)]).parse(JSON.parse(Buffer.from(q.cursor, 'base64url').toString()));
            }
            catch {
                throw new DomainError('invalid_cursor', 422);
            }
            where.push(`(${order},${alias}.id) ${dir === 'asc' ? '>' : '<'} (${bind(cursor[0])},${bind(cursor[1])})`);
        }
        const rows = (await pool.query(`select ${s.fields},(${order})::text as _cursor from ${s.table} ${where.length ? 'where ' + where.join(' and ') : ''} order by ${order} ${dir},${alias}.id ${dir} limit ${bind(q.limit + 1)}`, values)).rows;
        const more = rows.length > q.limit;
        const items = rows.slice(0, q.limit), last = items.at(-1);
        const cursor = more && last ? Buffer.from(JSON.stringify([last._cursor instanceof Date ? last._cursor.toISOString() : String(last._cursor), last.id])).toString('base64url') : null;
        for (const row of items)
            delete row._cursor;
        await listAudit(c,kind,items.length);
        return adminJSON(c, { items, nextCursor: cursor, timeZone: env.APP_TIME_ZONE });
    });
/** Initial detail sections share one HTTP request; every collection remains bounded. */
async function detailSections(type:string,id:string){
 const definitions:Record<string,[string,unknown[]]>={};
 if(type==='users'||type==='ensembles')definitions.memberships=[`select ${memberFields} from ${sources.memberships.table} where m.${type==='users'?'user_id':'ensemble_id'}=$1 order by m.id limit 31`,[id]];
 if(type==='ensembles')for(const kind of ['invitations','pieces','jobs'] as const){const source=sources[kind];definitions[kind]=[`select ${source.fields} from ${source.table} where t.ensemble_id=$1 order by t.id limit 31`,[id]];}
 if(type==='pieces'){
 definitions.versions=['select id,version_no,created_by,format,content_hash,size::float8 as size,created_at from score_versions where piece_id=$1 order by version_no desc,id limit 31',[id]];
 definitions.originals=[`select distinct o.id,o.original_filename,o.size::float8 as size,o.content_type,o.sha256,o.created_at from music_pieces p join transcription_jobs j on j.id=p.provenance->>'jobId' and j.ensemble_id=p.ensemble_id join job_pages pg on pg.job_id=j.id join stored_objects o on o.id=pg.object_id and o.kind='original' and o.state='ready' where p.id=$1 order by o.id limit 31`,[id]];
 }
 definitions.audit=[`select ${sources.audit.fields},t.created_at::text as _cursor from audit_events t where ${type==='users'?'(t.actor_id=$1 or t.target_id=$1)':type==='ensembles'?'t.ensemble_id=$1':'t.target_id=$1'} order by t.created_at desc,t.id desc limit 31`,[id]];
 return Object.fromEntries(await Promise.all(Object.entries(definitions).map(async([kind,[sql,params]])=>{
 const rows=(await pool.query(sql,params)).rows,items=rows.slice(0,30),last=items.at(-1);
 // Audit's timestamp cursor must retain PostgreSQL precision; defer its continuation to the standalone list.
 const cursor=rows.length>30?(kind==='versions'?Buffer.from(JSON.stringify([last.version_no,last.id])).toString('base64url'):kind==='originals'?last.id:kind==='audit'?Buffer.from(JSON.stringify([last._cursor,last.id])).toString('base64url'):Buffer.from(JSON.stringify([last.id,last.id])).toString('base64url')):null;
 for(const row of items)delete row._cursor;return [kind,{items,nextCursor:cursor}];
 })));
}
admin.get('/users/:id', async (c) => {
    const id = c.req.param('id');
    const u = (await pool.query('select id,name,email,email_verified,language,created_at from "user" where id=$1', [id])).rows[0];
    if (!u)
        throw new DomainError('not_found', 404);
    const sessions = (await pool.query(`select count(*)::int as count,max(updated_at) as last_active,max(created_at) as last_sign_in from session where user_id=$1 and expires_at>now()`, [id])).rows[0];
    const devices = (await pool.query(`select case when user_agent ~* 'mobile|android|iphone|ipad' then 'Mobile' else 'Desktop / other' end as device,count(*)::int as count,max(updated_at) as last_active from session where user_id=$1 and expires_at>now() group by 1`, [id])).rows;
    const roles = (await pool.query('select role,created_at from platform_roles where user_id=$1', [id])).rows;
    await adminAudit(c.get('actor'), 'user', id);
    return adminJSON(c, { profile: u, sessions, devices, roles, sections:await detailSections('users',id), timeZone: env.APP_TIME_ZONE });
});
admin.get('/ensembles/:id', async (c) => { const id = c.req.param('id'); const row = (await pool.query('select id,name,kind,created_at from ensembles where id=$1', [id])).rows[0]; if (!row)
    throw new DomainError('not_found', 404); await adminAudit(c.get('actor'), 'ensemble', id); return adminJSON(c, { profile: row, sections:await detailSections(c.req.path.includes('/ensembles/')?'ensembles':'pieces',id), timeZone: env.APP_TIME_ZONE }); });
admin.get('/pieces/:id', async (c) => {
    const id = c.req.param('id'), row = (await pool.query("select id,title,ensemble_id,format,current_version_id,created_at,updated_at,provenance->>'jobId' as transcription_job_id from music_pieces where id=$1", [id])).rows[0];
    if (!row)
        throw new DomainError('not_found', 404);
    await adminAudit(c.get('actor'), 'piece', id);
    return adminJSON(c, { profile: row, sections:await detailSections(c.req.path.includes('/ensembles/')?'ensembles':'pieces',id), timeZone: env.APP_TIME_ZONE });
});
admin.get('/pieces/:id/versions', async c=>{
 await adminLimit(c.get('actor'),'list:versions',30);
 const q=adminQuery.parse(c.req.query());let cursor:[number,string]|null=null;
 if(q.cursor){try{cursor=z.tuple([z.number().int().positive(),safeAdminText.min(1).max(200)]).parse(JSON.parse(Buffer.from(q.cursor,'base64url').toString()));}catch{throw new DomainError('invalid_cursor',422);}}
 const rows=(await pool.query('select id,version_no,created_by,format,content_hash,size::float8 as size,created_at from score_versions where piece_id=$1 and ($2::int is null or version_no<$2 or (version_no=$2 and id>$3)) order by version_no desc,id asc limit $4',[c.req.param('id'),cursor?.[0]??null,cursor?.[1]??null,q.limit+1])).rows;
 const items=rows.slice(0,q.limit),last=items.at(-1);await listAudit(c,'versions',items.length);
 return adminJSON(c,{items,nextCursor:rows.length>q.limit?Buffer.from(JSON.stringify([last.version_no,last.id])).toString('base64url'):null});
});
admin.get('/pieces/:id/originals', async (c) => { await adminLimit(c.get('actor'),'list:originals',30); const q = adminQuery.parse(c.req.query()); const rows = (await pool.query(`select distinct o.id,o.original_filename,o.size::float8 as size,o.content_type,o.sha256,o.created_at from music_pieces p join transcription_jobs j on j.id=p.provenance->>'jobId' and j.ensemble_id=p.ensemble_id join job_pages pg on pg.job_id=j.id join stored_objects o on o.id=pg.object_id and o.kind='original' and o.state='ready' where p.id=$1 and ($2::text is null or o.id>$2) order by o.id limit $3`, [c.req.param('id'), q.cursor ?? null, q.limit + 1])).rows; await listAudit(c,'originals',Math.min(rows.length,q.limit)); return adminJSON(c, { items: rows.slice(0, q.limit), nextCursor: rows.length > q.limit ? rows[q.limit - 1].id : null }); });
admin.post('/pieces/:id/content', async (c) => { const input = adminAccess.parse(await c.req.json()); await contentLimit(c.get('actor')); const row = (await pool.query('select v.format,v.musicxml,v.native_score from music_pieces p join score_versions v on v.id=p.current_version_id and v.piece_id=p.id where p.id=$1', [c.req.param('id')])).rows[0]; if (!row)
    throw new DomainError('not_found', 404); await adminAudit(c.get('actor'), 'piece', c.req.param('id'), 'content', input.reason); return adminJSON(c, { format: row.format, body: row.musicxml ?? row.native_score }); });
admin.post('/pieces/:id/originals/:object/download', async (c) => { const input = adminAccess.parse(await c.req.json()); await contentLimit(c.get('actor')); const row = (await pool.query(`select o.id,o.object_key,o.original_filename from music_pieces p join transcription_jobs j on j.id=p.provenance->>'jobId' and j.ensemble_id=p.ensemble_id join job_pages pg on pg.job_id=j.id join stored_objects o on o.id=pg.object_id where p.id=$1 and o.id=$2 and o.kind='original' and o.state='ready' limit 1`, [c.req.param('id'), c.req.param('object')])).rows[0]; if (!row)
    throw new DomainError('not_found', 404); await adminAudit(c.get('actor'), 'original', row.id, 'download', input.reason); return adminJSON(c, { url: await storage().signedGet(row.object_key, 60, row.original_filename ?? 'original'), expiresIn: 60 }); });
admin.get('/transcription/control', async (c) => { const last = (await pool.query("select actor_id,(select name from \"user\" where id=actor_id) as actor_name,created_at,metadata->>'reason' as reason from audit_events where action='transcription.control' order by created_at desc,id desc limit 1")).rows[0] ?? null; return adminJSON(c, { paused: await processingPaused(), last, timeZone: env.APP_TIME_ZONE }); });
admin.put('/transcription/control', async (c) => { const input = adminControl.parse(await c.req.json()); await transaction(async (db) => { await db.query('insert into transcription_control(id,paused) values(1,$1) on conflict(id) do update set paused=$1,updated_at=now()', [input.paused]); await db.query("insert into audit_events(actor_id,action,outcome,metadata) values($1,'transcription.control','ok',$2)", [c.get('actor'), input]); }); return adminJSON(c, { paused: await processingPaused() }); });
admin.get('/transcription/usage', async (c) => { try {
    const q=await statsRange(c);const data=q.all==='true'?{groups:(await pool.query(usageSQL,[q.from,q.to,env.APP_TIME_ZONE])).rows.map(numericRow)}:await transcriptionUsage(q.from,q.to);if(q.ensemble)data.groups=data.groups.filter(r=>r.ensemble_id===q.ensemble);await listAudit(c,'usage',data.groups.length);return adminJSON(c,data);
}
catch (e) {
    if (e instanceof Error && e.message.startsWith('Expected'))
        return adminJSON(c, {code:'invalid_range',message:e.message},422);
    throw e;
} });
admin.get('/transcription/metrics',async c=>{const q=await statsRange(c);const rows=(await pool.query(`select c.model,c.prompt_version,c.outcome as state,count(*)::int as attempts,sum(extract(epoch from(c.finished_at-c.started_at))*1000) as latency,sum(c.estimated_cost::text::numeric) as estimated_cost,sum((c.usage->>'inputTokens')::numeric) as input_tokens,sum((c.usage->>'outputTokens')::numeric) as output_tokens from provider_calls c join transcription_jobs j on j.id=c.job_id where c.started_at >= $1 and c.started_at < $2 and ($3::text is null or j.ensemble_id=$3) group by c.model,c.prompt_version,c.outcome`,[q.from,q.to,q.ensemble??null])).rows;return adminJSON(c,rows.map(numericRow));});
admin.get('/transcription/failures',async c=>{const q=await statsRange(c);return adminJSON(c,{items:(await pool.query("select coalesce(c.error_kind,'unknown') as reason,count(*)::int as calls from provider_calls c join transcription_jobs j on j.id=c.job_id where c.started_at >= $1 and c.started_at < $2 and ($3::text is null or j.ensemble_id=$3) and c.outcome='failed' group by c.error_kind order by calls desc limit 100",[q.from,q.to,q.ensemble??null])).rows});});
admin.all('*', c => adminJSON(c, { code: 'not_found' }, 404));
