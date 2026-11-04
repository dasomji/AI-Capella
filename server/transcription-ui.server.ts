import { uploadAdmission } from './upload-admission.server';
import { ProviderError } from './transcription-provider.server';
import type { Hono } from 'hono';
import { pool } from './db/index.server';
import { authorize, DomainError, audit } from './domain.server';
import { processingPaused } from './transcription.server';
import { BoundedPageRenderer } from './page-renderer.server';
/** Read models for the transcription UI. All sources remain capability gated. */
export function registerTranscriptionUi(app:Hono<{Variables:{user:{id:string;email:string;name:string}}}>) {
 app.get('/ensembles/:ensemble/transcriptions',async c=>{
  const e=c.req.param('ensemble');await authorize(pool,c.get('user').id,e,'transcribe');
  const jobs=(await pool.query(`select id,state,failure_reason,options,created_at,imported_piece_id from transcription_jobs where ensemble_id=$1 order by created_at desc limit 100`,[e])).rows;
  const pages=(await pool.query(`select p.job_id,p.page_number,p.source_page,p.state,p.failure_reason,p.object_id,s.content_type,s.original_filename from job_pages p join stored_objects s on s.id=p.object_id where p.job_id=any($1::text[]) order by p.page_number`,[jobs.map(j=>j.id)])).rows;
  const paused=await processingPaused();c.header('Cache-Control','no-store');return c.json(jobs.map(j=>({...j,stage:paused&&['queued','running'].includes(j.state)?'processing_paused':j.state,pages:pages.filter(p=>p.job_id===j.id)})));
 });
 app.get('/ensembles/:ensemble/originals/:object/pages/:page',async c=>{
  const e=c.req.param('ensemble'),u=c.get('user').id;await authorize(pool,u,e,'transcribe');
  const s=(await pool.query("select * from stored_objects where id=$1 and ensemble_id=$2 and kind='original' and state='ready'",[c.req.param('object'),e])).rows[0];
  const page=Number(c.req.param('page'));if(!s||!Number.isInteger(page)||page<1||page>s.provenance.pages)throw new DomainError('not_found',404);
  await audit(pool,e,u,'original.access',s.id,{delivery:'page',page});
  const slot=uploadAdmission.take(u);if('code' in slot)throw new DomainError('upload_busy',slot.code);
  try {const result=await new BoundedPageRenderer().render({objectKey:s.object_key,contentType:s.content_type,sourcePage:page,pageIndex:page-1},AbortSignal.timeout(20000));
  return new Response(new Uint8Array(result.raster!),{headers:{'Content-Type':'image/png','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }catch(error){if(error instanceof ProviderError)throw new DomainError(error.reason,503);throw error;}finally{slot.release();}
 });
}
