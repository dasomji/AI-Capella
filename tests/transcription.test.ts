import {
  ensembleSchema,
  memberSchema,
  invitationSchema,
  metadataSchema,
} from "../src/api/domain";
import { test, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { io as connect } from "socket.io-client";
process.env.NODE_ENV = "test";
process.env.MAIL_TRANSPORT = "capture";
process.env.PORT = (process.env.TEST_APP_PORT ?? "23001");
process.env.BETTER_AUTH_URL = `http://localhost:${process.env.PORT}`;
process.env.TRUSTED_ORIGINS = `http://localhost:${process.env.PORT}`;
process.env.TZ = "America/New_York";
const { server, io } = await import("../server/start");
const { pool } = await import("../server/db/index.server");
afterEach(async()=>{
 // Each scenario owns its jobs; unfinished projection/admission fixtures must not
 // become work claimed by the next scenario's worker.
 await pool.query("update job_pages set state='cancelled',lease_owner=null,lease_expires_at=null where state in ('queued','running')");
 await pool.query("update transcription_jobs set state='cancelled' where state in ('queued','running')");
});

const { captureMail } = await import("../server/mail.server");
const { clock } = await import("../server/domain-http.server");
const base = process.env.BETTER_AUTH_URL;
after(async () => {
  await new Promise<void>((r) => io.close(() => r()));
  server.close();
  await pool.end();
});
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  cookie = "",
) {
  const input = body as any;
  const upload = method === "POST" && /\/pieces(?:\/[^/]+\/versions)?$/.test(path) && input?.content;
  return fetch(base + "/api/" + path, {
    method,
    headers: { ...(method==='POST' && /\/transcriptions$/.test(path)?{'idempotency-key':crypto.randomUUID()}:{}), origin: base, cookie, "Content-Type": upload && input.content.format === "musicxml" ? "text/xml" : "application/json",
      ...(upload && input.title ? {"x-score-title":encodeURIComponent(input.title)} : {}),
      ...(upload && input.idempotencyKey ? {"idempotency-key":input.idempotencyKey} : {}),
      ...(upload && input.expectedRevision ? {"x-expected-revision":String(input.expectedRevision)} : {}) },
    body: upload ? (input.content.format === "musicxml" ? input.content.body : JSON.stringify(input.content.body)) : body === undefined ? undefined : JSON.stringify(body),
  });
}
async function ok(path: string, method = "GET", body?: unknown, cookie = "") {
  const r = await request(path, method, body, cookie);
  assert.ok(r.ok, `${method} ${path}: ${r.status} ${await r.clone().text()}`);
  const data = await r.json();
  for (const value of Array.isArray(data) ? data : [data]) {
    if (value?.membershipId) ensembleSchema.parse(value);
    else if (value?.userId && value?.capabilities) memberSchema.parse(value);
    else if (value?.deliveryState) invitationSchema.parse(value);
    else if (value?.contentHash && value?.settings) metadataSchema.parse(value);
  }
  return data;
}
async function register(
  email = `${crypto.randomUUID()}@example.test`,
  callbackURL = base + "/?state=verified",
) {
  const password = "domain-fixture-password-42";
  const response = await ok("auth/sign-up/email", "POST", {
    email,
    password,
    name: "Singer",
    callbackURL,
  });
  for (
    let n = 0;
    n < 100 && !captureMail.messages.some((m) => m.to === email && m.text.includes("/api/auth/verify-email?"));
    n++
  )
    await delay(10);
  const link = captureMail.messages
    .filter((m) => m.to === email && m.text.includes("/api/auth/verify-email?"))
    .at(-1)!
    .text.match(/https?:\/\/\S+/)![0];
  return { email, password, response, link };
}
async function signin(a: { email: string; password: string }) {
  const r = await request("auth/sign-in/email", "POST", a);
  assert.equal(r.status, 200, await r.clone().text());
  const cookie = r.headers
    .getSetCookie()
    .map((s) => s.split(";")[0])
    .join("; ");
  const user = await ok("me", "GET", undefined, cookie);
  return { cookie, id: user.user.id, email: a.email };
}
async function account() {
  const a = await register();
  await ok("auth/verify-email-password", "POST", {token:new URL(a.link).searchParams.get("token"),password:a.password});
  return signin(a);
}

