import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { spawnSync } from 'node:child_process';
import { io as connect, type Socket } from 'socket.io-client';
process.env.NODE_ENV = 'test'; process.env.TZ = 'Pacific/Honolulu'; process.env.MAIL_TRANSPORT = 'capture';
process.env.PORT = '23001'; process.env.BETTER_AUTH_URL = 'http://localhost:23001'; process.env.TRUSTED_ORIGINS = 'http://localhost:23001';
const { server, io } = await import('../server/start');
const { pool } = await import('../server/db/index.server');
const { captureMail } = await import('../server/mail.server');
const base = process.env.BETTER_AUTH_URL;
const sockets: Socket[] = [];
after(async () => { sockets.forEach(s => s.close()); await new Promise<void>(resolve => io.close(() => resolve())); server.close(); await pool.end(); });
async function post(endpoint: string, body: unknown, cookie = '', origin = base) { return fetch(`${base}/api/auth/${endpoint}`, { method: 'POST', headers: { origin, cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
async function signIn(email: string, password: string) { const r = await post('sign-in/email', { email, password }); assert.equal(r.status, 200, await r.clone().text()); assert.match(r.headers.getSetCookie().join(';'), /HttpOnly/i); assert.match(r.headers.getSetCookie().join(';'), /SameSite=Lax/i); return r.headers.getSetCookie().map(v => v.split(';')[0]).join('; '); }
function socket(cookie: string, origin = base) { const s = connect(`${base}/rehearsal`, { forceNew: true, extraHeaders: { cookie, origin }, transports: ['websocket'], reconnection: false, timeout: 3000 }); sockets.push(s); return s; }
async function accepted(cookie: string) { const s = socket(cookie); await new Promise<void>((resolve,reject) => { s.on('connect', resolve); s.on('connect_error', reject); }); return s; }
async function rejected(cookie: string, origin = base) { const s = socket(cookie, origin); await new Promise<void>((resolve,reject) => { s.on('connect', () => reject(new Error('Socket unexpectedly accepted'))); s.on('connect_error', () => resolve()); }); s.close(); }
async function waitMail(count: number) { for (let i=0;i<100 && captureMail.messages.length <= count;i++) await delay(20); assert.ok(captureMail.messages.length > count); }
function mailLink() { const mail = captureMail.messages.at(-1); assert.ok(mail); const link = mail.text.match(/https?:\/\/[^\s]+/)?.[0]; assert.ok(link); return { mail, link }; }
test('real HTTP accounts, mail capture, cookies, revocation and Socket.IO', { timeout: 60000 }, async () => {
 assert.equal((await fetch(`${base}/healthz`)).status,200); assert.equal((await fetch(`${base}/readyz`)).status,200);
 assert.match(await (await fetch(base)).text(), /LightScore/);
 assert.equal((await fetch(`${base}/app`, { redirect: 'manual' })).status,302);
 const email = `foundation-${crypto.randomUUID()}@example.test`; const password = 'valid-rehearsal-password-42';
 assert.equal((await post('sign-up/email', { name:'Singer', email, password, language:'de', callbackURL: `${base}/?state=verified` })).status,200);
 await waitMail(0); assert.match(mailLink().mail.subject,/bestätigen/);
 assert.equal((await post('sign-in/email', { email,password })).status,403);
 const verifyLink = mailLink().link; await fetch(verifyLink, { redirect:'manual' });
 assert.equal((await fetch(verifyLink, { redirect: 'manual' })).status, 302); // verification replay is idempotent, no session issued
 assert.equal((await post('verify-email-password',{token:new URL(verifyLink).searchParams.get('token'),password})).status,200);
 const cookie = await signIn(email,password); const secondDevice = await signIn(email,password);
 assert.equal((await fetch(`${base}/api/me`,{ headers:{cookie} })).status,200);
 assert.equal((await fetch(`${base}/app`,{ headers:{cookie} })).status,200);
 const root = connect(base, {forceNew:true,extraHeaders:{origin:base},transports:['websocket'],reconnection:false}); await new Promise<void>((resolve,reject)=>{root.on('connect_error',()=>resolve());root.on('connect',()=>reject(new Error('Anonymous root accepted')));}); root.close();
 const liveSignout = await accepted(cookie); const onSignout = new Promise<void>(resolve => liveSignout.once('disconnect', () => resolve())); await rejected(''); await rejected(cookie,'http://evil.test');
 assert.equal((await post('sign-out',{},cookie,'http://evil.test')).status,403);
 assert.equal((await post('sign-out',{},cookie)).status,200); await onSignout;
 assert.equal((await fetch(`${base}/api/me`,{ headers:{cookie} })).status,401); await rejected(cookie);
 assert.equal((await fetch(`${base}/api/me`,{ headers:{cookie:secondDevice} })).status,200);
 const beforeReset = captureMail.messages.length; const liveReset = await accepted(secondDevice); const onReset = new Promise<void>(resolve => liveReset.once('disconnect', () => resolve()));
 assert.equal((await post('request-password-reset',{email,redirectTo:`${base}/`})).status,200);
 await waitMail(beforeReset);
 const resetToken = new URL(mailLink().link).pathname.split('/').at(-1)!;
 assert.match(mailLink().mail.subject,/zurücksetzen/);
 const raw = await pool.query('select identifier, value from verification'); assert.ok(raw.rows.every(r => !JSON.stringify(r).includes(resetToken)));
 assert.equal((await post('reset-password',{token:'garbage',newPassword:'another-valid-password'})).status,400);
 const newPassword = 'new-rehearsal-password-43';
 assert.equal((await post('reset-password',{token:resetToken,newPassword})).status,200); await onReset;
 assert.equal((await post('reset-password',{token:resetToken,newPassword})).status,400);
 assert.equal((await post('sign-in/email',{email,password})).status,401);
 assert.equal((await fetch(`${base}/api/me`,{headers:{cookie:secondDevice}})).status,401); await rejected(secondDevice);
 const fresh = await signIn(email,newPassword); const live = await accepted(fresh);
 const disconnected = new Promise<void>(resolve => live.on('disconnect',()=>resolve()));
 await pool.query('update session set expires_at = $1 where user_id = (select id from "user" where email=$2)',[new Date(Date.now()-1000),email]);
 await disconnected;
 assert.equal((await fetch(`${base}/api/me`,{headers:{cookie:fresh}})).status,401); await rejected(fresh);
 const types = await pool.query("select data_type from information_schema.columns where table_schema='public' and column_name ~ '_at$'");
 assert.ok(types.rowCount! > 15); assert.ok(types.rows.every(r => r.data_type === 'timestamp with time zone'));
 const stamp = '2026-11-01T01:30:00-04:00';
 const time = await pool.query('with e as(insert into ensembles (id,name,created_at) values ($1,$2,$3) returning id,created_at), m as(insert into memberships(ensemble_id,user_id,is_lead) select e.id,u.id,true from e cross join "user" u where u.email=$4) select created_at from e',[crypto.randomUUID(),'Time fixture',stamp,email]);
 const { formatInstant } = await import('../server/time.server'); assert.match(formatInstant(stamp), /05:30:00/); assert.throws(() => formatInstant('2026-11-01T01:30:00'));
 assert.equal(time.rows[0].created_at.toISOString(),'2026-11-01T05:30:00.000Z');
});
test('production rejects auth bypass flags before startup', () => {
 const result = spawnSync(process.execPath,['--import','tsx','server/start.ts'], { env:{...process.env,NODE_ENV:'production',AUTH_BYPASS:'1'}, encoding:'utf8' });
 assert.notEqual(result.status,0); assert.match(result.stderr,/bypass flags are forbidden/);
});

test('origin, redirect, duplicate signup, cleanup, rate limits and database outages', { timeout: 60000 }, async () => {
 const email = `security-${crypto.randomUUID()}@example.test`, password = 'valid-security-password-42';
 assert.equal((await fetch(`${base}/_serverFn/fixture`,{method:'POST',body:'{}'})).status,403);
 assert.equal((await fetch(`${base}/api/auth/sign-out`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status,403);
 for (const [endpoint, body] of [['sign-up/email',{email,password,name:'Singer',callbackURL:'https://evil.test'}],['request-password-reset',{email,redirectTo:'https://evil.test'}]]) assert.equal((await post(String(endpoint),body)).status,403);
 let count = captureMail.messages.length;
 assert.equal((await post('sign-up/email',{email,password,name:'Singer'})).status,200); await waitMail(count);
 count = captureMail.messages.length;
 assert.equal((await post('sign-up/email',{email,password,name:'Other'})).status,200); await waitMail(count);
 const recovery = mailLink().link; const recoveryToken=new URL(recovery).pathname.split('/').at(-1)!; assert.equal((await post('reset-password',{token:recoveryToken,newPassword:password})).status,200);
 count = captureMail.messages.length;
 assert.equal((await post('sign-up/email',{email,password,name:'Other'})).status,200); await waitMail(count);
 assert.match(captureMail.messages[count].subject,/reset/i);
 const token = new URL(mailLink().link).pathname.split('/').at(-1)!;
 await pool.query("update verification set expires_at = now() - interval '1 hour'");
 assert.equal((await post('reset-password',{token,newPassword:password})).status,400);
 const cookie = await signIn(email,password); const other = await signIn(email,password);
 const sessions = await (await fetch(`${base}/api/auth/list-sessions`,{headers:{cookie}})).json(); assert.equal(sessions.length,2);
 const live = await accepted(other); const disconnected = new Promise<void>(resolve => live.once('disconnect', () => resolve()));
 const current = await (await fetch(`${base}/api/auth/get-session`,{headers:{cookie}})).json();
 const target = sessions.find((s: {id: string}) => s.id !== current.session.id);
 assert.equal((await post('revoke-session',{id:target.id},cookie)).status,200); await disconnected;
 await pool.query(`insert into "user" (name,email,created_at) values ('old','old@example.test',now()-interval '8 days'), ('new','new@example.test',now())`);
 const { cleanupUnverifiedAccounts } = await import('../server/cleanup.server'); assert.equal(await cleanupUnverifiedAccounts(),1);
 assert.equal((await pool.query(`select id from "user" where email='new@example.test'`)).rowCount,1);
 await pool.query('update drizzle.__drizzle_migrations set hash = $1 where id = (select min(id) from drizzle.__drizzle_migrations)', ['pending']);
 assert.equal((await fetch(`${base}/readyz`)).status,503);
 const { readMigrationFiles } = await import('drizzle-orm/migrator');
 await pool.query('update drizzle.__drizzle_migrations set hash = $1 where id = (select min(id) from drizzle.__drizzle_migrations)', [readMigrationFiles({migrationsFolder:'./drizzle'})[0].hash]);
 // Terminate idle pooled connections: pg emits the same asynchronous pool error as DB shutdown.
 await pool.query('select 1');
 const pg = await import('pg'); const admin = new pg.default.Client({connectionString:process.env.DATABASE_URL}); await admin.connect();
 await admin.query('select pg_terminate_backend(pid) from pg_stat_activity where datname=current_database() and pid <> pg_backend_pid()'); await admin.end(); await delay(100);
 assert.equal((await fetch(`${base}/healthz`)).status,200); assert.equal((await fetch(`${base}/readyz`)).status,200);
 const resilient = await accepted(cookie);
 const container = process.env.TEST_POSTGRES_CONTAINER!;
 assert.equal(spawnSync('docker',['stop','-t','10',container]).status,0);
 assert.equal((await fetch(`${base}/healthz`)).status,200); assert.equal((await fetch(`${base}/readyz`)).status,503);
 await delay(16000); assert.equal(resilient.connected,true);
 assert.equal(spawnSync('docker',['start',container]).status,0);
 for (let i=0;i<100;i++) { if ((await fetch(`${base}/readyz`)).status===200) break; await delay(100); }
 const recovered = await fetch(`${base}/readyz`); assert.equal(recovered.status,200, await recovered.text());
 await pool.query('delete from rate_limit');
 let limited = false; for (let i=0;i<7;i++) if ((await post('request-password-reset',{email:'missing@example.test'})).status===429) limited=true;
 assert.ok(limited);
});

test('production configuration, secure cookies and module instance guard', async () => {
 const { parseEnv } = await import('../server/env.server');
 const good = { ...process.env, NODE_ENV: 'production', BETTER_AUTH_SECRET: 'generated-fixture-secret-0123456789abcdef', BETTER_AUTH_URL: 'https://lightscore.test', TRUSTED_ORIGINS: 'https://lightscore.test/path/', MAIL_TRANSPORT: 'resend', RESEND_API_KEY: 'stub-never-send' };
 assert.deepEqual(parseEnv(good).TRUSTED_ORIGINS, ['https://lightscore.test']);
 for (const bad of [{AUTH_IP_HEADERS:'x-forwarded-for',AUTH_TRUSTED_PROXIES:''},{AUTH_IP_HEADERS:'',AUTH_TRUSTED_PROXIES:'127.0.0.1'},{BETTER_AUTH_URL:'http://lightscore.test'}, {MAIL_TRANSPORT:'capture'}, {BETTER_AUTH_SECRET:'replace-with-at-least-32-random-characters'}, {NODE_ENV:'staging'}, {NODE_ENV:'test',BETTER_AUTH_URL:'https://lightscore.test'}]) assert.throws(() => parseEnv({...good,...bad}));
 const script = `const {auth}=await import('./server/auth.server.ts'); const c=await auth.$context; const a=c.authCookies.sessionToken.attributes; if(!a.secure||!a.httpOnly||a.sameSite!=='lax')throw Error('Cookie flags'); const x=await import('./server/auth.server.ts?second'); if(x.auth!==auth)throw Error('Duplicate auth'); const d=await import('./server/db/index.server.ts'); const e=await import('./server/db/index.server.ts?second'); if(d.pool!==e.pool)throw Error('Duplicate pool'); const {createServer}=await import('vite'); const vite=await createServer({configFile:false,server:{middlewareMode:true},optimizeDeps:{noDiscovery:true,include:[]}}); try { const sa=await vite.ssrLoadModule('/server/auth.server.ts'); const sd=await vite.ssrLoadModule('/server/db/index.server.ts'); if(sa.auth!==auth || sd.pool!==d.pool) throw Error('Duplicate Vite/native instance'); } finally { await vite.close(); } await d.pool.end();`;
 const result = spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',script],{env:good,encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});

test('tenant foreign keys, version identity, normalized invitations and deletion retention', async () => {
 const a=crypto.randomUUID(), b=crypto.randomUUID(), u=crypto.randomUUID(), piece=crypto.randomUUID(), version=crypto.randomUUID(), object=crypto.randomUUID(), job=crypto.randomUUID();
 const keeper=crypto.randomUUID();
 await pool.query('insert into "user"(id,name,email) values($1,$1,$2)',[keeper,keeper+'@example.test']);
 await pool.query('with e as(insert into ensembles(id,name) values ($1,$1),($2,$2) returning id) insert into memberships(ensemble_id,user_id,is_lead) select id,$3,true from e',[a,b,keeper]);
 await pool.query('insert into "user"(id,name,email) values ($1,$1,$2)',[u,` ${u.toUpperCase()}@EXAMPLE.TEST `]);
 assert.equal((await pool.query('select email from "user" where id=$1',[u])).rows[0].email,`${u}@example.test`);
 await pool.query("insert into music_pieces(id,ensemble_id,title,sort_key,format) values ($1,$2,'Piece','A','musicxml')",[piece,a]);
 await assert.rejects(pool.query("insert into score_versions(ensemble_id,piece_id,version_no,format,musicxml,content_hash,size) values ($1,$2,1,'musicxml','<score/>','hash',8)",[b,piece]), {code:'23503'});
 await pool.query("insert into score_versions(id,ensemble_id,piece_id,version_no,created_by,format,musicxml,content_hash,size) values ($1,$2,$3,1,$4,'musicxml','<score/>','hash',8)",[version,a,piece,u]);
 await pool.query('update music_pieces set current_version_id=$1 where id=$2',[version,piece]);
 await assert.rejects(pool.query("insert into score_versions(ensemble_id,piece_id,version_no,format,musicxml,content_hash,size) values ($1,$2,1,'musicxml','<score/>','other',8)",[a,piece]), {code:'23505'});
 await pool.query("insert into stored_objects(id,ensemble_id,user_id,object_key,size,content_type,sha256,provenance) values ($1,$2,$3,$1,1,'image/png','hash','{}')",[object,a,u]);
 await assert.rejects(pool.query("insert into transcription_jobs(ensemble_id,model,prompt_version,imported_piece_id) values ($1,'fixture','1',$2)",[b,piece]),{code:'23503'});
 await pool.query("insert into transcription_jobs(id,ensemble_id,user_id,model,prompt_version) values ($1,$2,$3,'fixture','1')",[job,b,u]);
 await assert.rejects(pool.query("insert into job_pages(ensemble_id,job_id,object_id,page_number,model,prompt_version) values ($1,$2,$3,1,'fixture','1')",[b,job,object]),{code:'23503'});
 await pool.query("insert into invitations(ensemble_id,email,inviter_id,token_hash,expires_at) values ($1,' Singer@EXAMPLE.TEST ',$2,'invitation-hash',now()+interval '1 day')",[a,u]);
 await assert.rejects(pool.query("insert into invitations(ensemble_id,email,token_hash,expires_at) values ($1,'singer@example.test','other-hash',now()+interval '1 day')",[a]),{code:'23505'});
 await pool.query('insert into memberships(ensemble_id,user_id) values ($1,$2)',[a,u]);
 await pool.query('insert into platform_roles(user_id) values ($1)',[u]);
 await pool.query("insert into audit_events(actor_id,action,outcome) values ($1,'fixture','ok')",[u]);
 await pool.query('delete from "user" where id=$1',[u]);
 assert.equal((await pool.query('select user_id from stored_objects where id=$1',[object])).rows[0].user_id,null);
 assert.equal((await pool.query('select user_id from transcription_jobs where id=$1',[job])).rows[0].user_id,null);
 assert.equal((await pool.query('select created_by from score_versions where id=$1',[version])).rows[0].created_by,null);
});

test('production proxy headers give distinct rate buckets and readiness accepts migration suffixes', async()=>{
 const script=`const {server,io}=await import('./server/start.ts'); const {pool}=await import('./server/db/index.server.ts'); try { for(const ip of ['198.51.100.10','198.51.100.20']) {const r=await fetch('http://127.0.0.1:23008/api/auth/sign-in/email',{method:'POST',headers:{origin:'https://lightscore.test','content-type':'application/json','x-forwarded-for':ip,'x-lightscore-socket-ip':'spoof'},body:JSON.stringify({email:ip+'@example.test',password:'invalid-password-42'})});if(r.status!==401)throw Error('Unexpected status '+r.status);} for(let i=0;i<11;i++){const r=await fetch('http://127.0.0.1:23008/api/auth/sign-in/email',{method:'POST',headers:{origin:'https://lightscore.test','content-type':'application/json','x-forwarded-for':'198.51.100.30'},body:JSON.stringify({email:'victim@example.test',password:'wrong-password-42'})});if(r.status!==(i<10?401:429))throw Error('Failure throttle '+r.status);}const victim=await fetch('http://127.0.0.1:23008/api/auth/sign-in/email',{method:'POST',headers:{origin:'https://lightscore.test','content-type':'application/json','x-forwarded-for':'198.51.100.40'},body:JSON.stringify({email:'victim@example.test',password:'wrong-password-42'})});if(victim.status!==401)throw Error('Victim email locked globally'); const rows=await pool.query("select key from rate_limit where key like '%198.51.100.%'");if(!rows.rows.some(r=>r.key.includes('198.51.100.10'))||!rows.rows.some(r=>r.key.includes('198.51.100.20')))throw Error('Shared client bucket');}finally {await new Promise(r=>io.close(r));server.close();await pool.end();}`;
 const result=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',script],{encoding:'utf8',timeout:15000,env:{...process.env,NODE_ENV:'production',PORT:'23008',BETTER_AUTH_URL:'https://lightscore.test',TRUSTED_ORIGINS:'https://lightscore.test',MAIL_TRANSPORT:'resend',RESEND_API_KEY:'stub-never-send',AUTH_IP_HEADERS:'x-forwarded-for',AUTH_TRUSTED_PROXIES:'127.0.0.1/32'}});
 assert.equal(result.status,0,result.stderr);
 await pool.query("insert into drizzle.__drizzle_migrations(hash,created_at) values('future-suffix',9999999999999)");
 try{assert.equal((await fetch(base+'/readyz')).status,200);}finally{await pool.query("delete from drizzle.__drizzle_migrations where hash='future-suffix'");}
});

test('production without proxy configuration derives separate clients from real sockets',()=>{
 const script=`const {server,io}=await import('./server/start.ts');const {pool}=await import('./server/db/index.server.ts');const {request}=await import('node:http');try{for(const ip of ['127.0.0.2','127.0.0.3'])await new Promise((resolve,reject)=>{const r=request({hostname:'127.0.0.1',port:23008,path:'/api/auth/sign-in/email',method:'POST',localAddress:ip,headers:{origin:'https://lightscore.test','content-type':'application/json','x-forwarded-for':'203.0.113.1','x-lightscore-socket-ip':'spoof'}},res=>{res.resume();res.on('end',()=>res.statusCode===401?resolve():reject(Error('Status '+res.statusCode)));});r.on('error',reject);r.end(JSON.stringify({email:ip+'@example.test',password:'invalid-password-42'}));});const rows=await pool.query("select key from rate_limit where key like '127.0.0.%'");for(const ip of ['127.0.0.2','127.0.0.3'])if(!rows.rows.some(r=>r.key.startsWith(ip+'|')))throw Error('Missing socket bucket');}finally{await new Promise(r=>io.close(r));server.close();await pool.end();}`;
 const result=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',script],{encoding:'utf8',timeout:15000,env:{...process.env,NODE_ENV:'production',PORT:'23008',BETTER_AUTH_URL:'https://lightscore.test',TRUSTED_ORIGINS:'https://lightscore.test',MAIL_TRANSPORT:'resend',RESEND_API_KEY:'stub-never-send',AUTH_IP_HEADERS:'',AUTH_TRUSTED_PROXIES:''}});assert.equal(result.status,0,result.stderr);
});
