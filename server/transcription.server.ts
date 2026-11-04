import { createHash, randomUUID } from 'node:crypto';
import { pool } from './db/index.server';
import { authorize, transaction, lockEnsemble, DomainError } from './domain.server';
import { env } from './env.server';
import { FakeProvider, ReferenceRenderer, FakeAssembler, ProviderError, type TranscriptionProvider, type PageRenderer, type JobAssembler, type PageResult } from './transcription-provider.server';
export const transcriptionClock={now:()=>new Date()};
export async function processingPaused(){return env.TRANSCRIPTION_EMERGENCY_STOP==='1' || !!(await pool.query('select paused from transcription_control where id=1')).rows[0]?.paused;}
export async function createJob(user:string,ensemble:string,key:string,objects:string[],options:Record<string,unknown>,provider:TranscriptionProvider=new FakeProvider()) {
 const requestHash=createHash('sha256').update(JSON.stringify({objects,options})).digest('hex');
 return transaction(async db=>{
 await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))',['transcription-user:'+user]);await lockEnsemble(db,ensemble);await authorize(db,user,ensemble,'transcribe');
 const old=(await db.query('select * from transcription_jobs where ensemble_id=$1 and user_id=$2 and request_key=$3',[ensemble,user,key])).rows[0];if(old){if(old.request_hash!==requestHash)throw new DomainError('idempotency_mismatch',409);return old;}
 const count=(await db.query("select count(*) filter(where user_id=$1)::int as own,count(*) filter(where ensemble_id=$2)::int as ensemble from transcription_jobs where state in ('queued','running')",[user,ensemble])).rows[0];
 if(count.own>=env.TRANSCRIPTION_USER_MAX || count.ensemble>=env.TRANSCRIPTION_ENSEMBLE_MAX)throw new DomainError('concurrency_limit',429);
 const sources=[];let pages=0;
 for(const id of objects){const s=(await db.query("select * from stored_objects where id=$1 and ensemble_id=$2 and kind='original' and state='ready'",[id,ensemble])).rows[0];if(!s)throw new DomainError('not_found',404);sources.push(s);pages+=s.provenance.pages;}
 if(!pages || pages>env.TRANSCRIPTION_MAX_PAGES || (sources.length>1 && sources.some(s=>s.content_type==='application/pdf')))throw new DomainError('page_limit',422);
 const job=(await db.query('insert into transcription_jobs(ensemble_id,user_id,request_key,request_hash,options,model,prompt_version,provenance) values($1,$2,$3,$4,$5,$6,$7,$8) returning *',[ensemble,user,key,requestHash,options,provider.model,provider.promptVersion,{sources:objects}])).rows[0];
 let index=0;for(const s of sources)for(let page=1;page<=s.provenance.pages;page++)await db.query('insert into job_pages(ensemble_id,job_id,object_id,page_number,source_page,model,prompt_version,provenance) values($1,$2,$3,$4,$5,$6,$7,$8)',[ensemble,job.id,s.id,index++,page,provider.model,provider.promptVersion,{sourceObject:s.id,sourcePage:page}]);
 return job;
 });
}
const progressListeners=new Set<(ensemble:string,job:string)=>Promise<void>>();
export function onTranscriptionProgress(fn:(ensemble:string,job:string)=>Promise<void>){progressListeners.add(fn);return ()=>{progressListeners.delete(fn);};}
async function emit(e:string,j:string){await pool.query("select pg_notify('transcription_progress',$1)",[JSON.stringify({ensemble:e,job:j})]);await Promise.all([...progressListeners].map(fn=>fn(e,j)));}
export async function jobView(user:string,e:string,id:string){await authorize(pool,user,e,'transcribe');const job=(await pool.query('select * from transcription_jobs where id=$1 and ensemble_id=$2',[id,e])).rows[0];if(!job)throw new DomainError('not_found',404);const pages=(await pool.query('select page_number,source_page,state,attempts,failure_reason,metrics from job_pages where job_id=$1 order by page_number',[id])).rows;return {...job,stage:await processingPaused() && ['queued','running'].includes(job.state)?'processing_paused':job.state,pages};}
export async function cancelJob(user:string,e:string,id:string){await transaction(async db=>{await authorize(db,user,e,'transcribe');const job=(await db.query('update transcription_jobs set state=\'cancelled\',failure_reason=\'cancelled\' where id=$1 and ensemble_id=$2 and state in (\'queued\',\'running\') returning id',[id,e])).rows[0];if(!job)throw new DomainError('invalid_state',409);await db.query("update job_pages set state='cancelled',failure_reason='cancelled',lease_owner=null,lease_expires_at=null where job_id=$1 and state!='completed'",[id]);});await emit(e,id);}
export async function retryJob(user:string,e:string,id:string){return transaction(async db=>{await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))',['transcription-user:'+user]);await lockEnsemble(db,e);await authorize(db,user,e,'transcribe');const j=(await db.query('select * from transcription_jobs where id=$1 and ensemble_id=$2 for update',[id,e])).rows[0];if(!j || !['failed','cancelled'].includes(j.state))throw new DomainError('invalid_state',409);const n=(await db.query("select count(*) filter(where user_id=$1)::int as own,count(*) filter(where ensemble_id=$2)::int as ensemble from transcription_jobs where state in ('queued','running')",[j.user_id,e])).rows[0];if(n.own>=env.TRANSCRIPTION_USER_MAX || n.ensemble>=env.TRANSCRIPTION_ENSEMBLE_MAX)throw new DomainError('concurrency_limit',429);await db.query("update job_pages set state='queued',attempts=0,failure_reason=null,next_attempt_at=$2,lease_owner=null,lease_expires_at=null where job_id=$1 and state!='completed'",[id,transcriptionClock.now()]);return (await db.query("update transcription_jobs set state='queued',failure_reason=null where id=$1 returning *",[id])).rows[0];});}
export class TranscriptionWorker {
 constructor(private provider:TranscriptionProvider=new FakeProvider(),private renderer:PageRenderer=new ReferenceRenderer(),private assembler:JobAssembler=new FakeAssembler()){}
 async tick():Promise<boolean>{
 if(await processingPaused())return false;
 const token=randomUUID();const now=transcriptionClock.now();
 const page=await transaction(async db=>{
 await db.query("select pg_advisory_xact_lock(17031504)");
 if((await db.query("select count(*)::int as n from job_pages where state='running' and lease_expires_at>$1",[now])).rows[0].n>=env.TRANSCRIPTION_WORKER_CONCURRENCY)return;
 const p=(await db.query(`select p.*,j.user_id,j.options,s.object_key,s.content_type from job_pages p join transcription_jobs j on j.id=p.job_id join stored_objects s on s.id=p.object_id where j.state in ('queued','running') and (p.state='queued' and p.next_attempt_at<=$1 or p.state='running' and p.lease_expires_at<=$1) and not exists(select 1 from job_pages prev where prev.job_id=p.job_id and prev.page_number<p.page_number and prev.state!='completed') order by j.created_at,p.page_number for update of p skip locked limit 1`,[now])).rows[0];
 if(!p)return;
 await db.query("update job_pages set state='running',lease_owner=$2,lease_expires_at=$3,attempts=attempts+1 where id=$1",[p.id,token,new Date(now.getTime()+env.TRANSCRIPTION_LEASE_MS)]);await db.query("update transcription_jobs set state='running',attempts=attempts+1 where id=$1",[p.job_id]);return p;
 });
 if(!page)return false;
 const abort=new AbortController();const timeout=setTimeout(()=>abort.abort(),env.TRANSCRIPTION_TIMEOUT_MS);
 const heartbeat=setInterval(()=>{void pool.query("update job_pages set lease_expires_at=$3 where id=$1 and lease_owner=$2 and state='running'",[page.id,token,new Date(transcriptionClock.now().getTime()+env.TRANSCRIPTION_LEASE_MS)]).catch(()=>abort.abort());},Math.max(250,env.TRANSCRIPTION_LEASE_MS/3));
 const started=Date.now();let result:PageResult|undefined;let failure:ProviderError|undefined;let paused=false;
 try {
 if(page.attempts>=env.TRANSCRIPTION_MAX_ATTEMPTS)throw new ProviderError('provider_timeout');
 await authorize(pool,page.user_id,page.ensemble_id,'transcribe').catch(()=>{throw new ProviderError('permission_revoked');});
 paused=await processingPaused();if(!paused){
 const input=await this.renderer.render({objectKey:page.object_key,contentType:page.content_type,sourcePage:page.source_page,pageIndex:page.page_number},abort.signal);
 await authorize(pool,page.user_id,page.ensemble_id,'transcribe').catch(()=>{throw new ProviderError('permission_revoked');});
 paused=await processingPaused();
 if(!paused){
 const context=(await pool.query("select metrics from job_pages where job_id=$1 and state='completed' order by page_number",[page.job_id])).rows.map(r=>r.metrics.result as PageResult);
 let timeoutReject:()=>void=()=>{};
 const deadline=new Promise<never>((_,reject)=>{timeoutReject=()=>reject(new ProviderError('provider_timeout',true));abort.signal.addEventListener('abort',timeoutReject,{once:true});if(abort.signal.aborted)timeoutReject();});
 try{result=await Promise.race([this.provider.transcribePage(input,context,page.options??{},abort.signal),deadline]);}finally{abort.signal.removeEventListener('abort',timeoutReject);}
 if(!result.musicxmlFragment.endsWith('</measure>'))throw new ProviderError(result.musicxmlFragment.startsWith('<measure')?'truncated':'invalid_output');
 }
 }
 }catch(error){failure=error instanceof ProviderError?error:new ProviderError('invalid_output');}
 finally{clearTimeout(timeout);clearInterval(heartbeat);}
 await transaction(async db=>{
 const p=(await db.query('select p.*,j.state as job_state from job_pages p join transcription_jobs j on j.id=p.job_id where p.id=$1 for update of p,j',[page.id])).rows[0];
 if(p.lease_owner!==token || p.state!=='running' || p.job_state==='cancelled')return;
 if(paused){await db.query("update job_pages set state='queued',failure_reason='emergency_stop',lease_owner=null,lease_expires_at=null where id=$1",[page.id]);return;}
 const reason=failure?.reason;const retry=failure?.retryable && p.attempts<env.TRANSCRIPTION_MAX_ATTEMPTS;
 const price=JSON.parse(env.TRANSCRIPTION_PRICE_TABLE)[this.provider.model]??{input:0,output:0};
 const metrics={latency:Date.now()-started,attempts:p.attempts,retries:p.attempts-1,usage:result?.usage,model:this.provider.model,promptVersion:this.provider.promptVersion,estimatedCost:((result?.usage.inputTokens??0)*price.input+(result?.usage.outputTokens??0)*price.output)/1000000,outcome:reason??'completed',result};
 await db.query('update job_pages set state=$2,failure_reason=$3,result_xml=$4,metrics=$5,next_attempt_at=$6,lease_owner=null,lease_expires_at=null where id=$1',[page.id,failure?(retry?'queued':'failed'):'completed',reason,result?.musicxmlFragment,metrics,new Date(transcriptionClock.now().getTime()+Math.min(60000,1000*2**p.attempts))]);
 if(failure && !retry)await db.query("update transcription_jobs set state='failed',failure_reason=$2 where id=$1",[page.job_id,reason]);
 });
 await this.assemble(page.job_id);await emit(page.ensemble_id,page.job_id);return true;
 }
 async assemble(id:string){
 // Assembly is repeatable: row lock makes the durable completion checkpoint unique.
 await transaction(async db=>{
 const j=(await db.query('select * from transcription_jobs where id=$1 for update',[id])).rows[0];if(!j || !['queued','running'].includes(j.state))return;
 const pages=(await db.query('select * from job_pages where job_id=$1 order by page_number',[id])).rows;if(!pages.length || pages.some(p=>p.state!=='completed'))return;
 try{await authorize(db,j.user_id,j.ensemble_id,'transcribe');}catch{await db.query("update transcription_jobs set state='failed',failure_reason='permission_revoked' where id=$1",[id]);return;}
 if(await processingPaused())return;
 const xml=await this.assembler.assemble(pages.map(p=>p.metrics.result));
 await db.query("update transcription_jobs set state='completed',result_xml=$2,metrics=$3 where id=$1",[id,xml,{pages:pages.length,attempts:pages.reduce((n,p)=>n+p.metrics.attempts,0),latency:pages.reduce((n,p)=>n+p.metrics.latency,0),estimatedCost:pages.reduce((n,p)=>n+p.metrics.estimatedCost,0)}]);
 });
 }
 async recoverAssembly(){for(const j of (await pool.query("select id from transcription_jobs where state in ('queued','running') and not exists(select 1 from job_pages where job_id=transcription_jobs.id and state!='completed')")).rows)await this.assemble(j.id);}
}
export async function transcriptionMetrics(from:Date,to:Date){return (await pool.query(`select model,prompt_version,state,count(*)::int as pages,sum(attempts)::int as attempts,sum((metrics->>'latency')::numeric) as latency,sum((metrics->>'estimatedCost')::numeric) as estimated_cost,sum((metrics->'usage'->>'inputTokens')::numeric) as input_tokens,sum((metrics->'usage'->>'outputTokens')::numeric) as output_tokens from job_pages where created_at >= $1 and created_at < $2 group by model,prompt_version,state`,[from,to])).rows;}
