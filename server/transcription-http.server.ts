import type { Hono } from 'hono';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { pool } from './db/index.server';
import { authorize, audit, DomainError, transaction } from './domain.server';
import { uploadOriginal } from './originals.server';
import { storage } from './storage.server';
import { uploadAdmission as slots } from './upload-admission.server';
import { env } from './env.server';
import { createJob,jobView,jobResult,cancelJob,retryJob,processingPaused,transcriptionMetrics } from './transcription.server';
export function registerTranscriptionRoutes(app:Hono<{Variables:{user:{id:string;email:string;name:string}}}>) {
 app.post('/ensembles/:ensemble/originals',async c=>{
 const slot=slots.take(c.get('user').id);if('code' in slot)return c.json({code:'upload_busy'},slot.code);
 try{if(!c.req.raw.body)throw new DomainError('empty_source',422);const result=await uploadOriginal(c.get('user').id,c.req.param('ensemble'),c.req.raw.body,c.req.header('x-original-filename')??'original');return c.json({id:result.id,contentType:result.content_type,size:result.size,sha256:result.sha256,pages:result.provenance.pages},201);}finally{slot.release();}
 });
 app.get('/ensembles/:ensemble/originals/:object',async c=>{
 const e=c.req.param('ensemble'),u=c.get('user').id;
 try{await authorize(pool,u,e,'transcribe');}catch{throw new DomainError('not_found',404);}
 const s=(await pool.query("select * from stored_objects where id=$1 and ensemble_id=$2 and kind='original' and state='ready'",[c.req.param('object'),e])).rows[0];if(!s)throw new DomainError('not_found',404);
 await audit(pool,e,u,'original.access',s.id,{delivery:c.req.query('signed')==='1'?'signed':'stream'});
 if(c.req.query('signed')==='1')return c.redirect(await storage().signedGet(s.object_key,60));
 const stream=await storage().get(s.object_key);return new Response(Readable.toWeb(stream) as ReadableStream,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="original"','Content-Length':String(s.size),'Cache-Control':'no-store','Content-Security-Policy':"sandbox; default-src 'none'"}});
 });
 app.post('/ensembles/:ensemble/transcriptions',async c=>{
 const body=z.object({sourceObjects:z.array(z.string().min(1)).min(1).max(60),options:z.object({language:z.enum(['de','en']).optional()}).default({})}).strict().parse(await c.req.json());
 const key=z.string().min(1).max(200).parse(c.req.header('idempotency-key'));
 const job=await createJob(c.get('user').id,c.req.param('ensemble'),key,body.sourceObjects,body.options);return c.json({id:job.id,state:job.state,stage:await processingPaused()?'processing_paused':job.state},201);
 });
 app.get('/ensembles/:ensemble/transcriptions/:job',async c=>c.json(await jobView(c.get('user').id,c.req.param('ensemble'),c.req.param('job'))));
 app.get('/ensembles/:ensemble/transcriptions/:job/result',async c=>{const xml=await jobResult(c.get('user').id,c.req.param('ensemble'),c.req.param('job'));return c.body(xml,200,{'Content-Type':'application/xml','Cache-Control':'no-store'});});
 app.post('/ensembles/:ensemble/transcriptions/:job/cancel',async c=>{await cancelJob(c.get('user').id,c.req.param('ensemble'),c.req.param('job'));return c.json({state:'cancelled'});});
 app.post('/ensembles/:ensemble/transcriptions/:job/retry',async c=>c.json(await retryJob(c.get('user').id,c.req.param('ensemble'),c.req.param('job'))));
 app.put('/admin/transcription/control',async c=>{
 const input=z.object({paused:z.boolean()}).strict().parse(await c.req.json());
 await transaction(async db=>{if(!(await db.query("select 1 from platform_roles where user_id=$1 and role='sysadmin'",[c.get('user').id])).rowCount)throw new DomainError('not_found',404);await db.query('insert into transcription_control(id,paused) values(1,$1) on conflict(id) do update set paused=$1,updated_at=now()',[input.paused]);await db.query("insert into audit_events(actor_id,action,outcome,metadata) values($1,'transcription.control','ok',$2)",[c.get('user').id,input]);});return c.json({paused:await processingPaused()});
 });
 app.get('/admin/transcription/metrics',async c=>{if(!(await pool.query("select 1 from platform_roles where user_id=$1 and role='sysadmin'",[c.get('user').id])).rowCount)throw new DomainError('not_found',404);const from=z.iso.datetime({offset:true}).parse(c.req.query('from')),to=z.iso.datetime({offset:true}).parse(c.req.query('to'));if(new Date(from).getTime()>=new Date(to).getTime())throw new DomainError('invalid_range',422);return c.json(await transcriptionMetrics(new Date(from),new Date(to)));});
}
