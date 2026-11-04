import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { changeAdminRole } from '../scripts/admin-role';
import { adminInstant,calendarInstant,calendarRange } from '../src/admin-time';
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
    await pool.query("update session set user_agent='PRIVATE_DEVICE_SENTINEL',ip_address='PRIVATE_IP_SENTINEL' where user_id=$1",[sys.id]);
    await pool.query("insert into invitations(ensemble_id,email,inviter_id,token_hash,expires_at) values($1,'admin-invite@example.test',$2,'PRIVATE_INVITATION_HASH_SENTINEL',now()+interval '1 day')",[e,lead.id]);
    const sensitive=(await pool.query('select password as value from account where user_id=$1 union all select token as value from session where user_id=$1',[sys.id])).rows.map(r=>r.value).filter(Boolean);
    const {admin}=await import('../server/admin.server');
    const {api}=await import('../server/http.server');
    const routes=api.routes.filter(r=>r.path.toLowerCase().startsWith('/api/admin')&&!r.path.includes('*'));
    assert.equal(routes.length,admin.routes.filter(r=>!r.path.includes('*')).length,'Admin routes must be mounted exclusively through guarded router');
    const guardedRoutes=admin.routes.filter(r=>!r.path.includes('*'));
    for(const cookie of ['',member.cookie,lead.cookie,manager.cookie]) for(const route of guardedRoutes) {
      const path='/api/admin'+route.path.replace(':id',p).replace(':object',object);
      for(const variant of [path,path.toUpperCase(),path.replace('/admin','/%61dmin'),path.replace('/admin','/admin%20')]) for(const method of new Set([route.method,'HEAD','OPTIONS']))
        assert.equal((await req(variant,cookie,method)).status,404,method+' '+variant);
    }
    const endpoints = ['users', 'users/' + sys.id, 'ensembles', 'ensembles/' + e, 'pieces', 'pieces/' + p, 'pieces/' + p + '/versions', 'pieces/' + p + '/originals', 'memberships', 'invitations', 'audit', 'transcription/jobs', 'transcription/failures?from=2026-01-01T00:00:00Z&to=2026-02-01T00:00:00Z', 'transcription/control', 'transcription/usage?from=2026-01-01T00:00:00Z&to=2026-02-01T00:00:00Z', 'transcription/metrics?from=2026-01-01T00:00:00Z&to=2026-02-01T00:00:00Z'];
    for (const cookie of ['', member.cookie, lead.cookie, manager.cookie]) {
        for (const path of endpoints)
            assert.equal((await req('/api/admin/' + path, cookie)).status, 404, path);
        for (const [path, method, body] of [['pieces/' + p + '/content', 'POST', {}], ['pieces/' + p + '/originals/' + object + '/download', 'POST', {}], ['transcription/control', 'PUT', { paused: true, reason: 'test' }]] as const)
            assert.equal((await req('/api/admin/' + path, cookie, method, body)).status, 404);
        for(const path of ['/admin','/admin/users','/admin/ensembles','/admin/pieces','/admin/audit','/admin/transcription','/admin/unknown'])for(const variant of [path,path.toUpperCase(),path.replace('/admin','/%61dmin'),path.replace('/admin','/admin%20')])for(const method of ['GET','HEAD','OPTIONS'])
            assert.equal((await req(variant,cookie,method)).status,404,method+' '+variant);
    }
    assert.equal((await fetch(base+'/api/admin/transcription/control',{method:'PUT',body:'invalid-json'})).status,404);
    await changeAdminRole(process.env.DATABASE_URL!, sys.email, true);
    for (const path of endpoints) {
        const value = await json(path, sys.cookie);
        const text = JSON.stringify(value);
        assert.doesNotMatch(text, /PRIVATE_SCORE_SENTINEL|PRIVATE_AUDIT_SENTINEL|PRIVATE_DEVICE_SENTINEL|PRIVATE_IP_SENTINEL|PRIVATE_INVITATION_HASH_SENTINEL/);
        for(const secret of sensitive)assert.ok(!text.includes(secret),'An admin projection leaked a fixture credential');
        function scan(v: any) { if (!v || typeof v !== 'object')
            return; for (const [key, x] of Object.entries(v)) {
            assert.doesNotMatch(key, /password|token_hash|object_key|lease_owner|result_xml|native_score|musicxml|user_agent|ip_address|access_token|refresh_token/i);
            scan(x);
        } }
        scan(value);
    }
    for(const kind of ['users','ensembles','pieces','memberships','invitations','audit','transcription/jobs']){
      const before=Number((await pool.query("select count(*) from audit_events where actor_id=$1 and metadata->>'endpoint'=$2",[sys.id,'/api/admin/'+kind])).rows[0].count);
      await json(kind+'?search=DO_NOT_LOG_SEARCH',sys.cookie);
      const events=(await pool.query("select metadata from audit_events where actor_id=$1 and metadata->>'endpoint'=$2",[sys.id,'/api/admin/'+kind])).rows;
      assert.equal(events.length,before+1);assert.doesNotMatch(JSON.stringify(events),/DO_NOT_LOG_SEARCH/);assert.equal(typeof events.at(-1).metadata.resultCount,'number');
    }
    for(const query of ['sort=created&cursor='+Buffer.from(JSON.stringify(['2026-02-30 00:00:00+00',sys.id])).toString('base64url'),'search=%00','ensemble=%00','user=%00','sort=created&cursor='+Buffer.from(JSON.stringify(['oops',sys.id])).toString('base64url'),'sort=created&cursor='+Buffer.from(JSON.stringify(['2026-99-99 00:00:00+00',sys.id])).toString('base64url')])assert.equal((await req('/api/admin/users?'+query,sys.cookie)).status,422,query);
    for(const reason of ['', '\0','\ud800'])assert.equal((await req('/api/admin/pieces/'+p+'/content',sys.cookie,'POST',{reason})).status,422);
    assert.equal((await req('/api/admin/users/%00',sys.cookie)).status,422);
    const bundled=await json('pieces/'+p,sys.cookie);assert.ok(bundled.sections.versions.items.length);assert.ok(bundled.sections.audit);
    await pool.query("insert into score_versions(id,ensemble_id,piece_id,version_no,format,musicxml,content_hash,size) values('zzzzzz-newest',$1,$2,2,'musicxml','fixture','hash',7)",[e,p]);
    const newest=await json('pieces/'+p+'/versions?limit=1',sys.cookie);assert.equal(newest.items[0].version_no,2);assert.equal(typeof newest.items[0].size,'number');
    const older=await json('pieces/'+p+'/versions?limit=1&cursor='+newest.nextCursor,sys.cookie);assert.equal(older.items[0].version_no,1);
    await pool.query("update music_pieces set created_at='2026-01-01T00:00:00Z',updated_at='2026-04-01T00:00:00Z' where id=$1",[p]);
    const newer=(await pool.query("insert into music_pieces(ensemble_id,title,sort_key,format,created_at,updated_at) values($1,'Sort fixture','2','musicxml','2026-03-01T00:00:00Z','2026-02-01T00:00:00Z') returning id",[e])).rows[0].id;
    assert.equal((await json('pieces?ensemble='+e+'&sort=created&direction=desc',sys.cookie)).items[0].id,newer);
    assert.equal((await json('pieces?ensemble='+e+'&sort=updated&direction=desc',sys.cookie)).items[0].id,p);
    assert.ok((await pool.query("select 1 from audit_events where actor_id=$1 and action='admin.memberships.list'",[sys.id])).rowCount);
    const first = await json('users?limit=1&sort=name', sys.cookie);
    assert.equal(first.items.length, 1);
    assert.ok(first.nextCursor);
    const second = await json('users?limit=1&sort=name&cursor=' + first.nextCursor, sys.cookie);
    assert.notEqual(first.items[0].id, second.items[0].id);
    const found = await json('users?search=' + encodeURIComponent(sys.email), sys.cookie);
    assert.equal(found.items.length, 1);
    assert.equal(found.items[0].id, sys.id);
    assert.equal(found.timeZone,'Europe/Berlin');
    assert.match(found.items[0].created_at,/[+]0[12]:00$/);
    for(const [i,u] of [member,lead,manager].entries())await pool.query('update "user" set created_at=$2::timestamptz where id=$1',[u.id,`2026-03-29T00:30:00.00000${i+1}Z`]);
    const precise='users?sort=created&limit=1&from=2026-03-29T00:30:00Z&to=2026-03-29T00:30:00.001Z';
    const a=await json(precise,sys.cookie),b=await json(precise+'&cursor='+a.nextCursor,sys.cookie),c=await json(precise+'&cursor='+b.nextCursor,sys.cookie);
    assert.deepEqual([a.items[0].id,b.items[0].id,c.items[0].id],[member.id,lead.id,manager.id]);assert.equal(c.nextCursor,null);
    assert.equal((await req('/api/admin/users?limit=101',sys.cookie)).status,422);

    assert.equal((await req('/api/admin/users?from=2026-01-01', sys.cookie)).status, 422);
    assert.equal((await req('/api/admin/transcription/control', sys.cookie, 'PUT', { paused: true })).status, 422);
    await json('transcription/control', sys.cookie, 'PUT', { paused: true, reason: 'Local test stop' });
    await json('transcription/control', sys.cookie, 'PUT', { paused: false, reason: 'Local test resume' });
    assert.equal((await json('pieces/' + p + '/content', sys.cookie, 'POST', { reason: 'Support case' })).body, 'PRIVATE_SCORE_SENTINEL');
    const download = await json('pieces/' + p + '/originals/' + object + '/download', sys.cookie, 'POST', {reason:'Support download'});
    assert.equal(download.expiresIn, 60);
    assert.ok(download.url);
    const events = (await pool.query("select action,metadata from audit_events where actor_id=$1 and action in ('admin.piece.content','admin.original.download')", [sys.id])).rows;
    assert.equal(events.length, 2);
    assert.doesNotMatch(JSON.stringify(events), /PRIVATE_SCORE_SENTINEL|private-admin-source/);
    assert.ok((await pool.query("select 1 from audit_events where actor_id=$1 and action='admin.piece.content' and ensemble_id=$2",[sys.id,e])).rowCount);
    await changeAdminRole(process.env.DATABASE_URL!, sys.email, false);
    assert.equal((await req('/api/admin/users', sys.cookie)).status, 404);
    await changeAdminRole(process.env.DATABASE_URL!, sys.email, true);
    assert.equal((await req('/api/admin/users', sys.cookie)).status, 200);
    await pool.query('delete from rate_limit where key like $1',['admin:list:%:'+sys.id]);
    await pool.query("insert into rate_limit(key,count,last_request) values($1,120,$2) on conflict(key) do update set count=120,last_request=$2", ['admin:read:' + sys.id, Date.now()]);
    assert.equal((await req('/api/admin/users', sys.cookie)).status, 429);
    await pool.query('delete from rate_limit where key=$1', ['admin:read:' + sys.id]);
    await pool.query("insert into rate_limit(key,count,last_request) values($1,10,$2) on conflict(key) do update set count=10,last_request=$2", ['admin:content:' + sys.id, Date.now()]);
    assert.equal((await req('/api/admin/pieces/' + p + '/content', sys.cookie, 'POST', {reason:'Limit test'})).status, 429);
    for(const [kind,count] of [['content-hour',30],['content-day',200]] as const){
      await pool.query('delete from rate_limit where key like $1',['admin:content%:'+sys.id]);
      await pool.query('insert into rate_limit(key,count,last_request) values($1,$2,$3)',['admin:'+kind+':'+sys.id,count,Date.now()]);
      const r=await req('/api/admin/pieces/'+p+'/content',sys.cookie,'POST',{reason:'Cap test'});assert.equal(r.status,429);assert.match((await r.json()).message,new RegExp(kind));
    }
    await pool.query('delete from rate_limit where key like $1',['admin:%:'+sys.id]);
    for(let i=0;i<30;i++)await json('users',sys.cookie);assert.equal((await req('/api/admin/users',sys.cookie)).status,429);
    await changeAdminRole(process.env.DATABASE_URL!, sys.email, true);
    const cli=(await pool.query("select metadata from audit_events where action='admin.user.grant' and target_id=$1 order by created_at desc limit 1",[sys.id])).rows[0].metadata;assert.equal(cli.changed,false);assert.ok(cli.operator);assert.ok(cli.hostname);

});
test('admin time displays explicit offset through DST independently of process zone', async () => {
 const {offsetInstant}=await import('../server/time.server');
 assert.equal(offsetInstant(new Date('2026-03-28T23:30:00Z')),'2026-03-29T00:30:00.000+01:00');
 assert.equal(offsetInstant(new Date('2026-03-29T01:30:00Z')),'2026-03-29T03:30:00.000+02:00');
 assert.equal(offsetInstant(new Date('2026-10-25T01:30:00Z')),'2026-10-25T02:30:00.000+01:00');
 assert.match(adminInstant('2026-03-29T00:30:00Z', 'Europe/Berlin'), /(?:UTC\+1|CET)/); assert.match(adminInstant('2026-03-29T01:30:00Z', 'Europe/Berlin'), /(?:UTC\+2|CEST)/); assert.match(adminInstant('2026-10-25T00:30:00Z', 'Europe/Berlin'), /(?:UTC\+2|CEST)/); assert.match(adminInstant('2026-10-25T01:30:00Z', 'Europe/Berlin'), /(?:UTC\+1|CET)/); assert.throws(() => adminInstant('2026-01-01T00:00:00', 'Europe/Berlin')); });

