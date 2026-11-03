import { test, after } from 'node:test';
import assert from 'node:assert/strict';
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
async function signIn(email: string, password: string) { const r = await post('sign-in/email', { email, password }); assert.equal(r.status, 200, await r.clone().text()); return r.headers.getSetCookie().map(v => v.split(';')[0]).join('; '); }
function socket(cookie: string, origin = base) { const s = connect(`${base}/rehearsal`, { extraHeaders: { cookie, origin }, transports: ['websocket'], reconnection: false, timeout: 3000 }); sockets.push(s); return s; }
async function accepted(cookie: string) { const s = socket(cookie); await new Promise<void>((resolve,reject) => { s.on('connect', resolve); s.on('connect_error', reject); }); return s; }
async function rejected(cookie: string, origin = base) { const s = socket(cookie, origin); await new Promise<void>((resolve,reject) => { s.on('connect', () => reject(new Error('Socket unexpectedly accepted'))); s.on('connect_error', () => resolve()); }); s.close(); }
function mailLink() { const mail = captureMail.messages.at(-1); assert.ok(mail); const link = mail.text.match(/https?:\/\/[^\s]+/)?.[0]; assert.ok(link); return { mail, link }; }
test('real HTTP accounts, mail capture, cookies, revocation and Socket.IO', { timeout: 20000 }, async () => {
 assert.equal((await fetch(`${base}/healthz`)).status,200); assert.equal((await fetch(`${base}/readyz`)).status,200);
 assert.match(await (await fetch(base)).text(), /LightScore/);
 assert.equal((await fetch(`${base}/app`, { redirect: 'manual' })).status,302);
 const email = `foundation-${crypto.randomUUID()}@example.test`; const password = 'valid-rehearsal-password-42';
 assert.equal((await post('sign-up/email', { name:'Singer', email, password, language:'de', callbackURL: `${base}/?state=verified` })).status,200);
 assert.match(mailLink().mail.subject,/bestätigen/);
 assert.equal((await post('sign-in/email', { email,password })).status,403);
 await fetch(mailLink().link, { redirect:'manual' });
 const cookie = await signIn(email,password); const secondDevice = await signIn(email,password);
 assert.equal((await fetch(`${base}/api/me`,{ headers:{cookie} })).status,200);
 assert.equal((await fetch(`${base}/app`,{ headers:{cookie} })).status,200);
 await accepted(cookie); await rejected(''); await rejected(cookie,'http://evil.test');
 assert.equal((await post('sign-out',{},cookie,'http://evil.test')).status,403);
 assert.equal((await post('sign-out',{},cookie)).status,200);
 assert.equal((await fetch(`${base}/api/me`,{ headers:{cookie} })).status,401); await rejected(cookie);
 assert.equal((await fetch(`${base}/api/me`,{ headers:{cookie:secondDevice} })).status,200);
 assert.equal((await post('request-password-reset',{email,redirectTo:`${base}/`})).status,200);
 const resetToken = new URL(mailLink().link).pathname.split('/').at(-1)!;
 assert.match(mailLink().mail.subject,/zurücksetzen/);
 const newPassword = 'new-rehearsal-password-43';
 assert.equal((await post('reset-password',{token:resetToken,newPassword})).status,200);
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
 const time = await pool.query('insert into ensembles (id,name,created_at) values ($1,$2,$3) returning created_at',[crypto.randomUUID(),'Time fixture',stamp]);
 assert.equal(time.rows[0].created_at.toISOString(),'2026-11-01T05:30:00.000Z');
});
test('production rejects auth bypass flags before startup', () => {
 const result = spawnSync(process.execPath,['--import','tsx','server/start.ts'], { env:{...process.env,NODE_ENV:'production',AUTH_BYPASS:'1'}, encoding:'utf8' });
 assert.notEqual(result.status,0); assert.match(result.stderr,/bypass flags are forbidden/);
});
