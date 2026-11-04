import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { changeAdminRole } from '../scripts/admin-role';
import { adminInstant } from '../src/admin-time';
process.env.NODE_ENV = 'test';
process.env.MAIL_TRANSPORT = 'capture';
process.env.PORT = process.env.TEST_APP_PORT ?? '23001';
process.env.BETTER_AUTH_URL = `http://localhost:${process.env.PORT}`;
process.env.TRUSTED_ORIGINS = process.env.BETTER_AUTH_URL;
process.env.TZ = 'America/New_York';
process.env.APP_TIME_ZONE='Europe/Berlin';
const { server, io } = await import('../server/start');
const { pool } = await import('../server/db/index.server');
const base = process.env.BETTER_AUTH_URL;
after(async () => { await new Promise<void>(r => io.close(() => r())); server.close(); await pool.end(); });
async function req(path: string, cookie = '', method = 'GET', body?: unknown) { return fetch(base + path, { method, headers: { cookie, origin: base, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' }); }
async function json(path: string, cookie = '', method = 'GET', body?: unknown) { const r = await req('/api/admin/' + path, cookie, method, body); assert.equal(r.status, 200, await r.clone().text()); return r.json(); }
async function person(name: string, verified = true) { const email = `admin-${name}-${crypto.randomUUID()}@example.test`, password = 'Test-only-password-3456'; const r = await req('/api/auth/sign-up/email', '', 'POST', { email, password, name }); assert.equal(r.status, 200); const id = (await pool.query('select id from "user" where email=$1', [email])).rows[0].id; if (verified)
    await pool.query('update "user" set email_verified=true where id=$1', [id]); const sign = await req('/api/auth/sign-in/email', '', 'POST', { email, password }); return { id, email, cookie: sign.headers.getSetCookie().map(s => s.split(';')[0]).join('; ') }; }
test('admin: real sessions, every boundary, projection, CLI, audit, pagination and limits', async () => {
    const member = await person('member'), lead = await person('lead'), manager = await person('manager'), sys = await person('sys'), unverified = await person('unverified', false);
    await assert.rejects(changeAdminRole(process.env.DATABASE_URL!, unverified.email, true), /verified/);
    const e = (await (await req('/api/ensembles', lead.cookie, 'POST', { name: 'Admin fixture', kind: 'choir' })).json()).id;
    for (const [u, isLead, manage] of [[member, false, false], [manager, false, true]] as const)
        await pool.query('insert into memberships(ensemble_id,user_id,is_lead,manage_members) values($1,$2,$3,$4)', [e, u.id, isLead, manage]);
    const p = (await pool.query("insert into music_pieces(ensemble_id,title,sort_key,format) values($1,'Admin score','1','musicxml') returning id", [e])).rows[0].id;
    const v = (await pool.query("insert into score_versions(ensemble_id,piece_id,version_no,format,musicxml,content_hash,size) values($1,$2,1,'musicxml','PRIVATE_SCORE_SENTINEL','public-content-digest',22) returning id", [e, p])).rows[0].id;
    await pool.query('update music_pieces set current_version_id=$2 where id=$1', [p, v]);
    await pool.query("insert into audit_events(actor_id,action,target_id,outcome,metadata) values($1,'fixture.user',$1,'ok',$2)", [sys.id, { password: 'PRIVATE_AUDIT_SENTINEL' }]);
    const object = (await pool.query("insert into stored_objects(ensemble_id,user_id,object_key,size,content_type,sha256,provenance,state) values($1,$2,'private-admin-source',12,'application/pdf','public-sha','{}','ready') returning id", [e, sys.id])).rows[0].id;
    const job = (await pool.query("insert into transcription_jobs(ensemble_id,user_id,model,prompt_version) values($1,$2,'fixture','v1') returning id", [e, sys.id])).rows[0].id;
    await pool.query("insert into job_pages(ensemble_id,job_id,object_id,page_number,model,prompt_version) values($1,$2,$3,1,'fixture','v1')", [e, job, object]);
    await pool.query('update music_pieces set provenance=$2 where id=$1', [p, { jobId: job }]);
    const endpoints = ['users', 'users/' + sys.id, 'ensembles', 'ensembles/' + e, 'pieces', 'pieces/' + p, 'pieces/' + p + '/versions', 'pieces/' + p + '/originals', 'memberships', 'invitations', 'audit', 'transcription/jobs', 'transcription/failures?from=2026-01-01T00:00:00Z&to=2026-02-01T00:00:00Z', 'transcription/control', 'transcription/usage?from=2026-01-01T00:00:00Z&to=2026-02-01T00:00:00Z', 'transcription/metrics?from=2026-01-01T00:00:00Z&to=2026-02-01T00:00:00Z'];
    for (const cookie of ['', member.cookie, lead.cookie, manager.cookie]) {
        for (const path of endpoints)
            assert.equal((await req('/api/admin/' + path, cookie)).status, 404, path);
        for (const [path, method, body] of [['pieces/' + p + '/content', 'POST', {}], ['pieces/' + p + '/originals/' + object + '/download', 'POST', {}], ['transcription/control', 'PUT', { paused: true, reason: 'test' }]] as const)
            assert.equal((await req('/api/admin/' + path, cookie, method, body)).status, 404);
        for (const path of ['/admin', '/admin/users', '/admin/unknown'])
            assert.equal((await req(path, cookie)).status, 404, path);
    }
    await changeAdminRole(process.env.DATABASE_URL!, sys.email, true);
    for (const path of endpoints) {
        const value = await json(path, sys.cookie);
        const text = JSON.stringify(value);
        assert.doesNotMatch(text, /PRIVATE_SCORE_SENTINEL|PRIVATE_AUDIT_SENTINEL/);
        function scan(v: any) { if (!v || typeof v !== 'object')
            return; for (const [key, x] of Object.entries(v)) {
            assert.doesNotMatch(key, /password|token_hash|object_key|lease_owner|result_xml|native_score|musicxml|user_agent|ip_address|access_token|refresh_token/i);
            scan(x);
        } }
        scan(value);
    }
    const first = await json('users?limit=1&sort=name', sys.cookie);
    assert.equal(first.items.length, 1);
    assert.ok(first.nextCursor);
    const second = await json('users?limit=1&sort=name&cursor=' + first.nextCursor, sys.cookie);
    assert.notEqual(first.items[0].id, second.items[0].id);
    const found = await json('users?search=' + encodeURIComponent(sys.email), sys.cookie);
    assert.equal(found.items.length, 1);
    assert.equal(found.items[0].id, sys.id);
    assert.equal((await req('/api/admin/users?from=2026-01-01', sys.cookie)).status, 422);
    assert.equal((await req('/api/admin/transcription/control', sys.cookie, 'PUT', { paused: true })).status, 422);
    await json('transcription/control', sys.cookie, 'PUT', { paused: true, reason: 'Local test stop' });
    await json('transcription/control', sys.cookie, 'PUT', { paused: false, reason: 'Local test resume' });
    assert.equal((await json('pieces/' + p + '/content', sys.cookie, 'POST', { reason: 'Support case' })).body, 'PRIVATE_SCORE_SENTINEL');
    const download = await json('pieces/' + p + '/originals/' + object + '/download', sys.cookie, 'POST', {});
    assert.equal(download.expiresIn, 60);
    assert.ok(download.url);
    const events = (await pool.query("select action,metadata from audit_events where actor_id=$1 and action in ('admin.piece.content','admin.original.download')", [sys.id])).rows;
    assert.equal(events.length, 2);
    assert.doesNotMatch(JSON.stringify(events), /PRIVATE_SCORE_SENTINEL|private-admin-source/);
    await changeAdminRole(process.env.DATABASE_URL!, sys.email, false);
    assert.equal((await req('/api/admin/users', sys.cookie)).status, 404);
    await changeAdminRole(process.env.DATABASE_URL!, sys.email, true);
    assert.equal((await req('/api/admin/users', sys.cookie)).status, 200);
    await pool.query("insert into rate_limit(key,count,last_request) values($1,120,$2) on conflict(key) do update set count=120,last_request=$2", ['admin:read:' + sys.id, Date.now()]);
    assert.equal((await req('/api/admin/users', sys.cookie)).status, 429);
    await pool.query('delete from rate_limit where key=$1', ['admin:read:' + sys.id]);
    await pool.query("insert into rate_limit(key,count,last_request) values($1,10,$2) on conflict(key) do update set count=10,last_request=$2", ['admin:content:' + sys.id, Date.now()]);
    assert.equal((await req('/api/admin/pieces/' + p + '/content', sys.cookie, 'POST', {})).status, 429);
});
test('admin time displays explicit offset through DST independently of process zone', () => { assert.match(adminInstant('2026-03-29T00:30:00Z', 'Europe/Berlin'), /GMT\+01:00/); assert.match(adminInstant('2026-03-29T01:30:00Z', 'Europe/Berlin'), /GMT\+02:00/); assert.match(adminInstant('2026-10-25T00:30:00Z', 'Europe/Berlin'), /GMT\+02:00/); assert.match(adminInstant('2026-10-25T01:30:00Z', 'Europe/Berlin'), /GMT\+01:00/); assert.throws(() => adminInstant('2026-01-01T00:00:00', 'Europe/Berlin')); });