test('calendar boundaries span Berlin DST and use seven calendar days',()=>{
 assert.equal(calendarInstant('2026-03-29','Europe/Berlin'),'2026-03-28T23:00:00.000Z');
 assert.equal(calendarInstant('2026-03-30','Europe/Berlin'),'2026-03-29T22:00:00.000Z');
 assert.equal(calendarInstant('2026-10-26','Europe/Berlin'),'2026-10-25T23:00:00.000Z');
 assert.deepEqual(calendarRange('Europe/Berlin',7,new Date('2026-03-29T23:30:00Z')),{from:'2026-03-24',to:'2026-03-31'});
 assert.match(adminInstant('2026-11-04T05:58:00Z','Asia/Kolkata','en'),/[+]05:30$/);
 assert.equal(adminInstant('2026-11-04T05:58:00Z','UTC','de'),'04.11.2026, 05:58 UTC');
 assert.equal(adminInstant('2026-11-04T05:58:00Z','UTC','en'),'4 Nov 2026, 05:58 UTC');
});

test('CLI preserves original errors when rollback itself fails',async()=>{
 const pg=(await import('pg')).default;const query=pg.Client.prototype.query;
 pg.Client.prototype.query=function(this:InstanceType<typeof pg.Client>,...args:any[]){if(args[0]==='rollback')return Promise.reject(Error('rollback failure')) as any;return (query as any).apply(this,args);} as any;
 try{await assert.rejects(changeAdminRole(process.env.DATABASE_URL!,'missing-account@example.test',true),/verified account/);}finally{pg.Client.prototype.query=query;}
});
