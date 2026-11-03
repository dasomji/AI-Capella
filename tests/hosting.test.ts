import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { io } from 'socket.io-client';
for (const mode of ['dev','start']) test(`${mode}: real npm command serves Start, auth and Socket.IO on one HTTP origin`, { timeout: 30000 }, async () => {
 const port = mode === 'dev' ? 23002 : 23003; const base = `http://localhost:${port}`;
 const child = spawn('npm', mode === 'dev' ? ['run','dev','--','--port',String(port)] : ['start'], { detached: true, env: { ...process.env, NODE_ENV:'test', PORT:String(port), BETTER_AUTH_URL:base, TRUSTED_ORIGINS:base, MAIL_TRANSPORT:'smtp' }, stdio:'pipe' });
 let logs = ''; child.stdout.on('data',v => { logs += v; }); child.stderr.on('data',v => { logs += v; });
 try {
  let ready = false;
  for (let i=0;i<100;i++) { try { ready = (await fetch(`${base}/readyz`)).ok; } catch {} if (ready) break; await delay(100); }
  assert.ok(ready,logs);
  const html = await fetch(base); assert.match(await html.text(),/LightScore/); assert.equal(html.headers.get('cache-control'),'no-store');
  assert.equal((await fetch(`${base}/_serverFn/fixture`,{method:'POST',body:'{}'})).status,403);
  if (mode === 'start') { const { readdir } = await import('node:fs/promises'); const asset = (await readdir('dist/client/assets')).find(f=>f.endsWith('.js'))!; const response = await fetch(`${base}/assets/${asset}`); assert.equal(response.status,200); assert.match(response.headers.get('cache-control') ?? '', /immutable/); assert.equal((await fetch(`${base}/assets/${asset}.map`)).status,404); }
  const post = (path: string, body: unknown) => fetch(`${base}/api/auth/${path}`,{ method:'POST',headers:{origin:base,'Content-Type':'application/json'},body:JSON.stringify(body) });
  const email = `${mode}-${crypto.randomUUID()}@example.test`; const password = 'valid-singer-password-55';
  assert.equal((await post('sign-up/email',{ email,password,name:'Host singer',callbackURL:base })).status,200);
  let list: any; for (let i=0;i<100;i++) { list = await (await fetch('http://127.0.0.1:28025/api/v1/messages')).json(); if (list.messages.some((m: any) => m.To.some((to: any) => to.Address === email))) break; await delay(50); }
  const mail = list.messages.find((m: {To: {Address: string}[]}) => m.To.some(to => to.Address === email)); assert.ok(mail);
  const message = await (await fetch(`http://127.0.0.1:28025/api/v1/message/${mail.ID}`)).json();
  const link = message.Text.match(/http[^\s]+/)[0]; await fetch(link,{redirect:'manual'});
  assert.equal((await post('verify-email-password',{token:new URL(link).searchParams.get('token'),password})).status,200);
  const signedIn = await post('sign-in/email',{ email,password }); assert.equal(signedIn.status,200,await signedIn.clone().text());
  const cookie = signedIn.headers.getSetCookie().map(v => v.split(';')[0]).join('; ');
  assert.equal((await fetch(`${base}/app`,{headers:{cookie}})).status,200);
  const socket = io(`${base}/rehearsal`,{extraHeaders:{cookie,origin:base},transports:['polling'],reconnection:false,timeout:3000});
  try { await new Promise<void>((resolve,reject) => { socket.on('connect',resolve); socket.on('connect_error',reject); }); } finally { socket.close(); }
 } finally { process.kill(-child.pid!, 'SIGTERM'); await new Promise<void>(resolve => child.on('exit',()=>resolve())); }
});
