import { assembleOffThread } from './assembly-worker.server';
import { estimatedCost,priceTable } from './transcription-cost';
import { OpenAITranscriptionProvider } from './openai-provider.server';
import { BoundedPageRenderer } from './page-renderer.server';
import { ScoreAssembler,validatePage } from './score-assembly.server';
import { createHash, randomUUID } from 'node:crypto';
import { pool } from './db/index.server';
import { authorize, transaction, lockEnsemble, DomainError } from './domain.server';
import { validateScore } from './score-validation.server';
import { logError } from './logger.server';
import { env } from './env.server';
import { FakeProvider, ReferenceRenderer, FakeAssembler, ProviderError, type TranscriptionProvider, type PageRenderer, type JobAssembler, type PageResult } from './transcription-provider.server';
const defaultProvider=()=>env.NODE_ENV==='test'?new FakeProvider():new OpenAITranscriptionProvider();
export async function processingPaused(){return env.TRANSCRIPTION_EMERGENCY_STOP==='1' || !!(await pool.query('select paused from transcription_control where id=1')).rows[0]?.paused;}
export async function createJob(user:string,ensemble:string,key:string,objects:string[],options:Record<string,unknown>,provider:TranscriptionProvider=defaultProvider()) {
 const requestHash=createHash('sha256').update(JSON.stringify({objects,options})).digest('hex');
 return transaction(async db=>{
 await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))',['transcription-user:'+user]);await lockEnsemble(db,ensemble);await authorize(db,user,ensemble,'transcribe');
 const old=(await db.query('select * from transcription_jobs where ensemble_id=$1 and user_id=$2 and request_key=$3',[ensemble,user,key])).rows[0];if(old){if(old.request_hash!==requestHash)throw new DomainError('idempotency_mismatch',409);return old;}
 const count=(await db.query("select count(*) filter(where started_by=$1)::int as own,count(*) filter(where ensemble_id=$2)::int as ensemble from transcription_jobs where state in ('queued','running')",[user,ensemble])).rows[0];
 if(count.own>=env.TRANSCRIPTION_USER_MAX || count.ensemble>=env.TRANSCRIPTION_ENSEMBLE_MAX)throw new DomainError('concurrency_limit',429);
 const sources=[];let pages=0;
 for(const id of objects){const s=(await db.query("select * from stored_objects where id=$1 and ensemble_id=$2 and kind='original' and state='ready'",[id,ensemble])).rows[0];if(!s)throw new DomainError('not_found',404);sources.push(s);pages+=s.provenance.pages;}
 if(sources.length>1 && sources.some(s=>s.content_type==='application/pdf'))throw new DomainError('mixed_sources',422);
 if(!pages || pages>env.TRANSCRIPTION_MAX_PAGES)throw new DomainError('page_limit',422);
 const job=(await db.query('insert into transcription_jobs(started_by,ensemble_id,user_id,request_key,request_hash,options,model,prompt_version,provenance) values($2,$1,$2,$3,$4,$5,$6,$7,$8) returning *',[ensemble,user,key,requestHash,options,provider.model,provider.promptVersion,{sources:objects,promptSha256:provider.promptSha256??null}])).rows[0];
 let index=0;for(const s of sources)for(let page=1;page<=s.provenance.pages;page++)await db.query('insert into job_pages(ensemble_id,job_id,object_id,page_number,source_page,model,prompt_version,provenance) values($1,$2,$3,$4,$5,$6,$7,$8)',[ensemble,job.id,s.id,index++,page,provider.model,provider.promptVersion,{sourceObject:s.id,sourcePage:page}]);
 return job;
 });
}
async function emit(e:string,j:string){await pool.query("select pg_notify('transcription_progress',$1)",[JSON.stringify({ensemble:e,job:j})]);}
export async function jobProgress(e:string,id:string){const job=(await pool.query('select id,state,failure_reason,model,prompt_version,created_at,imported_piece_id from transcription_jobs where id=$1 and ensemble_id=$2',[id,e])).rows[0];if(!job)throw new DomainError('not_found',404);const pages=(await pool.query('select page_number,source_page,state,attempts,failure_reason from job_pages where job_id=$1 order by page_number',[id])).rows;return {...job,stage:await processingPaused() && ['queued','running'].includes(job.state)?'processing_paused':job.state,pages};}
export async function jobView(user:string,e:string,id:string){await authorize(pool,user,e,'transcribe');return jobProgress(e,id);}
export async function jobResult(user:string,e:string,id:string){await authorize(pool,user,e,'transcribe');const j=(await pool.query('select state,result_xml from transcription_jobs where id=$1 and ensemble_id=$2',[id,e])).rows[0];if(!j)throw new DomainError('not_found',404);if(j.state!=='completed')throw new DomainError('result_unavailable',409);return j.result_xml as string;}
export async function jobReport(user:string,e:string,id:string){
 await authorize(pool,user,e,'transcribe');const row=(await pool.query('select provenance from transcription_jobs where id=$1 and ensemble_id=$2',[id,e])).rows[0];if(!row)throw new DomainError('not_found',404);
 return {measures:row.provenance?.measures??[],validation:row.provenance?.validation??null};
}
export async function cancelJob(user:string,e:string,id:string){await transaction(async db=>{await authorize(db,user,e,'transcribe');const job=(await db.query('update transcription_jobs set state=\'cancelled\',failure_reason=\'cancelled\' where id=$1 and ensemble_id=$2 and state in (\'queued\',\'running\') returning id',[id,e])).rows[0];if(!job)throw new DomainError('invalid_state',409);await db.query("update job_pages set state='cancelled',failure_reason='cancelled',lease_owner=null,lease_expires_at=null where job_id=$1 and state!='completed'",[id]);await db.query("update provider_calls c set outcome='abandoned',error_kind='cancelled',finished_at=now(),usage=coalesce(usage,'{}') || jsonb_build_object('usage_unknown',true) where job_id=$1 and outcome='running' and not exists(select 1 from job_pages p where p.lease_owner=c.lease_owner and p.state='running' and p.lease_expires_at>now())",[id]);});await emit(e,id);}
export async function retryJob(user:string,e:string,id:string){const provider:TranscriptionProvider=defaultProvider();const result=await transaction(async db=>{const owner=(await db.query('select user_id from transcription_jobs where id=$1 and ensemble_id=$2',[id,e])).rows[0];if(!owner)throw new DomainError('not_found',404);await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))',['transcription-user:'+user]);await lockEnsemble(db,e);await authorize(db,user,e,'transcribe');const j=(await db.query('select * from transcription_jobs where id=$1 and ensemble_id=$2 for update',[id,e])).rows[0];if(!j || !['failed','cancelled'].includes(j.state))throw new DomainError('invalid_state',409);const n=(await db.query("select count(*) filter(where started_by=$1)::int as own,count(*) filter(where ensemble_id=$2)::int as ensemble from transcription_jobs where state in ('queued','running')",[user,e])).rows[0];if(n.own>=env.TRANSCRIPTION_USER_MAX || n.ensemble>=env.TRANSCRIPTION_ENSEMBLE_MAX)throw new DomainError('concurrency_limit',429);await db.query("update job_pages set state='queued',attempts=0,failure_reason=null,result_xml=null,metrics=null,model=$3,prompt_version=$4,next_attempt_at=now(),lease_owner=null,lease_expires_at=null where job_id=$1 and (state!='completed' or $2)",[id,j.model!==provider.model||j.prompt_version!==provider.promptVersion||['assembly_failed','invalid_output'].includes(j.failure_reason),provider.model,provider.promptVersion]);return (await db.query("update transcription_jobs set state='queued',failure_reason=null,result_xml=null,model=$3,prompt_version=$4,provenance=(provenance-'assemblyAttempts'-'assemblyRetryAt') || jsonb_build_object('promptSha256',$5::text),started_by=$2 where id=$1 returning id,state",[id,user,provider.model,provider.promptVersion,provider.promptSha256??null])).rows[0];});await emit(e,id);return result;}
export class TranscriptionWorker {
 constructor(private provider:TranscriptionProvider=defaultProvider(),private renderer:PageRenderer=provider instanceof FakeProvider?new ReferenceRenderer():new BoundedPageRenderer(),private assembler:JobAssembler=provider instanceof FakeProvider?new FakeAssembler():new ScoreAssembler()){}
 async tick():Promise<boolean>{
 if(await processingPaused())return false;
 const token=randomUUID();
 const page=await transaction(async db=>{
 await db.query("select pg_advisory_xact_lock(17031504)");
 if((await db.query("select count(*)::int as n from job_pages where state='running' and lease_expires_at>now()")).rows[0].n>=env.TRANSCRIPTION_WORKER_CONCURRENCY)return;
 const p=(await db.query(`select p.*,j.started_by as user_id,j.options,j.model as job_model,j.prompt_version as job_prompt,s.object_key,s.content_type from job_pages p join transcription_jobs j on j.id=p.job_id join stored_objects s on s.id=p.object_id where j.model=$1 and j.prompt_version=$2 and j.state in ('queued','running') and (p.state='queued' and p.next_attempt_at<=now() or p.state='running' and p.lease_expires_at<=now()) and not exists(select 1 from job_pages prev where prev.job_id=p.job_id and prev.page_number<p.page_number and prev.state not in ('completed','skipped')) order by j.created_at,p.page_number for update of j skip locked limit 1`,[this.provider.model,this.provider.promptVersion])).rows[0];
 if(!p)return;
 if(p.state==='running')await db.query("update provider_calls set outcome='abandoned',error_kind='lease_expired',finished_at=now() where lease_owner=$1 and outcome='running'",[p.lease_owner]);
 if(p.attempts>=env.TRANSCRIPTION_MAX_ATTEMPTS){await db.query("update job_pages set state='failed',failure_reason='abandoned',lease_owner=null,lease_expires_at=null where id=$1",[p.id]);await db.query("update transcription_jobs set state='failed',failure_reason='abandoned' where id=$1",[p.job_id]);return;}

 await db.query("update job_pages set state='running',lease_owner=$2,lease_expires_at=now()+$3*interval '1 millisecond',attempts=attempts+1 where id=$1",[p.id,token,env.TRANSCRIPTION_LEASE_MS]);await db.query("update transcription_jobs set state='running',attempts=attempts+1 where id=$1",[p.job_id]);return p;
 });
 if(!page)return false;
 const abort=new AbortController();const timeout=setTimeout(()=>abort.abort(),env.TRANSCRIPTION_TIMEOUT_MS);
 const heartbeat=setInterval(()=>{void (async()=>{
 const r=await pool.query("update job_pages p set lease_expires_at=now()+$3*interval '1 millisecond' from transcription_jobs j where p.id=$1 and p.lease_owner=$2 and p.state='running' and p.lease_expires_at>now() and j.id=p.job_id and j.state='running' returning p.id",[page.id,token,env.TRANSCRIPTION_LEASE_MS]);
 if(!r.rowCount)abort.abort();
 if(await processingPaused()){paused=true;abort.abort();}
 })().catch(()=>abort.abort());},Math.min(250,Math.max(25,env.TRANSCRIPTION_LEASE_MS/3)));

 const started=Date.now();let result:PageResult|undefined;let failure:ProviderError|undefined;let paused=false;
 try {
 if(page.job_model!==this.provider.model || page.job_prompt!==this.provider.promptVersion)throw new ProviderError('model_unavailable');
 if(page.attempts>=env.TRANSCRIPTION_MAX_ATTEMPTS)throw new ProviderError('abandoned');
 await authorize(pool,page.user_id,page.ensemble_id,'transcribe').catch(error=>{if(error instanceof DomainError && [403,404].includes(error.status))throw new ProviderError('permission_revoked');throw error;});
 paused=await processingPaused();if(!paused){
 const input=await this.renderer.render({objectKey:page.object_key,contentType:page.content_type,sourcePage:page.source_page,pageIndex:page.page_number},abort.signal);
 await authorize(pool,page.user_id,page.ensemble_id,'transcribe').catch(error=>{if(error instanceof DomainError && [403,404].includes(error.status))throw new ProviderError('permission_revoked');throw error;});
 paused=await processingPaused();
 if(!paused){
 const context=(await pool.query("select metrics,result_xml from job_pages where job_id=$1 and state='completed' order by page_number",[page.job_id])).rows.map(r=>({musicxmlFragment:r.result_xml,uncertainties:r.metrics?.uncertainties??[],usage:r.metrics?.usage??{inputTokens:0,outputTokens:0},promptVersion:page.job_prompt,flags:r.metrics?.flags??[],model:page.job_model,latency:r.metrics?.latency??0}) as PageResult);
 let timeoutReject:()=>void=()=>{};
 const deadline=new Promise<never>((_,reject)=>{timeoutReject=()=>reject(new ProviderError('provider_timeout',true));abort.signal.addEventListener('abort',timeoutReject,{once:true});if(abort.signal.aborted)timeoutReject();});
 await pool.query('insert into provider_calls(job_id,page_id,attempt,lease_owner,model,prompt_version,prompt_sha256) values($1,$2,$3,$4,$5,$6,$7)',[page.job_id,page.id,page.attempts+1,token,this.provider.model,this.provider.promptVersion,this.provider.promptSha256??null]);
 const call=Promise.resolve().then(()=>this.provider.transcribePage(input,context,page.options??{},abort.signal)).then(async value=>{
 const prices=priceTable(env.TRANSCRIPTION_PRICE_TABLE);
 await pool.query("update provider_calls set finished_at=now(),outcome='completed',usage=$2,estimated_cost=$3,error_kind=null where lease_owner=$1",[token,{...value.usage,requestId:value.requestId},estimatedCost(this.provider.model,value.usage,prices)]);return value;
 },async error=>{await pool.query("update provider_calls set finished_at=now(),outcome='failed',error_kind=$2,usage=$3,estimated_cost=$4 where lease_owner=$1",[token,error instanceof ProviderError?error.reason:'infrastructure_error',error instanceof ProviderError?{...error.usage,requestId:error.requestId,usage_unknown:!error.usage}:{usage_unknown:true},error instanceof ProviderError&&error.usage?estimatedCost(this.provider.model,error.usage,priceTable(env.TRANSCRIPTION_PRICE_TABLE)):null]);throw error;});
 try{result=await Promise.race([call,deadline]);}catch(error){await pool.query("update provider_calls set finished_at=now(),outcome='failed',error_kind=$2,usage=coalesce(usage,'{}') || jsonb_build_object('usage_unknown',true) where lease_owner=$1 and outcome='running'",[token,error instanceof ProviderError?error.reason:'infrastructure_error']);throw error;}finally{abort.signal.removeEventListener('abort',timeoutReject);}

 if(!(this.provider instanceof FakeProvider))validatePage(result,context);
 if(this.provider instanceof FakeProvider && !result.musicxmlFragment.endsWith('</measure>'))throw new ProviderError(result.musicxmlFragment.startsWith('<measure')?'truncated':'invalid_output');
 }
 }
 }catch(error){failure=error instanceof ProviderError?error:new ProviderError('infrastructure_error',true);}
 finally{clearTimeout(timeout);clearInterval(heartbeat);}
 await transaction(async db=>{
 await db.query('select id from transcription_jobs where id=$1 for update',[page.job_id]);
 const p=(await db.query('select p.*,j.state as job_state from job_pages p join transcription_jobs j on j.id=p.job_id where p.id=$1 for update of p',[page.id])).rows[0];
 if(!p || p.lease_owner!==token || p.state!=='running' || p.job_state==='cancelled')return;
 if(paused){await db.query("update job_pages set state='queued',attempts=greatest(0,attempts-1),failure_reason='emergency_stop',lease_owner=null,lease_expires_at=null where id=$1",[page.id]);return;}
 const reason=failure?.reason;const retry=(failure?.reason==='invalid_output'?p.attempts<2:failure?.retryable) && p.attempts<env.TRANSCRIPTION_MAX_ATTEMPTS;
 const prices=priceTable(env.TRANSCRIPTION_PRICE_TABLE);
 const history=[...(p.metrics?.history??[]),{latency:Date.now()-started,usage:result?.usage??failure?.usage??{inputTokens:0,outputTokens:0},outcome:reason??'completed',model:this.provider.model,promptVersion:this.provider.promptVersion}];
 const usage=history.reduce((sum,item)=>({inputTokens:sum.inputTokens+item.usage.inputTokens,outputTokens:sum.outputTokens+item.usage.outputTokens}),{inputTokens:0,outputTokens:0});
 const metrics={history,latency:history.reduce((sum,item)=>sum+item.latency,0),attempts:history.length,retries:history.length-1,usage,model:this.provider.model,promptVersion:this.provider.promptVersion,estimatedCost:estimatedCost(this.provider.model,usage,prices),outcome:reason??'completed',uncertainties:result?.uncertainties??[],flags:result?.flags??[],requestId:result?.requestId??failure?.requestId};
 await db.query(`update job_pages set state=$2,failure_reason=$3,result_xml=$4,metrics=$5,next_attempt_at=now()+$6*interval '1 millisecond',lease_owner=null,lease_expires_at=null where id=$1`,[page.id,failure?(retry?'queued':'failed'):(result?.flags?.includes('no_music')?'skipped':'completed'),reason,result?.musicxmlFragment,metrics,Math.max(failure?.retryAfterMs??0,Math.min(60000,1000*2**p.attempts))]);
 if(failure && !retry)await db.query("update transcription_jobs set state='failed',failure_reason=$2 where id=$1",[page.job_id,reason]);
 });
 await this.assemble(page.job_id);await refreshMetrics(page.job_id);await emit(page.ensemble_id,page.job_id);return true;
 }
 async assemble(id:string){
 try{await this.assembleJob(id);}catch(error){logError('transcription.assembly',error);const retry=!(error instanceof ProviderError) && (!(error instanceof DomainError)||['validation_busy','validation_timeout'].includes(error.code));await pool.query(`update transcription_jobs set state=case when $2 and coalesce((provenance->>'assemblyAttempts')::int,0)<3 then 'running' else 'failed' end,failure_reason='assembly_failed',provenance=coalesce(provenance,'{}') || jsonb_build_object('assemblyAttempts',coalesce((provenance->>'assemblyAttempts')::int,0)+1,'assemblyRetryAt',now()+interval '5 seconds'*power(2,coalesce((provenance->>'assemblyAttempts')::int,0))) where id=$1 and state in ('queued','running')`,[id,retry]);}
 }
 private async assembleJob(id:string){
 // Expensive work precedes the short, fenced completion transaction.
 const db=pool;
 const j=(await db.query('select * from transcription_jobs where id=$1',[id])).rows[0];if(!j || !['queued','running'].includes(j.state))return;if(j.provenance?.assemblyRetryAt && new Date(j.provenance.assemblyRetryAt).getTime()>Date.now())return;
 if(j.model!==this.provider.model || j.prompt_version!==this.provider.promptVersion)return;
 const pages=(await db.query('select * from job_pages where job_id=$1 order by page_number',[id])).rows;if(!pages.length || pages.some(p=>!['completed','skipped'].includes(p.state)))return;
 try{await authorize(db,j.started_by,j.ensemble_id,'transcribe');}catch(error){if(!(error instanceof DomainError) || ![403,404].includes(error.status))throw error;await db.query("update transcription_jobs set state='failed',failure_reason='permission_revoked' where id=$1",[id]);return;}
 if(await processingPaused())return;
 const assembledPages=(pages.map(p=>({musicxmlFragment:p.result_xml,uncertainties:p.metrics?.uncertainties??[],usage:p.metrics?.usage??{inputTokens:0,outputTokens:0},promptVersion:j.prompt_version,flags:p.metrics?.flags??[],model:j.model,latency:p.metrics?.latency??0})));
 const detailed=this.assembler instanceof ScoreAssembler?await assembleOffThread(assembledPages):undefined;
 const xml=detailed?.xml??await this.assembler.assemble(assembledPages);
 await validateScore(xml,'musicxml');
 await transaction(async db=>{
 const current=(await db.query('select * from transcription_jobs where id=$1 for update',[id])).rows[0];if(!current||!['queued','running'].includes(current.state)||current.attempts!==j.attempts||current.started_by!==j.started_by)return;
 await authorize(db,current.started_by,current.ensemble_id,'transcribe');
 if(await processingPaused())return;
 if(detailed)await db.query('update transcription_jobs set provenance=provenance || $2::jsonb where id=$1',[id,JSON.stringify({measures:detailed.provenance,validation:detailed.report})]);
 if(detailed && !detailed.report.structurallyValid){await db.query("update transcription_jobs set state='failed',failure_reason='invalid_output' where id=$1",[id]);return;}
 await db.query("update transcription_jobs set state='completed',result_xml=$2 where id=$1",[id,xml]);
 });
 }
 async recoverAssembly(){await pool.query("update transcription_jobs j set state='failed',failure_reason='model_unavailable' where state='queued' and created_at<now()-$3*interval '1 millisecond' and (model!=$1 or prompt_version!=$2) and not exists(select 1 from job_pages p where p.job_id=j.id and p.attempts>0)",[this.provider.model,this.provider.promptVersion,env.TRANSCRIPTION_UNCLAIMED_MS]);for(const j of (await pool.query("select id from transcription_jobs where state in ('queued','running') and not exists(select 1 from job_pages where job_id=transcription_jobs.id and state not in ('completed','skipped'))")).rows)await this.assemble(j.id);}
}
export async function transcriptionMetrics(from:Date,to:Date){return (await pool.query(`select model,prompt_version,outcome as state,count(*)::int as attempts,sum(extract(epoch from (finished_at-started_at))*1000) as latency,sum(estimated_cost::text::numeric) as estimated_cost,sum((usage->>'inputTokens')::numeric) as input_tokens,sum((usage->>'outputTokens')::numeric) as output_tokens from provider_calls where started_at >= $1 and started_at < $2 group by model,prompt_version,outcome`,[from,to])).rows;}

export async function maintainTranscription(worker:TranscriptionWorker,cleanup:()=>Promise<void>){
 try{await cleanup();}catch(error){logError('transcription.cleanup',error);}
 try{await worker.recoverAssembly();}catch(error){logError('transcription.recovery',error);}
}

async function refreshMetrics(id:string){await pool.query(`update transcription_jobs j set metrics=(select jsonb_build_object('attempts',count(*),'latency',coalesce(sum(extract(epoch from (finished_at-started_at))*1000),0),'estimatedCost',coalesce(sum(estimated_cost::text::numeric),0),'usage',jsonb_build_object('inputTokens',coalesce(sum((usage->>'inputTokens')::numeric),0),'outputTokens',coalesce(sum((usage->>'outputTokens')::numeric),0)),'model',j.model,'promptVersion',j.prompt_version,'outcome',j.state) from provider_calls where job_id=j.id) where j.id=$1`,[id]);}
