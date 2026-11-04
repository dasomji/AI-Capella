import { Worker } from 'node:worker_threads';
import { ProviderError,type PageResult } from './transcription-provider.server';
import type { ScoreAssembler } from './score-assembly.server';
export function assembleOffThread(pages:PageResult[]):Promise<Awaited<ReturnType<ScoreAssembler['assembleDetailed']>>>{return new Promise((resolve,reject)=>{
 const worker=new Worker(new URL('./assembly-worker.mjs',import.meta.url),{workerData:pages,resourceLimits:{maxOldGenerationSizeMb:512}});
 const timer=setTimeout(()=>{void worker.terminate();reject(new ProviderError('infrastructure_error',true));},60000);
 worker.once('message',r=>{clearTimeout(timer);void worker.terminate();r.error?reject(new ProviderError(r.error,true)):resolve(r.result);});worker.once('error',e=>{clearTimeout(timer);reject(e);});worker.once('exit',code=>{clearTimeout(timer);if(code)reject(new ProviderError('infrastructure_error',true));});
 });}
