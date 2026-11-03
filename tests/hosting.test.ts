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
  assert.match(await (await fetch(base)).text(),/LightScore/);
  const post = (path: string, body: unknown) => fetch(`${base}/api/auth/${path}`,{ method:'POST',headers:{origin:base,'Content-Type':'application/json'},body:JSON.stringify(body) });
  const email = `${mode}-${crypto.randomUUID()}@example.test`; const password = 'valid-singer-password-55';
  assert.equal((await post('sign-up/email',{ email,password,name:'Host singer',callbackURL:base })).status,200);
  const list = await (await fetch('http://127.0.0.1:28025/api/v1/messages')).json();
  const mail = list.messages.find((m: {To: {Address: string}[]}) => m.To.some(to => to.Address === email)); assert.ok(mail);
  const message = await (await fetch(`http://127.0.0.1:28025/api/v1/message/${mail.ID}`)).json();
  const link = message.Text.match(/http[^\s]+/)[0]; await fetch(link,{redirect:'manual'});
  const signedIn = await post('sign-in/email',{ email,password }); assert.equal(signedIn.status,200,await signedIn.clone().text());
  const cookie = signedIn.headers.getSetCookie().map(v => v.split(';')[0]).join('; ');
  assert.equal((await fetch(`${base}/app`,{headers:{cookie}})).status,200);
  const socket = io(`${base}/rehearsal`,{extraHeaders:{cookie,origin:base},transports:['websocket'],reconnection:false,timeout:3000});
  try { await new Promise<void>((resolve,reject) => { socket.on('connect',resolve); socket.on('connect_error',reject); }); } finally { socket.close(); }
 } finally { process.kill(-child.pid!, 'SIGTERM'); await new Promise<void>(resolve => child.on('exit',()=>resolve())); }
});
