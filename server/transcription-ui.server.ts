import { z } from 'zod';
import { logLimitHit } from './logger.server';
import { PreviewBusyError,previewAdmission,previewCache } from './page-preview.server';
import { ProviderError } from './transcription-provider.server';
import type { Hono } from 'hono';
import { pool } from './db/index.server';
import { authorize, DomainError } from './domain.server';
import { processingPaused } from './transcription.server';
import { BoundedPageRenderer } from './page-renderer.server';
/** Read models for the transcription UI. All sources remain capability gated. */
export function registerTranscriptionUi(app:Hono<{Variables:{user:{id:string;email:string;name:string}}}>) {
 app.get('/ensembles/:ensemble/transcriptions',async c=>{
  const e=c.req.param('ensemble');await authorize(pool,c.get('user').id,e,'transcribe');
  const query=z.object({cursor:z.string().optional()}).parse(c.req.query());
  let cursor:[string,string]|undefined;
  if(query.cursor){try{cursor=z.tuple([z.iso.datetime({offset:true}),z.string().min(1).max(200)]).parse(JSON.parse(Buffer.from(query.cursor,'base64url').toString()));if(!Number.isFinite(Date.parse(cursor[0])))throw Error();}catch{throw new DomainError('invalid_cursor',400);}}
  // Preserve the database's microsecond timestamp for the next cursor (JS Dates lose precision).
  const rows=(await pool.query(`select id,state,failure_reason,options,created_at,to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor_time,imported_piece_id from transcription_jobs where ensemble_id=$1 and imported_piece_id is null and ($2::timestamptz is null or (created_at,id)<($2::timestamptz,$3::text)) order by created_at desc,id desc limit 101`,[e,cursor?.[0]??null,cursor?.[1]??null])).rows;
  const jobs=rows.slice(0,100),last=jobs.at(-1);
  const nextCursor=rows.length>100?Buffer.from(JSON.stringify([last.cursor_time,last.id])).toString('base64url'):null;
  const pages=(await pool.query(`select p.job_id,p.page_number,p.source_page,p.state,p.failure_reason,p.object_id,s.content_type,s.original_filename from job_pages p join stored_objects s on s.id=p.object_id where p.job_id=any($1::text[]) order by p.page_number`,[jobs.map(j=>j.id)])).rows;
  const paused=await processingPaused();c.header('Cache-Control','no-store');return c.json({items:jobs.map(({cursor_time,...j})=>({...j,stage:paused&&['queued','running'].includes(j.state)?'processing_paused':j.state,pages:pages.filter(p=>p.job_id===j.id)})),nextCursor});
 });
 app.get('/ensembles/:ensemble/originals/:object/pages/:page',async c=>{
  const e=c.req.param('ensemble'),u=c.get('user').id;await authorize(pool,u,e,'transcribe');
  const s=(await pool.query("select * from stored_objects where id=$1 and ensemble_id=$2 and kind='original' and state='ready'",[c.req.param('object'),e])).rows[0];
  const page=Number(c.req.param('page'));if(!s||!Number.isInteger(page)||page<1||page>s.provenance.pages)throw new DomainError('not_found',404);
  const signal=AbortSignal.any([c.req.raw.signal,AbortSignal.timeout(20000)]),key=JSON.stringify([s.id,page,250]);
  let raster=previewCache.get(key);
  if(!raster){let slot;try{slot=await previewAdmission.take(u,signal);}catch(error){if(error instanceof PreviewBusyError)logLimitHit(error.limit,'server',error.value);throw new DomainError('render_busy',503);}
   try{raster=previewCache.get(key);if(!raster){const result=await new BoundedPageRenderer().render({objectKey:s.object_key,contentType:s.content_type,sourcePage:page,pageIndex:page-1},signal);raster=new Uint8Array(result.raster!);previewCache.set(key,raster);}}
   catch(error){if(error instanceof ProviderError)throw new DomainError(error.reason,503);throw error;}finally{slot.release();}
  }
  return new Response(new Uint8Array(raster),{headers:{'Content-Type':'image/png','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':'sandbox'}});
 });
}
