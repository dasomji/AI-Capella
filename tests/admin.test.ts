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
test('admin: real sessions, every boundary, projection, CLI, audit, pagination and limits', async t => {
    const stdout = t.mock.method(console, 'log', () => {});
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
    // Hono wraps mounted handlers for onError; compare the full method/path multiset,
    // including wildcard registrations, rather than function identity.
    const actual=api.routes.filter(r=>/^\/api\/admin(?:\/|$)/i.test(r.path)).map(r=>r.method+' '+r.path).sort();
    const expected=[...admin.routes.map(r=>r.method+' /api/admin'+(r.path==='*'?'/*':r.path)),'ALL /api/admin/*'].sort();
    assert.deepEqual(actual,expected,'Only the existing terminal 404 fallback may sit outside the guarded router');
    const guardedRoutes=admin.routes.filter(r=>r.method!=='ALL');
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
    const auditCount = async () => Number((await pool.query('select count(*) from audit_events where actor_id=$1', [sys.id])).rows[0].count);
    const beforeReads = await auditCount();
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
    assert.equal(await auditCount(), beforeReads, 'List, detail and statistics reads write no audit rows');
    for(const kind of ['users','ensembles','pieces','memberships','invitations','audit','transcription/jobs']){
      const before = await auditCount();
      await json(kind+'?search=DO_NOT_LOG_SEARCH',sys.cookie);
      assert.equal(await auditCount(), before, 'Search reads write no audit rows');
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
    assert.equal((await pool.query("select 1 from audit_events where actor_id=$1 and action='admin.memberships.list'",[sys.id])).rowCount,0);
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
    const beforeMutation = await auditCount();
    await json('transcription/control', sys.cookie, 'PUT', { paused: false, reason: 'Local test resume' });
    assert.equal(await auditCount(), beforeMutation + 1, 'A successful mutation writes exactly one audit row');
    const beforeContent = await auditCount();
    assert.equal((await json('pieces/' + p + '/content', sys.cookie, 'POST', { reason: 'Support case' })).body, 'PRIVATE_SCORE_SENTINEL');
    const download = await json('pieces/' + p + '/originals/' + object + '/download', sys.cookie, 'POST', {reason:'Support download'});
    assert.equal(download.expiresIn, 60);
    assert.ok(download.url);
    const events = (await pool.query("select action,metadata from audit_events where actor_id=$1 and action in ('admin.piece.content','admin.original.download')", [sys.id])).rows;
    assert.equal(events.length, 0, 'Content and download reads write no audit rows');
    assert.equal(await auditCount(), beforeContent);
    assert.doesNotMatch(JSON.stringify(events), /PRIVATE_SCORE_SENTINEL|private-admin-source/);
    const operational = stdout.mock.calls.flatMap(call => { try { return [JSON.parse(String(call.arguments[0]))]; } catch { return []; } });
    assert.deepEqual(operational.filter(record => record.event === 'admin.content_access').map(({ actor, targetType, targetId, reason }) => ({ actor, targetType, targetId, reason })), [
      { actor: sys.id, targetType: 'piece', targetId: p, reason: 'Support case' },
      { actor: sys.id, targetType: 'original', targetId: object, reason: 'Support download' },
    ]);
    assert.doesNotMatch(JSON.stringify(operational), /PRIVATE_SCORE_SENTINEL|private-admin-source/);
    await changeAdminRole(process.env.DATABASE_URL!, manager.email, true);
    await changeAdminRole(process.env.DATABASE_URL!, sys.email, false);
    assert.equal((await req('/api/admin/users', sys.cookie)).status, 404);
    await changeAdminRole(process.env.DATABASE_URL!, sys.email, true);
    assert.equal((await req('/api/admin/users', sys.cookie)).status, 200);
    await pool.query('delete from rate_limit where key like $1',['admin:list:%:'+sys.id]);
    await pool.query("insert into rate_limit(key,count,last_request) values($1,120,$2) on conflict(key) do update set count=120,last_request=$2", ['admin:read:' + sys.id, Date.now()]);
    assert.equal((await req('/api/admin/users', sys.cookie)).status, 200, 'Retired aggregate read counters do not block requests');
    await pool.query('delete from rate_limit where key=$1', ['admin:read:' + sys.id]);
    await pool.query("insert into rate_limit(key,count,last_request) values($1,10,$2) on conflict(key) do update set count=10,last_request=$2", ['admin:content:' + sys.id, Date.now()]);
    assert.equal((await req('/api/admin/pieces/' + p + '/content', sys.cookie, 'POST', {reason:'Limit test'})).status, 429);
    assert.equal((await req('/api/admin/pieces/' + p + '/originals/' + object + '/download', sys.cookie, 'POST', {reason:'Limit test'})).status, 429);
    for(const [kind,count] of [['content-hour',30],['content-day',200]] as const){
      await pool.query('delete from rate_limit where key like $1',['admin:content%:'+sys.id]);
      await pool.query('insert into rate_limit(key,count,last_request) values($1,$2,$3)',['admin:'+kind+':'+sys.id,count,Date.now()]);
      const r=await req('/api/admin/pieces/'+p+'/content',sys.cookie,'POST',{reason:'Cap test'});assert.equal(r.status,429);const body=await r.json();assert.equal(body.max,count);assert.equal(body.unit,kind==='content-hour'?'hour':'day');assert.match(body.message,new RegExp(`${count} per ${body.unit}`));
      const downloadCap=await req('/api/admin/pieces/'+p+'/originals/'+object+'/download',sys.cookie,'POST',{reason:'Download cap test'});assert.equal(downloadCap.status,429);assert.equal((await downloadCap.json()).max,count);
    }
    await pool.query('delete from rate_limit where key like $1',['admin:%:'+sys.id]);
    const beforeUnboundedReads = await auditCount();
    for(const [kind,path] of [['users','users'],['versions','pieces/'+p+'/versions'],['originals','pieces/'+p+'/originals']]) {
      await pool.query('insert into rate_limit(key,count,last_request) values($1,30,$2) on conflict(key) do update set count=30,last_request=$2', ['admin:list:'+kind+':'+sys.id,Date.now()]);
      for(let i=0;i<35;i++)await json(path,sys.cookie);
    }
    assert.equal(await auditCount(),beforeUnboundedReads,'Repeated list reads create no audit rows');
    const capLogs=stdout.mock.calls.flatMap(call=>{try{return [JSON.parse(String(call.arguments[0]))];}catch{return [];}}).filter(record=>record.event==='limit.hit'&&record.limit.startsWith('admin.content_'));
    assert.deepEqual([...new Set(capLogs.map(record=>record.limit))].sort(),['admin.content_day','admin.content_hour','admin.content_minute']);
    assert.ok(capLogs.every(record=>record.timestamp.endsWith('Z')&&record.level==='warn'&&record.scope==='user'&&!('actor' in record)));
    for(const [limit,value] of [['admin.content_minute',10],['admin.content_hour',30],['admin.content_day',200]]) {
      const tier=capLogs.filter(record=>record.limit===limit);assert.equal(tier.length,2);
      assert.deepEqual(tier.map(({scope,value,route})=>({scope,value,route})),[
        {scope:'user',value,route:'/api/admin/pieces/:id/content'},
        {scope:'user',value,route:'/api/admin/pieces/:id/originals/:id/download'},
      ]);
    }
    // D49: the real SQL endpoint searches the full relationship, beyond its first 100 rows.
    const detail=(await (await req('/api/ensembles',lead.cookie,'POST',{name:'Testchor'})).json()).id;
    const memberPrefix='search-'+detail+'-';
    await pool.query("insert into \"user\"(id,name,email,email_verified) select $1||n,case when n=110 then 'Anna' else 'Member '||lpad(n::text,3,'0') end,$1||n||'@test.com',true from generate_series(0,110) n",[memberPrefix]);
    await pool.query('insert into memberships(ensemble_id,user_id) select $1,$2||n from generate_series(0,110) n',[detail,memberPrefix]);
    const firstMembers=await json('memberships?ensemble='+detail+'&limit=100&sort=name&direction=desc',sys.cookie);
    assert.equal(firstMembers.items.length,100);assert.ok(firstMembers.nextCursor);assert.ok(!firstMembers.items.some((row:any)=>row.name==='Anna'));
    for(const filter of ['ensemble='+detail,'user='+encodeURIComponent(memberPrefix+'110')]){
      const match=await json('memberships?'+filter+'&limit=10&search=Anna%20Testchor',sys.cookie);
      assert.equal(match.items.length,1);assert.equal(match.items[0].name,'Anna');assert.equal(match.nextCursor,null);
    }
    assert.equal((await json('memberships?ensemble='+detail+'&limit=10&search=Testchor',sys.cookie)).items.length,10);
    await changeAdminRole(process.env.DATABASE_URL!, sys.email, true);
    const cli=(await pool.query("select metadata from audit_events where action='admin.user.sysadmin' and target_id=$1 order by created_at desc limit 1",[sys.id])).rows[0].metadata;assert.equal(cli.changed,false);assert.ok(cli.operator);assert.ok(cli.hostname);

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

test('malformed percent paths return 400 without a host error',async()=>{
 for(const path of ['/foo%zz','/%']){const response=await req(path);assert.equal(response.status,400);assert.equal((await response.json()).code,'invalid_path');}
});
test('ordinary handler statements time out and release the connection',{timeout:45000},async()=>{
 const {api}=await import('../server/http.server');
 api.get('/polish-timeout-fixture',async c=>{await pool.query('select pg_sleep(40) /* polish timeout */');return c.json({ok:true});});
 const start=performance.now(),response=await api.request(base+'/polish-timeout-fixture');assert.equal(response.status,500);assert.ok(performance.now()-start<38000);
 assert.equal((await pool.query('select 1 as ok')).rows[0].ok,1);assert.equal(pool.waitingCount,0);
 assert.equal((await pool.query("select count(*)::int n from pg_stat_activity where state='active' and query like 'select pg_sleep(40)%' ")).rows[0].n,0);
 const {adminQueries,workerQueries}=await import('../server/db/index.server');
 assert.equal((await pool.query('show statement_timeout')).rows[0].statement_timeout,'30s');assert.equal((await adminQueries(()=>pool.query('show statement_timeout'))).rows[0].statement_timeout,'2min');assert.equal((await workerQueries(()=>pool.query('show statement_timeout'))).rows[0].statement_timeout,'5s');
});

test('descriptively renamed migration keeps its applied identity and does not run again',async()=>{
 const {drizzle}=await import('drizzle-orm/node-postgres');const {migrate}=await import('drizzle-orm/node-postgres/migrator');
 const before=(await pool.query('select * from drizzle.__drizzle_migrations order by id')).rows;
 const applied=(await pool.query('select * from drizzle.__drizzle_migrations where created_at=$1',[1794833412673])).rows;
 assert.equal(applied.length,1);
 const {createHash}=await import('node:crypto');const {readFile}=await import('node:fs/promises');
 assert.equal(applied[0].hash,createHash('sha256').update(await readFile('drizzle/0018_admin_issued_invitations.sql')).digest('hex'));
 const client=await pool.connect();try{await migrate(drizzle(client),{migrationsFolder:'./drizzle'});}finally{client.release();}
 assert.deepEqual((await pool.query('select * from drizzle.__drizzle_migrations order by id')).rows,before);
});

test('permission snapshot comparison ignores JSON property order and checks every capability',async()=>{
 const {expectPermissions}=await import('../server/admin-management.server');
 const row={is_lead:true,manage_members:false,edit_music_pieces:true,ai_transcription:false};
 const expected={transcribe:false,editPieces:true,manageMembers:false,isLead:true};
 assert.doesNotThrow(()=>expectPermissions(row,expected));
 for(const key of Object.keys(expected) as (keyof typeof expected)[])assert.throws(()=>expectPermissions(row,{...expected,[key]:!expected[key]}),/stale_permissions/);
});

test('admin management: guarded transactions, permissions, invitations and live revocation', {timeout:90000}, async t=>{
 const sys=await person('management-sys'),other=await person('management-other'),lead=await person('management-lead'),member=await person('management-member'),unverified=await person('management-unverified',false);
 await changeAdminRole(process.env.DATABASE_URL!,sys.email,true);await changeAdminRole(process.env.DATABASE_URL!,other.email,true);
 const e=(await (await req('/api/ensembles',lead.cookie,'POST',{name:'Management fixture'})).json()).id;
 const leadMember=(await pool.query('select id from memberships where ensemble_id=$1 and user_id=$2',[e,lead.id])).rows[0].id;
 const none={isLead:false,manageMembers:false,editPieces:false,transcribe:false},leadPermissions={...none,isLead:true};
 const members='/api/admin/ensembles/'+e+'/members',role='/api/admin/users/'+member.id+'/sysadmin';
 const reason='Local management verification';let id='';
 const changes=()=>[
   [members,'POST',{userId:member.id,permissions:none,reason}],
   [members+'/'+(id||leadMember),'PATCH',{permissions:none,expected:leadPermissions,reason}],
   [members+'/'+(id||leadMember),'DELETE',{expected:none,reason}],
   [role,'PUT',{sysadmin:true,expected:false,reason}],
   ['/api/admin/ensembles/'+e+'/invitations','POST',{email:'management-invite@example.test',language:'en',capabilities:{manageMembers:false,editPieces:true,transcribe:false},idempotencyKey:'management-invite',reason}],
 ] as const;
 await t.test('all new routes conceal themselves and reject invalid reason and Origin',async()=>{
   const state = async () => ({
     memberships: (await pool.query('select * from memberships where ensemble_id=$1 order by id',[e])).rows,
     roles: (await pool.query('select * from platform_roles order by user_id')).rows,
     invitations: (await pool.query('select * from invitations where ensemble_id=$1 order by id',[e])).rows,
   });
   const unchanged = await state();
   await pool.query("insert into platform_roles(user_id,role) values($1,'sysadmin')",[unverified.id]);
   for(const [path,method,body] of changes()){
     for(const cookie of [member.cookie, unverified.cookie]) {
       const denied = await fetch(base+path,{method,headers:{cookie,origin:'https://untrusted.example.test','content-type':'application/json'},body:JSON.stringify(body)});
       assert.equal(denied.status,404);
     }
     assert.equal((await req(path,unverified.cookie,method,body)).status,404);
     for(const cookie of ['',member.cookie,lead.cookie]){const r=await req(path,cookie,method,body);assert.equal(r.status,404,path);assert.equal(r.headers.get('cache-control'),'no-store');}
     for(const bad of [undefined,'',' ', 'x'.repeat(1001),'\0','\ud800'])assert.equal((await req(path,sys.cookie,method,{...body,reason:bad})).status,422,path);
     for(const origin of [undefined,'https://untrusted.example.test']){
       const r=await fetch(base+path,{method,headers:{cookie:sys.cookie,'content-type':'application/json',...(origin?{origin}:{})},body:JSON.stringify(body)});assert.equal(r.status,403);assert.equal(r.headers.get('cache-control'),'no-store');
     }
   }
   await pool.query('delete from platform_roles where user_id=$1',[unverified.id]);
   assert.deepEqual(await state(),unchanged);
   assert.equal(Number((await pool.query("select count(*) from audit_events where actor_id=$1 and outcome='invalid_input'",[sys.id])).rows[0].count),30);
   assert.equal(Number((await pool.query("select count(*) from audit_events where actor_id=$1 and outcome='untrusted_origin'",[sys.id])).rows[0].count),0);
   await pool.query('delete from rate_limit where key like $1',['admin:%:'+sys.id]);
 });
 await t.test('invalid bodies retain only valid trimmed audit reasons and invitation identities',async()=>{
   await pool.query('delete from rate_limit where key like $1',['admin:%:'+sys.id]);
   for(const [path,method,body] of changes()) {
     const invalid = path.endsWith('/invitations') ? {language:'invalid'} : method==='POST' ? {permissions:{}} : {expected:'invalid'};
     const auditReason='Invalid fields '+crypto.randomUUID();
     assert.equal((await req(path,sys.cookie,method,{...body,...invalid,reason:'  '+auditReason+'  '})).status,422);
     const events=(await pool.query("select metadata from audit_events where actor_id=$1 and outcome='invalid_input' and metadata->>'reason'=$2",[sys.id,auditReason])).rows;
     assert.equal(events.length,1);assert.equal(events[0].metadata.reason,auditReason);
     if(path.endsWith('/invitations')) {assert.equal(events[0].metadata.ensembleId,e);assert.equal(events[0].metadata.email,'email' in body ? body.email : undefined);}
   }
   const path='/api/admin/ensembles/'+e+'/invitations';
   for(const email of ['  NORMALIZED@EXAMPLE.TEST  ','invalid-email']) {
     const auditReason='Invalid invitation '+crypto.randomUUID();
     const body=changes().at(-1)![2];
     assert.equal((await req(path,sys.cookie,'POST',{...body,email,capabilities:{},reason:auditReason})).status,422);
     const metadata=(await pool.query("select metadata from audit_events where actor_id=$1 and metadata->>'reason'=$2",[sys.id,auditReason])).rows[0].metadata;
     assert.equal(metadata.email,email==='invalid-email'?null:'normalized@example.test');assert.equal(metadata.ensembleId,e);
   }
   const invalidReasons=(await pool.query("select metadata from audit_events where actor_id=$1 and outcome='invalid_input' and metadata->>'reason'=''",[sys.id])).rows;
   assert.equal(invalidReasons.length,30);assert.ok(invalidReasons.every(r=>r.metadata.reason===''));
   await pool.query('delete from rate_limit where key like $1',['admin:%:'+sys.id]);
 });
 await t.test('add, inline capability changes and stale concurrent updates are audited',async()=>{
   assert.equal((await req(members,sys.cookie,'POST',{userId:member.id,permissions:none,reason})).status,200);
   id=(await pool.query('select id from memberships where ensemble_id=$1 and user_id=$2',[e,member.id])).rows[0].id;
   assert.equal((await req('/api/ensembles/'+e+'/members',member.cookie)).status,403);
   const edits=await Promise.all([sys,other].map((actor,i)=>req(members+'/'+id,actor.cookie,'PATCH',{expected:none,permissions:{...none,...(i?{transcribe:true}:{manageMembers:true})},reason})));
   assert.deepEqual(edits.map(r=>r.status).sort(),[200,409]);
   const row=(await pool.query('select * from memberships where id=$1',[id])).rows[0];assert.notEqual(row.manage_members,row.ai_transcription);
   const events=(await pool.query("select action,outcome,metadata from audit_events where target_id=$1 and action like 'admin.membership.%' order by created_at",[id])).rows;
   assert.equal(events.filter(r=>r.outcome==='ok').length,2);assert.equal(events.filter(r=>r.outcome==='stale_permissions').length,1);
   for(const event of events) { assert.equal(event.metadata.userId,member.id); assert.equal(event.metadata.ensembleId,e); }
   assert.deepEqual(events.find(r=>r.action==='admin.membership.add').metadata.after,none);
   assert.deepEqual(events.find(r=>r.action==='admin.membership.permissions'&&r.outcome==='ok').metadata.before,none);
 });
 await t.test('membership IDs are ensemble scoped; reordered snapshots work and stale deletion is unchanged',async()=>{
   const second=(await (await req('/api/ensembles',lead.cookie,'POST',{name:'Other management ensemble'})).json()).id;
   const foreign=(await pool.query('select * from memberships where ensemble_id=$1',[second])).rows[0];
   for(const [method,body] of [['PATCH',{expected:leadPermissions,permissions:none,reason}],['DELETE',{expected:leadPermissions,reason}]] as const) {
     assert.equal((await req(members+'/'+foreign.id,sys.cookie,method,body)).status,404);
     assert.deepEqual((await pool.query('select * from memberships where id=$1',[foreign.id])).rows[0],foreign);
   }
   const before=(await pool.query('select * from memberships where id=$1',[id])).rows[0];
   assert.equal((await req(members+'/'+id,sys.cookie,'DELETE',{expected:none,reason})).status,409);
   assert.deepEqual((await pool.query('select * from memberships where id=$1',[id])).rows[0],before);
   const reordered={transcribe:before.ai_transcription,editPieces:before.edit_music_pieces,manageMembers:before.manage_members,isLead:before.is_lead};
   assert.equal((await req(members+'/'+id,sys.cookie,'PATCH',{expected:reordered,permissions:reordered,reason})).status,200);
   await pool.query('delete from rate_limit where key like $1',['admin:%:'+sys.id]);
 });
 await t.test('last lead survives removal, demotion and concurrent demotions',async()=>{
   for(const [method,body] of [['DELETE',{expected:leadPermissions,reason}],['PATCH',{expected:leadPermissions,permissions:none,reason}]] as const){const r=await req(members+'/'+leadMember,sys.cookie,method,body);assert.equal(r.status,409);assert.equal((await r.json()).code,'last_lead');}
   const row=(await pool.query('select * from memberships where id=$1',[id])).rows[0];const expected={isLead:row.is_lead,manageMembers:row.manage_members,editPieces:row.edit_music_pieces,transcribe:row.ai_transcription};
   assert.equal((await req(members+'/'+id,sys.cookie,'PATCH',{expected,permissions:leadPermissions,reason})).status,200);
   const edits=await Promise.all([[leadMember,sys],[id,other]].map(([target,actor]:any)=>req(members+'/'+target,actor.cookie,'PATCH',{expected:leadPermissions,permissions:none,reason})));
   assert.deepEqual(edits.map(r=>r.status).sort(),[200,409]);
   assert.equal((await pool.query('select count(*)::int n from memberships where ensemble_id=$1 and is_lead',[e])).rows[0].n,1);
   for(const event of (await pool.query("select metadata from audit_events where target_id=$1 and outcome='last_lead'",[leadMember])).rows) { assert.equal(event.metadata.userId,lead.id); assert.equal(event.metadata.ensembleId,e); }
   // Restore the fixture lead before testing removal of the ordinary member.
   await pool.query('update memberships set is_lead=true where id=$1',[leadMember]);
   await pool.query('update memberships set is_lead=false,manage_members=false,edit_music_pieces=false,ai_transcription=false where id=$1',[id]);
 });
 await t.test('removal uses the lead revocation path for API, account rooms and rehearsal',async()=>{
   const {io:connect}=await import('socket.io-client');
   const sockets=['','/rehearsal'].map(ns=>connect(base+ns,{forceNew:true,extraHeaders:{cookie:member.cookie,origin:base},transports:['websocket'],reconnection:false}));
   try{
     await Promise.all(sockets.map(s=>new Promise<void>((resolve,reject)=>{const deadline=setTimeout(()=>reject(Error('Socket connection timed out')),5000);s.once('connect',()=>{clearTimeout(deadline);resolve();});s.once('connect_error',e=>{clearTimeout(deadline);reject(e);});})));
     const emit=(event:string)=>new Promise<any>((resolve,reject)=>sockets[1].timeout(5000).emit(event,{ensembleId:e},(error:any,data:any)=>error?reject(error):resolve(data)));
     assert.ok((await emit('rehearsal:join')).state);
     const changed=new Promise<void>(resolve=>sockets[0].once('membership:changed',()=>resolve()));
     assert.equal((await req('/api/ensembles/'+e+'/pieces',member.cookie)).status,200);
     assert.equal((await req(members+'/'+id,sys.cookie,'DELETE',{expected:none,reason})).status,200);await changed;
     assert.equal((await req('/api/ensembles/'+e+'/pieces',member.cookie)).status,404);
     assert.ok(!(await json('memberships?user='+member.id+'&ensemble='+e,sys.cookie)).items.length);
     assert.equal(io.of('/').sockets.get(sockets[0].id!)!.rooms.has('ensemble:'+e),false);
     assert.equal(io.of('/rehearsal').sockets.get(sockets[1].id!)!.rooms.has('rehearsal:'+e),false);
     assert.equal((await emit('rehearsal:snapshot')).code,'forbidden');
     const audit=(await pool.query("select metadata from audit_events where target_id=$1 and action='admin.membership.remove' and outcome='ok'",[id])).rows[0].metadata;
     assert.deepEqual(audit.before,none);assert.equal(audit.userId,member.id);assert.equal(audit.ensembleId,e);
     assert.equal((await req(members+'/'+id,sys.cookie,'DELETE',{expected:none,reason})).status,404);
     assert.equal((await pool.query("select metadata from audit_events where target_id=$1 and outcome='not_found'",[id])).rows[0].metadata.userId,member.id);
   }finally{sockets.forEach(s=>s.disconnect());}
 });
 await t.test('platform roles require verification, reject self revoke, recheck requests and preserve a final admin',async()=>{
   const originalRoles=(await pool.query('select * from platform_roles order by user_id')).rows;
   assert.equal((await req(role,sys.cookie,'PUT',{sysadmin:true,expected:true,reason})).status,409);
   assert.deepEqual((await pool.query('select * from platform_roles order by user_id')).rows,originalRoles);
   assert.equal((await req(role,sys.cookie,'PUT',{sysadmin:true,expected:false,reason})).status,200);
   assert.equal((await req('/api/admin/users',member.cookie)).status,200);
   assert.equal((await req(role,sys.cookie,'PUT',{sysadmin:false,expected:true,reason})).status,200);
   assert.equal((await req('/api/admin/users',member.cookie)).status,404);
   let r=await req('/api/admin/users/'+sys.id+'/sysadmin',sys.cookie,'PUT',{sysadmin:false,expected:true,reason});assert.equal((await r.json()).code,'self_revoke');
   r=await req('/api/admin/users/'+unverified.id+'/sysadmin',sys.cookie,'PUT',{sysadmin:true,expected:false,reason});assert.equal((await r.json()).code,'verified_email_required');
   const saved=(await pool.query('select * from platform_roles where user_id<>$1',[sys.id])).rows;
   try{await pool.query('delete from platform_roles where user_id<>$1',[sys.id]);await pool.query("insert into platform_roles(user_id,role) values($1,'sysadmin')",[unverified.id]);await assert.rejects(changeAdminRole(process.env.DATABASE_URL!,sys.email,false),/last_sysadmin/);}
   finally{await pool.query('delete from platform_roles where user_id=$1',[unverified.id]);for(const row of saved)await pool.query('insert into platform_roles(user_id,role,created_at) values($1,$2,$3) on conflict do nothing',[row.user_id,row.role,row.created_at]);}
 });
 await t.test('sysadmin invitations reuse delivery, hashes, expiry, acceptance and issuer revocation',async()=>{
   await pool.query('delete from rate_limit where key like $1',['admin:%:'+sys.id]);
   const path='/api/admin/ensembles/'+e+'/invitations',email='management-invite-'+crypto.randomUUID()+'@example.test';
   const input={email,language:'en',capabilities:{manageMembers:false,editPieces:true,transcribe:true},idempotencyKey:crypto.randomUUID(),reason};
   const r=await req(path,sys.cookie,'POST',input);assert.equal(r.status,200,await r.clone().text());
   const data=await r.json();assert.equal(data.deliveryState,'sent');assert.ok(!JSON.stringify(data).includes('token'));
   // A member manager can resend an admin-issued invite without changing its authority source or grants.
   await pool.query('insert into memberships(ensemble_id,user_id,manage_members) values($1,$2,true)',[e,member.id]);
   await pool.query("update invitation_sends set created_at=now()-interval '65 seconds' where ensemble_id=$1 and email=$2",[e,email]);
   const resent=await req('/api/ensembles/'+e+'/invitations',member.cookie,'POST',{email,idempotencyKey:crypto.randomUUID()});assert.equal(resent.status,201,await resent.clone().text());
   const audit=(await pool.query("select metadata from audit_events where target_id=$1 and action='admin.invitation.create'",[data.id])).rows[0].metadata;assert.equal(audit.email,email);assert.equal(audit.ensembleId,e);
   const i=(await pool.query('select * from invitations where id=$1',[data.id])).rows[0];assert.equal(i.inviter_id,sys.id);assert.equal(i.admin_issued,true);assert.match(i.token_hash,/^[a-f0-9]{64}$/);assert.ok(Math.abs((i.expires_at.getTime()-i.created_at.getTime())/86400000-14)<.01);
   const {captureMail}=await import('../server/mail.server');const mail=captureMail.messages.findLast(m=>m.to===email)!;const token=mail.text.match(/\/invite\/([^\s]+)/)![1];
   const password='Test-only-password-3456';assert.equal((await req('/api/auth/sign-up/email','','POST',{email,password,name:'Invited singer'})).status,200);
   await pool.query('update "user" set email_verified=true where email=$1',[email]);
   const sign=await req('/api/auth/sign-in/email','','POST',{email,password});const cookie=sign.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
   const accepted=await req('/api/invitations/'+token+'/accept',cookie,'POST',{});assert.equal(accepted.status,200,await accepted.clone().text());
   assert.equal((await accepted.json()).capabilities.editPieces,true);
   const {clock}=await import('../server/clock.server');const original=clock.now;
   const instant=new Date('2026-11-16T12:34:56Z');clock.now=()=>instant;
   try {
     for(const source of ['cli','web']) {
       const second=await req(path,sys.cookie,'POST',{...input,email:source+'-revoked-'+email,idempotencyKey:crypto.randomUUID()});assert.equal(second.status,200);
       if(source==='cli') await changeAdminRole(process.env.DATABASE_URL!,sys.email,false);
       else assert.equal((await req('/api/admin/users/'+sys.id+'/sysadmin',other.cookie,'PUT',{sysadmin:false,expected:true,reason})).status,200);
       const stored=(await pool.query('select state,revoked_at from invitations where id=$1',[(await second.json()).id])).rows[0];
       assert.equal(stored.state,'revoked');assert.deepEqual(stored.revoked_at,instant);
       await changeAdminRole(process.env.DATABASE_URL!,sys.email,true);
     }
   } finally {clock.now=original;}
 });
 await t.test('membership demotion and removal preserve admin invitations and use the application clock',async()=>{
   await pool.query('delete from rate_limit where key like $1',['admin:%:'+sys.id]);
   const {clock}=await import('../server/domain-http.server');const original=clock.now;
   const instant=new Date('2026-11-16T12:00:00Z');clock.now=()=>instant;
   try {
     await pool.query('insert into memberships(ensemble_id,user_id,manage_members) values($1,$2,true)',[e,sys.id]);
     const membership=(await pool.query('select id from memberships where ensemble_id=$1 and user_id=$2',[e,sys.id])).rows[0].id;
     for(const method of ['PATCH','DELETE']) {
       await pool.query('update memberships set manage_members=true where id=$1',[membership]);
       const invitations=(await pool.query("insert into invitations(ensemble_id,email,inviter_id,token_hash,expires_at,admin_issued) values($1,$2,$3,$4,now()+interval '1 day',false),($1,$5,$3,$6,now()+interval '1 day',true) returning id,admin_issued",[e,crypto.randomUUID()+'@example.test',sys.id,crypto.randomUUID(),crypto.randomUUID()+'@example.test',crypto.randomUUID()])).rows;
       assert.equal((await req(members+'/'+membership,sys.cookie,method,{expected:{...none,manageMembers:true},...(method==='PATCH'?{permissions:none}:{}),reason})).status,200);
       for(const invitation of invitations) {
         const stored=(await pool.query('select state,revoked_at from invitations where id=$1',[invitation.id])).rows[0];
         assert.equal(stored.state,invitation.admin_issued?'pending':'revoked');assert.deepEqual(stored.revoked_at,invitation.admin_issued?null:instant);
       }
     }
   } finally { clock.now=original; }
 });
 await t.test('body validation completes while platform writes hold the exclusive lock',async()=>{
   const blocker=await pool.connect();
   try {
     await blocker.query('begin');await blocker.query("select pg_advisory_xact_lock(hashtextextended('platform:sysadmin',0))");
     await pool.query('delete from rate_limit where key like $1',['admin:%:'+sys.id]);
     assert.equal((await req(members,sys.cookie,'POST',{userId:member.id,permissions:none,reason:''})).status,422);
   } finally {await blocker.query('rollback');blocker.release();await pool.query('delete from rate_limit where key like $1',['admin:%:'+sys.id]);}
 });
 await t.test('untrusted origins log without writing audit rows',async t=>{
   const output=t.mock.method(console,'log',()=>{});
   const before=(await pool.query("select count(*)::int n from audit_events where actor_id=$1 and outcome='untrusted_origin'",[sys.id])).rows[0].n;
   const response=await fetch(base+members,{method:'POST',headers:{cookie:sys.cookie,origin:'https://untrusted.example.test','content-type':'application/json'},body:JSON.stringify({userId:member.id,permissions:none,reason})});assert.equal(response.status,403);
   assert.equal((await pool.query("select count(*)::int n from audit_events where actor_id=$1 and outcome='untrusted_origin'",[sys.id])).rows[0].n,before);
   const records=output.mock.calls.map(c=>JSON.parse(String(c.arguments[0]))).filter(r=>r.event==='admin.origin_rejected');assert.equal(records.length,1);assert.doesNotMatch(JSON.stringify(records),/management-|example.test/);
 });
 await t.test('stored management audit metadata contains identity and no credentials',async()=>{
   const events=(await pool.query("select action,metadata from audit_events where actor_id=$1 and action in ('admin.membership.add','admin.membership.permissions','admin.membership.remove','admin.invitation.create','admin.user.sysadmin')",[sys.id])).rows;
   const secrets=(await pool.query('select token_hash as value from invitations where ensemble_id=$1 union all select token from session where user_id=$2 union all select password from account where user_id=$2',[e,sys.id])).rows.map(r=>r.value).filter(Boolean);
   for(const event of events) {
     const stored=JSON.stringify(event.metadata);assert.doesNotMatch(stored,/token|hash|secret|password/i);
     for(const secret of secrets)assert.ok(!stored.includes(secret));
     if(event.action.startsWith('admin.membership.')) {assert.ok('userId' in event.metadata);assert.equal(event.metadata.ensembleId,e);}
   }
 });
});


test('AICAP-31 21 role and 21 membership mutations are accepted in one minute',async()=>{
 const sys=await person('limits-admin'),member=await person('limits-target');
 await changeAdminRole(process.env.DATABASE_URL!,sys.email,true);
 for(let i=0;i<21;i++)assert.equal((await req('/api/admin/users/'+member.id+'/sysadmin',sys.cookie,'PUT',{sysadmin:i%2===0,expected:i%2!==0,reason:'Limit removal acceptance'})).status,200);
 const e=(await (await req('/api/ensembles',sys.cookie,'POST',{name:'Management admission'})).json()).id;
 const m=(await pool.query('insert into memberships(ensemble_id,user_id) values($1,$2) returning id',[e,member.id])).rows[0].id;
 for(let i=0;i<21;i++)assert.equal((await req('/api/admin/ensembles/'+e+'/members/'+m,sys.cookie,'PATCH',{
  reason:'Limit removal acceptance',expected:{isLead:false,manageMembers:false,editPieces:i%2!==0,transcribe:false},permissions:{isLead:false,manageMembers:false,editPieces:i%2===0,transcribe:false}
 })).status,200);

});
