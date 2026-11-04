import { createServer } from 'node:net';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { io } from 'socket.io-client';
const mailpit = process.env.MAILPIT_URL || 'http://127.0.0.1:28025';
async function availablePort(){const s=createServer();await new Promise<void>(r=>s.listen(0,'127.0.0.1',r));const port=(s.address() as {port:number}).port;await new Promise<void>(r=>s.close(()=>r()));return port;}
for (const mode of ['dev','start']) test(`${mode}: real npm command serves Start, auth and Socket.IO on one HTTP origin`, { timeout: 30000 }, async () => {
 const port = await availablePort(); const base = `http://localhost:${port}`;
 let child = spawn('npm', mode === 'dev' ? ['run','dev','--','--port',String(port)] : ['start'], { detached: true, env: { ...process.env, NODE_ENV:'test', PORT:String(port), BETTER_AUTH_URL:base, TRUSTED_ORIGINS:base, MAIL_TRANSPORT:'smtp' }, stdio:'pipe' });
 let logs = ''; child.stdout.on('data',v => { logs += v; }); child.stderr.on('data',v => { logs += v; });
 try {
  let ready = false;
  for (let i=0;i<100;i++) { try { ready = (await fetch(`${base}/readyz`)).ok; } catch {} if (ready) break; await delay(100); }
  assert.ok(ready,logs);
  const html = await fetch(base); assert.match(await html.text(),/LightScore/); assert.equal(html.headers.get('cache-control'),'no-store');
  assert.equal((await fetch(`${base}/_serverFn/fixture`,{method:'POST',body:'{}'})).status,403);
  if (mode === 'start') { const { readdir } = await import('node:fs/promises'); const asset = (await readdir((process.env.LIGHTSCORE_BUILD_ROOT ?? 'dist')+'/client/assets')).find(f=>f.endsWith('.js'))!; const response = await fetch(`${base}/assets/${asset}`); assert.equal(response.status,200); assert.match(response.headers.get('cache-control') ?? '', /immutable/); assert.equal((await fetch(`${base}/assets/${asset}.map`)).status,404); }
  const post = (path: string, body: unknown) => fetch(`${base}/api/auth/${path}`,{ method:'POST',headers:{origin:base,'Content-Type':'application/json'},body:JSON.stringify(body) });
  const email = `${mode}-${crypto.randomUUID()}@example.test`; const password = 'valid-singer-password-55';
  assert.equal((await post('sign-up/email',{ email,password,name:'Host singer',callbackURL:base })).status,200);
  let list: any; for (let i=0;i<100;i++) { list = await (await fetch(`${mailpit}/api/v1/messages`)).json(); if (list.messages.some((m: any) => m.To.some((to: any) => to.Address === email))) break; await delay(50); }
  const mail = list.messages.find((m: {To: {Address: string}[]}) => m.To.some(to => to.Address === email)); assert.ok(mail);
  const message = await (await fetch(`${mailpit}/api/v1/message/${mail.ID}`)).json();
  const link = message.Text.match(/http[^\s]+/)[0]; await fetch(link,{redirect:'manual'});
  assert.equal((await post('verify-email-password',{token:new URL(link).searchParams.get('token'),password})).status,200);
  const signedIn = await post('sign-in/email',{ email,password }); assert.equal(signedIn.status,200,await signedIn.clone().text());
  const cookie = signedIn.headers.getSetCookie().map(v => v.split(';')[0]).join('; ');
  assert.equal((await fetch(`${base}/app`,{headers:{cookie}})).status,200);
  if(mode==='start') {
   const api=async(path:string,body:unknown)=>{const r=await fetch(base+'/api/'+path,{method:'POST',headers:{cookie,origin:base,'content-type':'application/json'},body:JSON.stringify(body)});assert.ok(r.ok,await r.clone().text());return r.json();};
   const e=await api('ensembles',{name:'Restart fixture'});
   const body={title:'Long',parts:[{id:'v',name:'Voice'}],notes:[{partId:'v',midi:60,startBeat:0,durationBeats:400,measureNumber:1}],measures:[{number:1,startBeat:0,beats:4,beatType:4,fifths:0}],slurs:[],totalBeats:400,rehearsalMarks:[],tempo:120};
   const upload=await fetch(base+`/api/ensembles/${e.id}/pieces`,{method:'POST',headers:{cookie,origin:base,'content-type':'application/json','x-score-title':'Long'},body:JSON.stringify(body)});assert.ok(upload.ok,await upload.clone().text());const piece=await upload.json();
   const open=async()=>{const c=io(base+'/rehearsal',{forceNew:true,extraHeaders:{cookie,origin:base},transports:['websocket'],reconnection:false});await new Promise<void>((r,j)=>{c.once('connect',r);c.once('connect_error',j);});return c;};
   let c=await open();
   const emit=(event:string,input:unknown)=>new Promise<any>((r,j)=>c.timeout(5000).emit(event,input,(err:any,v:any)=>err?j(err):r(v)));
   await emit('rehearsal:join',{ensembleId:e.id});
   for(const [i,command] of [{type:'selectPiece',pieceId:piece.id,versionNo:1},{type:'play'}].entries())assert.equal((await emit('rehearsal:command',{ensembleId:e.id,commandId:crypto.randomUUID(),clientSentAt:Date.now(),baseRevision:i,command})).status,'accepted');
   const before=(await emit('rehearsal:snapshot',{ensembleId:e.id})).state;c.close();
   process.kill(-child.pid!,'SIGTERM');await new Promise<void>(r=>child.once('exit',()=>r()));
   child=spawn('npm',['start'],{detached:true,env:{...process.env,NODE_ENV:'test',PORT:String(port),BETTER_AUTH_URL:base,TRUSTED_ORIGINS:base,MAIL_TRANSPORT:'smtp'},stdio:'pipe'});child.stdout.on('data',v=>{logs+=v;});child.stderr.on('data',v=>{logs+=v;});
   let restarted=false;for(let i=0;i<100;i++){try{restarted=(await fetch(base+'/readyz')).ok;}catch{}if(restarted)break;await delay(100);}assert.ok(restarted,logs);
   c=await open();try{const after=(await emit('rehearsal:join',{ensembleId:e.id})).state;assert.equal(after.status,'paused');assert.equal(after.revision,before.revision+1);assert.ok(Math.abs(after.anchor.beat-Math.max(0,after.updatedAt-before.anchor.serverTime)/500)<0.01);assert.equal(after.endsAt,null);}finally{c.close();}
  }
  const socket = io(`${base}/rehearsal`,{extraHeaders:{cookie,origin:base},transports:['polling'],reconnection:false,timeout:3000});
  try { await new Promise<void>((resolve,reject) => { socket.on('connect',resolve); socket.on('connect_error',reject); }); } finally { socket.close(); }
 } finally { process.kill(-child.pid!, 'SIGTERM'); await new Promise<void>(resolve => child.on('exit',()=>resolve())); }
});