const { S3Client,CreateBucketCommand,ListObjectsV2Command,DeleteObjectsCommand,DeleteBucketCommand }=await import('@aws-sdk/client-s3');
const {PDFDocument}=await import('pdf-lib');
const sharp=(await import('sharp')).default;
const {TranscriptionWorker,transcriptionClock}=await import('../server/transcription.server');
const {FakeProvider}=await import('../server/transcription-provider.server');
const {sourceLimits,cleanupDerived,cleanupObjects}=await import('../server/originals.server');
const {env}=await import('../server/env.server');
const s3=new S3Client({endpoint:env.S3_ENDPOINT,region:env.S3_REGION,forcePathStyle:true,credentials:{accessKeyId:env.S3_ACCESS_KEY_ID!,secretAccessKey:env.S3_SECRET_ACCESS_KEY!}});
await s3.send(new CreateBucketCommand({Bucket:env.S3_BUCKET}));
after(async()=>{const objects=await s3.send(new ListObjectsV2Command({Bucket:env.S3_BUCKET}));if(objects.Contents?.length)await s3.send(new DeleteObjectsCommand({Bucket:env.S3_BUCKET,Delete:{Objects:objects.Contents.map(o=>({Key:o.Key!}))}}));await s3.send(new DeleteBucketCommand({Bucket:env.S3_BUCKET}));s3.destroy();});
async function upload(e:string,cookie:string,bytes:Uint8Array){return fetch(base+'/api/ensembles/'+e+'/originals',{method:'POST',headers:{origin:base,cookie,'x-original-filename':'score.png'},body:bytes as BodyInit});}
const png=await sharp({create:{width:16,height:16,channels:3,background:'white'}}).png().toBuffer();
async function setup(){const lead=await account();const e=await ok('ensembles','POST',{name:'Transcription fixture',kind:'choir'},lead.cookie);const r=await upload(e.id,lead.cookie,png);assert.equal(r.status,201,await r.clone().text());return {lead,e,source:await r.json()};}
async function job(e:string,cookie:string,source:string,key=crypto.randomUUID()){const r=await fetch(base+`/api/ensembles/${e}/transcriptions`,{method:'POST',headers:{origin:base,cookie,'content-type':'application/json','idempotency-key':key},body:JSON.stringify({sourceObjects:[source]})});assert.equal(r.status,201,await r.clone().text());return r.json();}
async function view(e:string,cookie:string,j:string){return ok(`ensembles/${e}/transcriptions/${j}`,'GET',undefined,cookie);}
test('private originals validate content and bounds, dedupe, authorize and audit access',async()=>{
 const {lead,e,source}=await setup();const outsider=await account();
 assert.equal((await upload(e.id,lead.cookie,Buffer.from('not an image'))).status,422);
 const limit=sourceLimits.photo;sourceLimits.photo=10;try{assert.equal((await upload(e.id,lead.cookie,png)).status,413);}finally{sourceLimits.photo=limit;}
 const pixels=sourceLimits.pixels;sourceLimits.pixels=10;try{assert.equal((await upload(e.id,lead.cookie,png)).status,422);}finally{sourceLimits.pixels=pixels;}
 const pdf=await PDFDocument.create();pdf.addPage();pdf.addPage();const pages=sourceLimits.pages;sourceLimits.pages=1;try{assert.equal((await upload(e.id,lead.cookie,await pdf.save())).status,422);}finally{sourceLimits.pages=pages;}
 const again=await upload(e.id,lead.cookie,png);assert.equal((await again.json()).id,source.id);
 const path=`ensembles/${e.id}/originals/${source.id}`;
 assert.equal((await request(path,'GET',undefined,outsider.cookie)).status,404);
 assert.equal((await request(`ensembles/${e.id}/originals/guessed-key`,'GET',undefined,lead.cookie)).status,404);
 const streamed=await request(path,'GET',undefined,lead.cookie);assert.deepEqual(Buffer.from(await streamed.arrayBuffer()),png);
 const signed=await fetch(base+'/api/'+path+'?signed=1',{headers:{cookie:lead.cookie},redirect:'manual'});assert.equal(signed.status,302);const url=new URL(signed.headers.get('location')!);assert.equal(url.searchParams.get('X-Amz-Expires'),'60');assert.equal((await fetch(url)).status,200);
 assert.equal((await pool.query("select count(*)::int n from audit_events where target_id=$1 and action='original.access'",[source.id])).rows[0].n,2);
});
test('durable jobs complete, immutable destination and concurrent import creates one validated piece',async()=>{
 const {lead,e,source}=await setup();const key=crypto.randomUUID();const j=await job(e.id,lead.cookie,source.id,key);assert.equal((await job(e.id,lead.cookie,source.id,key)).id,j.id);
 const worker=new TranscriptionWorker();assert.equal(await worker.tick(),true);const done=await view(e.id,lead.cookie,j.id);assert.equal(done.state,'completed');assert.equal(done.pages[0].state,'completed');
 const other=await ok('ensembles','POST',{name:'Other',kind:'band'},lead.cookie);assert.equal((await request(`ensembles/${other.id}/transcriptions/${j.id}`,'GET',undefined,lead.cookie)).status,404);
 const imports=await Promise.all(Array.from({length:4},()=>ok(`ensembles/${e.id}/transcriptions/${j.id}/import`,'POST',{},lead.cookie)));assert.equal(new Set(imports.map(p=>p.id)).size,1);assert.equal(imports[0].ensembleId,e.id);
 const v=(await pool.query('select timing from score_versions where piece_id=$1',[imports[0].id])).rows[0];assert.ok(v.timing);
});
test('failure reasons, bounded automatic retry and explicit retry preserves complete pages',async()=>{
 const {lead,e,source}=await setup();
 for(const reason of ['provider_refusal','provider_timeout','rate_limited','invalid_output','truncated'] as const){
 const j=await job(e.id,lead.cookie,source.id);const worker=new TranscriptionWorker(new FakeProvider(()=>reason));
 for(let n=0;n<env.TRANSCRIPTION_MAX_ATTEMPTS;n++){await pool.query('update job_pages set next_attempt_at=$2 where job_id=$1',[j.id,new Date(0)]);await worker.tick();}
 const state=await view(e.id,lead.cookie,j.id);assert.equal(state.state,'failed');assert.equal(state.failure_reason,reason);assert.equal(state.pages[0].attempts,['provider_timeout','rate_limited'].includes(reason)?3:1);
 await ok(`ensembles/${e.id}/transcriptions/${j.id}/retry`,'POST',{},lead.cookie);await new TranscriptionWorker().tick();assert.equal((await view(e.id,lead.cookie,j.id)).state,'completed');
 }
 const second=await sharp({create:{width:17,height:16,channels:3,background:'white'}}).png().toBuffer();const src=await (await upload(e.id,lead.cookie,second)).json();
 const j=await ok(`ensembles/${e.id}/transcriptions`,'POST',{sourceObjects:[source.id,src.id]},lead.cookie);
 const worker=new TranscriptionWorker(new FakeProvider(p=>p.pageIndex===1?'provider_refusal':'success'));await worker.tick();await worker.tick();
 const completed=(await pool.query('select id,attempts from job_pages where job_id=$1 and state=\'completed\'',[j.id])).rows[0];
 await ok(`ensembles/${e.id}/transcriptions/${j.id}/retry`,'POST',{},lead.cookie);await new TranscriptionWorker().tick();assert.equal((await view(e.id,lead.cookie,j.id)).state,'completed');assert.equal((await pool.query('select attempts from job_pages where id=$1',[completed.id])).rows[0].attempts,completed.attempts);
});
test('cancel and emergency pause retain work, revocation prevents provider invocation, cleanup retains originals',async()=>{
 const {lead,e,source}=await setup();const j=await job(e.id,lead.cookie,source.id);
 await pool.query('insert into transcription_control(id,paused) values(1,true) on conflict(id) do update set paused=true');assert.equal(await new TranscriptionWorker().tick(),false);assert.equal((await view(e.id,lead.cookie,j.id)).stage,'processing_paused');
 await pool.query('update transcription_control set paused=false');await ok(`ensembles/${e.id}/transcriptions/${j.id}/cancel`,'POST',{},lead.cookie);assert.equal(await new TranscriptionWorker().tick(),false);
 await ok(`ensembles/${e.id}/transcriptions/${j.id}/retry`,'POST',{},lead.cookie);
 const successor=await account();await pool.query('insert into memberships(ensemble_id,user_id,is_lead) values($1,$2,true)',[e.id,successor.id]);
 await pool.query('update memberships set is_lead=false where ensemble_id=$1 and user_id=$2',[e.id,lead.id]);let calls=0;await new TranscriptionWorker(new FakeProvider(()=>{calls++;return 'success';})).tick();assert.equal(calls,0);assert.equal((await pool.query('select failure_reason from transcription_jobs where id=$1',[j.id])).rows[0].failure_reason,'permission_revoked');
 assert.equal((await request(`ensembles/${e.id}/originals/${source.id}`,'GET',undefined,lead.cookie)).status,404);
 await pool.query('update memberships set is_lead=true where ensemble_id=$1',[e.id]);
 await pool.query("insert into stored_objects(ensemble_id,object_key,kind,size,content_type,sha256,provenance,state,created_at) values($1,$2,'derived',1,'text/plain','derived','{}','ready',$3)",[e.id,`ensembles/${e.id}/derived/test`,new Date(0)]);
 const liveKey=(await pool.query('select object_key from stored_objects where id=$1',[source.id])).rows[0].object_key;await pool.query("insert into object_deletions(object_key,created_at) values($1,$2) on conflict do nothing",[liveKey,new Date(0)]);
 assert.equal(await cleanupDerived(new Date()),1);await pool.query("update object_deletions set created_at=$1",[new Date(0)]);await cleanupObjects();assert.equal((await request(`ensembles/${e.id}/originals/${source.id}`,'GET',undefined,lead.cookie)).status,200);
});
test('worker process death recovers expired leases under a frozen non-UTC clock',async()=>{
 const {spawn}=await import('node:child_process');const {lead,e,source}=await setup();const j=await job(e.id,lead.cookie,source.id);
 const child=spawn(process.execPath,['--import','tsx','--input-type=module','-e',`import {TranscriptionWorker} from './server/transcription.server.ts';import {FakeProvider} from './server/transcription-provider.server.ts';await new TranscriptionWorker(new FakeProvider(()=> 'success',60000)).tick();`],{cwd:process.cwd(),env:process.env,stdio:'pipe'});
 let errors='';child.stderr.on('data',c=>{errors+=c;});
 const exited=new Promise(resolve=>child.once('exit',resolve));
 try{
 for(let i=0;i<150;i++){const p=(await pool.query('select state from job_pages where job_id=$1',[j.id])).rows[0];if(p.state==='running' && (await pool.query('select 1 from provider_calls where job_id=$1',[j.id])).rowCount)break;await delay(20);}
 assert.equal((await pool.query('select state from job_pages where job_id=$1',[j.id])).rows[0].state,'running',errors);
 child.kill('SIGKILL');await exited;
 await pool.query("update job_pages set lease_expires_at=now()-interval '1 second' where job_id=$1",[j.id]);const now=transcriptionClock.now;transcriptionClock.now=()=>new Date(Date.now()+600000);
 try{await new TranscriptionWorker().tick();}finally{transcriptionClock.now=now;}
 const done=await view(e.id,lead.cookie,j.id);assert.equal(done.state,'completed');assert.equal(done.pages[0].attempts,2);assert.equal((await pool.query("select outcome from provider_calls where job_id=$1 order by started_at",[j.id])).rows[0].outcome,'abandoned');
 }finally{child.kill('SIGKILL');await exited;}
});
test('transcribe-only access cannot import, edit-only can import, and job admission limits persist',async()=>{
 const {lead,e,source}=await setup();const member=await account();await pool.query('insert into memberships(ensemble_id,user_id,ai_transcription) values($1,$2,true)',[e.id,member.id]);
 const j=await job(e.id,member.cookie,source.id);await new TranscriptionWorker().tick();
 assert.equal((await request(`ensembles/${e.id}/transcriptions/${j.id}/import`,'POST',{},member.cookie)).status,403);
 await pool.query('update memberships set ai_transcription=false,edit_music_pieces=true where ensemble_id=$1 and user_id=$2',[e.id,member.id]);
 assert.equal((await request(`ensembles/${e.id}/transcriptions/${j.id}`,'GET',undefined,member.cookie)).status,403);
 assert.equal((await request(`ensembles/${e.id}/transcriptions/${j.id}/import`,'POST',{},member.cookie)).status,200);
 const active=[];for(let i=0;i<env.TRANSCRIPTION_USER_MAX;i++)active.push(await job(e.id,lead.cookie,source.id));
 
 const r=await fetch(base+`/api/ensembles/${e.id}/transcriptions`,{method:'POST',headers:{origin:base,cookie:lead.cookie,'content-type':'application/json','idempotency-key':crypto.randomUUID()},body:JSON.stringify({sourceObjects:[source.id]})});assert.equal(r.status,429);
 for(const a of active)await ok(`ensembles/${e.id}/transcriptions/${a.id}/cancel`,'POST',{},lead.cookie);
});
test('signed GET expires and in-flight cancellation fences the page checkpoint',async()=>{
 const {storage}=await import('../server/storage.server');const {lead,e,source}=await setup();
 const key=(await pool.query('select object_key from stored_objects where id=$1',[source.id])).rows[0].object_key;
 const url=await storage().signedGet(key,1);assert.equal((await fetch(url)).status,200);await delay(2100);assert.equal((await fetch(url)).status,403);
 const j=await job(e.id,lead.cookie,source.id);const work=new TranscriptionWorker(new FakeProvider(()=> 'success',300)).tick();
 for(let i=0;i<50;i++){if((await view(e.id,lead.cookie,j.id)).pages[0].state==='running')break;await delay(10);}
 await ok(`ensembles/${e.id}/transcriptions/${j.id}/cancel`,'POST',{},lead.cookie);await work;const state=await view(e.id,lead.cookie,j.id);assert.equal(state.state,'cancelled');assert.equal(state.pages[0].state,'cancelled');
});
test('permission revoked between pages prevents the next provider call and ensemble admission is bounded',async()=>{
 const {lead,e,source}=await setup();const member=await account();await pool.query('insert into memberships(ensemble_id,user_id,ai_transcription) values($1,$2,true)',[e.id,member.id]);
 const j=await ok(`ensembles/${e.id}/transcriptions`,'POST',{sourceObjects:[source.id,source.id]},member.cookie);let calls=0;const worker=new TranscriptionWorker(new FakeProvider(()=>{calls++;return 'uncertain';}));await worker.tick();
 await pool.query('update memberships set ai_transcription=false where ensemble_id=$1 and user_id=$2',[e.id,member.id]);await worker.tick();assert.equal(calls,1);assert.equal((await view(e.id,lead.cookie,j.id)).failure_reason,'permission_revoked');
 await pool.query('update memberships set ai_transcription=true where ensemble_id=$1 and user_id=$2',[e.id,member.id]);
 const active=[];for(let i=0;i<2;i++){active.push(await job(e.id,lead.cookie,source.id));active.push(await job(e.id,member.cookie,source.id));}
 const third=await account();await pool.query('insert into memberships(ensemble_id,user_id,ai_transcription) values($1,$2,true)',[e.id,third.id]);
 const r=await fetch(base+`/api/ensembles/${e.id}/transcriptions`,{method:'POST',headers:{origin:base,cookie:third.cookie,'content-type':'application/json','idempotency-key':crypto.randomUUID()},body:JSON.stringify({sourceObjects:[source.id]})});assert.equal(r.status,429);
 for(const a of active)await ok(`ensembles/${e.id}/transcriptions/${a.id}/cancel`,'POST',{},lead.cookie);
});
test('sysadmin stop and metrics APIs enforce platform role, and sole-member closure deletes originals',async()=>{
 const {lead,e,source}=await setup();
 assert.equal((await request('admin/transcription/control','PUT',{paused:true},lead.cookie)).status,404);
 await pool.query("insert into platform_roles(user_id) values($1)",[lead.id]);
 assert.equal((await ok('admin/transcription/control','PUT',{paused:true},lead.cookie)).paused,true);
 const j=await job(e.id,lead.cookie,source.id);assert.equal(await new TranscriptionWorker().tick(),false);
 await ok('admin/transcription/control','PUT',{paused:false},lead.cookie);env.TRANSCRIPTION_EMERGENCY_STOP='1';try{assert.equal(await new TranscriptionWorker().tick(),false);}finally{env.TRANSCRIPTION_EMERGENCY_STOP='0';}await new TranscriptionWorker().tick();assert.equal((await view(e.id,lead.cookie,j.id)).state,'completed');
 const range='admin/transcription/metrics?from=2000-01-01T00:00:00Z&to=2100-01-01T00:00:00Z';const metrics=await ok(range,'GET',undefined,lead.cookie);assert.ok(metrics.some((r:any)=>r.model==='fake-transcription-v1'));
 const key=(await pool.query('select object_key from stored_objects where id=$1',[source.id])).rows[0].object_key;
 await ok('account','DELETE',{deleteEnsembleIds:[e.id]},lead.cookie);assert.equal((await pool.query('select 1 from stored_objects where id=$1',[source.id])).rowCount,0);assert.equal((await pool.query('select 1 from object_deletions where object_key=$1',[key])).rowCount,1);
 await pool.query('update object_deletions set created_at=$2 where object_key=$1',[key,new Date(0)]);await cleanupObjects();
 const {storage}=await import('../server/storage.server');await assert.rejects(()=>storage().head(key));
});
test('durable progress notifications reach only current transcribers on authenticated sockets',async()=>{
 const {lead,e,source}=await setup();const ordinary=await account();await pool.query('insert into memberships(ensemble_id,user_id,ai_transcription) values($1,$2,true)',[e.id,ordinary.id]);
 const sockets:ReturnType<typeof connect>[]=[];
 try{
 for(const user of [lead,ordinary]){
 const socket=connect(base,{transports:['websocket'],extraHeaders:{cookie:user.cookie,origin:base}});sockets.push(socket);
 await new Promise<void>((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);});
 const ack=await socket.timeout(2000).emitWithAck('ensemble:join',e.id);assert.equal(ack.ok,true);
 }
 let ordinaryEvents=0;sockets[1].on('transcription:progress',()=>ordinaryEvents++);
 await pool.query('update memberships set ai_transcription=false where ensemble_id=$1 and user_id=$2',[e.id,ordinary.id]);
 const j=await job(e.id,lead.cookie,source.id);
 const received=new Promise<any>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('missing progress notification')),3000);sockets[0].once('transcription:progress',data=>{clearTimeout(timer);resolve(data);});});
 await new TranscriptionWorker().tick();const progress=await received;assert.equal(progress.jobId,j.id);assert.equal(progress.state,'completed');assert.equal(progress.pages[0].state,'completed');await delay(100);assert.equal(ordinaryEvents,0);
 }finally{for(const socket of sockets)socket.disconnect();}
});
test('sandbox bounds PDF object-stream bombs without growing API memory',async()=>{
 const {createDeflate}=await import('node:zlib');const once=(emitter:any,event:string)=>new Promise<void>((resolve,reject)=>{const done=()=>{emitter.removeListener('error',reject);resolve();};emitter.once(event,done);emitter.once('error',reject);});
 const {writeFile,mkdtemp,rm}=await import('node:fs/promises');const {inspectSource}=await import('../server/originals.server');
 const dir=await mkdtemp('.transcription-tmp/bomb-');
 try{for(const mb of [512,2048]){
 const zip=createDeflate({level:9});const chunks:Buffer[]=[];zip.on('data',c=>chunks.push(c));
 zip.write('10 0 ');const block=Buffer.alloc(1024*1024,32);
 for(let i=0;i<mb;i++)if(!zip.write(block))await once(zip,'drain');
 zip.end('<< /Type /Catalog /Pages 3 0 R >>');await once(zip,'end');const compressed=Buffer.concat(chunks);
 const path=dir+'/'+mb+'.pdf';await writeFile(path,Buffer.concat([Buffer.from(`%PDF-1.5\n4 0 obj\n<< /Type /ObjStm /N 1 /First 5 /Length ${compressed.length} /Filter /FlateDecode >>\nstream\n`),compressed,Buffer.from('\nendstream\nendobj\n1 0 obj\n<< /Type /Catalog /Pages 3 0 R >>\nendobj\n3 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\ntrailer\n<< /Root 1 0 R /Size 5 >>\n%%EOF\n')]));
 const rss=process.memoryUsage().rss;const start=Date.now();let peak=rss;const sample=setInterval(()=>{peak=Math.max(peak,process.memoryUsage().rss);},10);
 try{await assert.rejects(()=>inspectSource(path),(e:any)=>e.code==='source_too_complex');}finally{clearInterval(sample);}
 assert.ok(peak-rss<100*1024*1024);assert.ok(Date.now()-start<12000);
 }}finally{await rm(dir,{recursive:true,force:true});}
});
test('cancel aborts provider and retains its independent ledger entry',async()=>{
 const {lead,e,source}=await setup();const j=await job(e.id,lead.cookie,source.id);
 let entered!:()=>void;const ready=new Promise<void>(r=>entered=r);let aborted=false;
 const provider=new FakeProvider();provider.transcribePage=async(_i,_c,_o,signal)=>{entered();return new Promise((_r,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(new Error('aborted'));},{once:true}));};
 const work=new TranscriptionWorker(provider).tick();await ready;
 await ok(`ensembles/${e.id}/transcriptions/${j.id}/cancel`,'POST',{},lead.cookie);await work;
 assert.equal(aborted,true);const calls=(await pool.query('select * from provider_calls where job_id=$1',[j.id])).rows;assert.equal(calls.length,1);assert.ok(calls[0].finished_at);
});
test('transient authorization infrastructure error retries exactly once then succeeds',async()=>{
 const {lead,e,source}=await setup();const j=await job(e.id,lead.cookie,source.id);
 const original=pool.query;let injected=false;
 (pool as any).query=function(...args:any[]){if(!injected && typeof args[0]==='string' && args[0].includes('from memberships')){injected=true;return Promise.reject(new Error('connection terminated'));}return (original as any).apply(pool,args);};
 try{await new TranscriptionWorker().tick();}finally{pool.query=original;}
 const failed=await view(e.id,lead.cookie,j.id);assert.equal(failed.pages[0].failure_reason,'infrastructure_error');assert.equal(failed.pages[0].state,'queued');assert.equal(failed.pages[0].attempts,1);
 await pool.query("update job_pages set next_attempt_at=now() where job_id=$1",[j.id]);await new TranscriptionWorker().tick();assert.equal((await view(e.id,lead.cookie,j.id)).state,'completed');
});
test('assembly poison fails only its job and recovery proceeds',async()=>{
 const {lead,e,source}=await setup();const bad=await job(e.id,lead.cookie,source.id);const good=await job(e.id,lead.cookie,source.id);
 await new TranscriptionWorker(new FakeProvider(),undefined,{assemble:async()=>{throw Error('poison');}}).tick();
 assert.equal((await view(e.id,lead.cookie,bad.id)).failure_reason,'assembly_failed');
 await new TranscriptionWorker().recoverAssembly();await new TranscriptionWorker().tick();assert.equal((await view(e.id,lead.cookie,good.id)).state,'completed');
});
test('job projection excludes source internals and large result fragments',async()=>{
 const {lead,e,source}=await setup();const j=await ok(`ensembles/${e.id}/transcriptions`,'POST',{sourceObjects:Array(60).fill(source.id)},lead.cookie);
 await pool.query("update transcription_jobs set result_xml=$2 where id=$1",[j.id,'x'.repeat(100000)]);
 await pool.query("update job_pages set metrics=$2,result_xml=$3 where job_id=$1",[j.id,{result:'x'.repeat(100000)},'x'.repeat(100000)]);
 const projection=await view(e.id,lead.cookie,j.id);assert.ok(JSON.stringify(projection).length<20000);
 for(const key of ['result_xml','request_hash','options','provenance'])assert.equal(key in projection,false);
 assert.equal('metrics' in projection.pages[0],false);
});
test('worker wall clock skew cannot steal a live database lease',async()=>{
 const {lead,e,source}=await setup();const j=await job(e.id,lead.cookie,source.id);
 await pool.query("update job_pages set state='running',lease_owner='other',lease_expires_at=now()+interval '5 minutes' where job_id=$1",[j.id]);
 const original=transcriptionClock.now;try{for(const delta of [-600000,600000]){transcriptionClock.now=()=>new Date(Date.now()+delta);assert.equal(await new TranscriptionWorker().tick(),false);}}finally{transcriptionClock.now=original;}
 await ok(`ensembles/${e.id}/transcriptions/${j.id}/cancel`,'POST',{},lead.cookie);
});
test('result downloads are inert attachments and shared validation rejects active XML',async()=>{
 const {validateScore}=await import('../server/score-validation.server');
 for(const xml of ['<!DOCTYPE score-partwise><score-partwise/>','<!DOCTYPE x [<!ENTITY a "x">]><score-partwise/>','<html><script/></html>'])await assert.rejects(()=>validateScore(xml,'musicxml'));
 const {lead,e,source}=await setup();const j=await job(e.id,lead.cookie,source.id);await new TranscriptionWorker().tick();
 const r=await request(`ensembles/${e.id}/transcriptions/${j.id}/result`,'GET',undefined,lead.cookie);
 assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'application/octet-stream');assert.match(r.headers.get('content-disposition')!,/^attachment/);assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert.equal(r.headers.get('content-security-policy'),"sandbox; default-src 'none'");
});
test('slow object upload never holds the ensemble transaction lock',async()=>{
 const {uploadOriginal}=await import('../server/originals.server');const {transaction,lockEnsemble}=await import('../server/domain.server');const {lead,e}=await setup();
 const photo=await sharp({create:{width:19,height:19,channels:3,background:'red'}}).png().toBuffer();
 let entered!:()=>void,release!:()=>void;const ready=new Promise<void>(r=>entered=r);const gate=new Promise<void>(r=>release=r);
 const {storage}=await import('../server/storage.server');const store=storage();
 const put=store.put.bind(store);const wrapped={put:async(...args:Parameters<typeof put>)=>{entered();await gate;await put(...args);}};
 const upload=uploadOriginal(lead.id,e.id,new ReadableStream({start(c){c.enqueue(photo);c.close();}}),'safe.png',{...wrapped} as any);
 try{await ready;await Promise.race([transaction(db=>lockEnsemble(db,e.id)),delay(1000).then(()=>{throw Error('upload held ensemble lock');})]);}finally{release();await upload;}
});
test('unsupported image formats, animation, truncated PDFs and mixed sources have distinct codes',async()=>{
 const {lead,e,source}=await setup();
 for(const brand of ['heic','heif','avif']){const r=await upload(e.id,lead.cookie,Buffer.from(`\0\0\0\x18ftyp${brand}\0\0\0\0${brand}`));assert.equal((await r.json()).code,'unsupported_image_format');}
 const r=await upload(e.id,lead.cookie,Buffer.from('%PDF-1.7\ntruncated'));assert.equal((await r.json()).code,'invalid_source');
 const pdf=await PDFDocument.create();pdf.addPage();const p=await (await upload(e.id,lead.cookie,await pdf.save())).json();
 const mixed=await request(`ensembles/${e.id}/transcriptions`,'POST',{sourceObjects:[p.id,source.id]},lead.cookie);assert.equal((await mixed.json()).code,'mixed_sources');
});
test('authorized retrier becomes the billable actor after initiator revocation',async()=>{
 const {lead,e,source}=await setup();const member=await account();await pool.query('insert into memberships(ensemble_id,user_id,ai_transcription) values($1,$2,true)',[e.id,member.id]);
 const j=await job(e.id,member.cookie,source.id);await ok(`ensembles/${e.id}/transcriptions/${j.id}/cancel`,'POST',{},lead.cookie);
 await pool.query('update memberships set ai_transcription=false where ensemble_id=$1 and user_id=$2',[e.id,member.id]);
 await ok(`ensembles/${e.id}/transcriptions/${j.id}/retry`,'POST',{},lead.cookie);await new TranscriptionWorker().tick();assert.equal((await view(e.id,lead.cookie,j.id)).state,'completed');
});
test('cleanup failure cannot block transcription ticks',async()=>{
 const {maintainTranscription}=await import('../server/transcription.server');const {lead,e,source}=await setup();const j=await job(e.id,lead.cookie,source.id);const worker=new TranscriptionWorker();
 await maintainTranscription(worker,async()=>{throw Error('cleanup unavailable');});await worker.tick();assert.equal((await view(e.id,lead.cookie,j.id)).state,'completed');
});
test('lease theft retains both provider calls and fences stale output',async()=>{
 const {lead,e,source}=await setup();const j=await job(e.id,lead.cookie,source.id);let entered!:()=>void,release!:()=>void;
 const ready=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>release=r);const provider=new FakeProvider();const transcribe=provider.transcribePage.bind(provider);
 provider.transcribePage=async(i,c,o,_signal)=>{entered();await gate;const value=await transcribe(i,c,o,new AbortController().signal);return {...value,musicxmlFragment:value.musicxmlFragment.replace('</measure>','<!--stale--></measure>')};};
 const first=new TranscriptionWorker(provider).tick();await ready;
 await pool.query("update job_pages set lease_expires_at=now()-interval '1 second' where job_id=$1",[j.id]);await new TranscriptionWorker().tick();release();await first;
 const calls=(await pool.query('select * from provider_calls where job_id=$1',[j.id])).rows;assert.equal(calls.length,2);assert.ok(calls.every(c=>c.finished_at));assert.equal((await view(e.id,lead.cookie,j.id)).state,'completed');assert.doesNotMatch((await pool.query('select result_xml from job_pages where job_id=$1',[j.id])).rows[0].result_xml,/stale/);
});
test('emergency pause aborts in-flight calls without spending an attempt',async()=>{
 const {lead,e,source}=await setup();const j=await job(e.id,lead.cookie,source.id);let entered!:()=>void;const ready=new Promise<void>(r=>entered=r);const provider=new FakeProvider();
 provider.transcribePage=async(_i,_c,_o,signal)=>{entered();return new Promise((_r,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}));};
 const work=new TranscriptionWorker(provider).tick();await ready;env.TRANSCRIPTION_EMERGENCY_STOP='1';try{await work;}finally{env.TRANSCRIPTION_EMERGENCY_STOP='0';}
 const p=(await view(e.id,lead.cookie,j.id)).pages[0];assert.equal(p.state,'queued');assert.equal(p.attempts,0);await new TranscriptionWorker().tick();
});
test('parallel uploads dedupe and cross-ensemble/idempotency mismatches fail',async()=>{
 const {lead,e,source}=await setup();const same=await Promise.all([upload(e.id,lead.cookie,png),upload(e.id,lead.cookie,png)]);assert.deepEqual(await Promise.all(same.map(async r=>(await r.json()).id)),[source.id,source.id]);
 const other=await ok('ensembles','POST',{name:'Other',kind:'band'},lead.cookie);
 assert.equal((await request(`ensembles/${other.id}/transcriptions`,'POST',{sourceObjects:[source.id]},lead.cookie)).status,404);
 const key=crypto.randomUUID();await job(e.id,lead.cookie,source.id,key);
 const r=await fetch(base+`/api/ensembles/${e.id}/transcriptions`,{method:'POST',headers:{origin:base,cookie:lead.cookie,'content-type':'application/json','idempotency-key':key},body:JSON.stringify({sourceObjects:[source.id],options:{language:'de'}})});assert.equal(r.status,409);
});
test('polyglot image trailers and storage ceiling are rejected',async()=>{
 const {lead,e}=await setup();const poly=await upload(e.id,lead.cookie,Buffer.concat([png,Buffer.from('<html/>')]));assert.equal(poly.status,422);
 const limit=env.TRANSCRIPTION_STORAGE_MAX_BYTES;env.TRANSCRIPTION_STORAGE_MAX_BYTES=1;
 try{const photo=await sharp({create:{width:23,height:23,channels:3,background:'blue'}}).png().toBuffer();const r=await upload(e.id,lead.cookie,photo);assert.equal((await r.json()).code,'storage_limit');}finally{env.TRANSCRIPTION_STORAGE_MAX_BYTES=limit;}
});
test('animated WebP and encrypted PDF are explicitly rejected',async()=>{
 const {lead,e}=await setup();const raw=Buffer.alloc(16*32*3);raw.fill(255,16*16*3);
 const animated=await sharp(raw,{raw:{width:16,height:32,channels:3,pageHeight:16} as any}).webp({loop:0,delay:[100,100]}).toBuffer();
 assert.equal((await (await upload(e.id,lead.cookie,animated)).json()).code,'animated_image');
 const doc=await PDFDocument.create();doc.addPage();const encrypted=Buffer.from(await doc.save({useObjectStreams:false})).toString('latin1').replace('trailer\n<<','trailer\n<< /Encrypt 1 0 R');
 assert.equal((await (await upload(e.id,lead.cookie,Buffer.from(encrypted,'latin1'))).json()).code,'encrypted_pdf');
});
test('upload idle deadline expires a stalled body',async()=>{
 const {uploadOriginal}=await import('../server/originals.server');const {lead,e}=await setup();const idle=sourceLimits.idleMs;sourceLimits.idleMs=30;
 try{await assert.rejects(()=>uploadOriginal(lead.id,e.id,new ReadableStream({start(c){c.enqueue(png.subarray(0,8));}}),'idle.png',{} as any),(e:any)=>e.code==='upload_timeout');}finally{sourceLimits.idleMs=idle;}
});
test('parallel claim race invokes the provider only once for a page',async()=>{
 const {lead,e,source}=await setup();const j=await job(e.id,lead.cookie,source.id);let calls=0;const worker=new TranscriptionWorker(new FakeProvider(()=>{calls++;return 'success';},50));await Promise.all(Array.from({length:8},()=>worker.tick()));assert.equal(calls,1);assert.equal((await view(e.id,lead.cookie,j.id)).state,'completed');
});
test('worker refuses a model/prompt pin it does not serve',async()=>{
 const {createJob}=await import('../server/transcription.server');const {lead,e,source}=await setup();const provider=new FakeProvider();provider.model='unserved';
 const j=await createJob(lead.id,e.id,crypto.randomUUID(),[source.id],{},provider);await new TranscriptionWorker().tick();assert.equal((await view(e.id,lead.cookie,j.id)).failure_reason,'model_unavailable');assert.equal((await pool.query('select 1 from provider_calls where job_id=$1',[j.id])).rowCount,0);
});
test('inspection child inherits hard address/CPU limits and cannot open sockets',async()=>{
 const {spawnSync}=await import('node:child_process');
 const r=spawnSync('python3',['server/inspection-sandbox.py',process.execPath,'--jitless','--max-old-space-size=192','--input-type=module','-e',`import net from 'node:net';import fs from 'node:fs';const limits=fs.readFileSync('/proc/self/limits','utf8');if(!/Max address space\\s+1610612736\\s+1610612736/.test(limits)||!/Max cpu time\\s+5\\s+6/.test(limits))process.exit(2);net.createConnection({host:'127.0.0.1',port:9}).on('connect',()=>process.exit(3)).on('error',e=>process.exit(e.code==='EPERM'?0:4));`],{timeout:3000,encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
});