test('standby admits HTTP while rehearsal ownership remains unavailable', {timeout:30000},async()=>{
 const {default:pg}=await import('pg');const owner=new pg.Client({connectionString:process.env.DATABASE_URL});await owner.connect();
 assert.equal((await owner.query('select pg_try_advisory_lock(714083,1) as locked')).rows[0].locked,true);
 const standbyPort=await availablePort();const base='http://localhost:'+standbyPort;const child=spawn('npm',['start'],{detached:true,env:{...process.env,NODE_ENV:'test',PORT:String(standbyPort),BETTER_AUTH_URL:base,TRUSTED_ORIGINS:base,MAIL_TRANSPORT:'smtp'},stdio:'pipe'});
 let logs='';child.stdout.on('data',v=>logs+=v);child.stderr.on('data',v=>logs+=v);
 try{
  let response:Response|undefined;
  for(let i=0;i<100;i++){try{response=await fetch(base+'/readyz');if(response.ok)break;}catch{}await delay(100);}
  assert.ok(response?.ok,logs);assert.equal((await response.json()).rehearsal,false);
  const rehearsal=await fetch(base+'/readyz/rehearsal');assert.equal(rehearsal.status,503);assert.equal(rehearsal.headers.get('cache-control'),'no-store');
 }finally{process.kill(-child.pid!,'SIGTERM');await new Promise<void>(r=>child.once('exit',()=>r()));await owner.end();}
});
