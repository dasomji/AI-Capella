import { Worker } from 'node:worker_threads';
import { DomainError } from './domain.server';
import type { PieceTiming } from '../src/rehearsal/timeline';
type Result = {raw:string;hash:string;size:number;timing?:PieceTiming};
type Job = {raw:string;format:'score'|'musicxml';timing:boolean;resolve:(value:Result)=>void;reject:(error:unknown)=>void};
type Slot = {worker:Worker;job?:Job;timeout?:ReturnType<typeof setTimeout>;idle?:ReturnType<typeof setTimeout>};
const queue:Job[]=[];
const slots=new Set<Slot>();
// Two CPU workers and eight waiting bodies at most. Idle workers retire after one second.
export function validateScore(raw:string,format:'score'|'musicxml',timing=false):Promise<Result> {
  if(queue.length>=8) return Promise.reject(new DomainError('validation_busy',503));
  return new Promise((resolve,reject)=>{queue.push({raw,format,timing,resolve,reject});drain();});
}
function retire(slot:Slot,error?:unknown){
  if(!slots.delete(slot)) return;
  clearTimeout(slot.timeout);clearTimeout(slot.idle);
  slot.job?.reject(error ?? new Error('Score worker exited'));
  slot.job=undefined;
  void slot.worker.terminate();
  drain();
}
function createSlot():Slot{
  const slot:Slot={worker:new Worker(new URL('./score-worker.mjs',import.meta.url))};
  slots.add(slot);
  slot.worker.on('message',(result:Result & {error?:string})=>{
    const job=slot.job;
    if(!job)return;
    clearTimeout(slot.timeout);slot.job=undefined;
    if(result.error) job.reject(new DomainError(result.error,['invalid_text','nesting_limit'].includes(result.error)?422:400));
    else job.resolve(result);
    slot.worker.unref();
    slot.idle=setTimeout(()=>retire(slot),1000);slot.idle.unref();
    drain();
  });
  slot.worker.once('error',error=>retire(slot,error));
  slot.worker.once('exit',()=>retire(slot));
  return slot;
}
function drain(){
  while(queue.length){
    const slot=[...slots].find(s=>!s.job) ?? (slots.size<2 ? createSlot() : undefined);
    if(!slot)return;
    clearTimeout(slot.idle);slot.worker.ref();slot.job=queue.shift()!;
    slot.timeout=setTimeout(()=>retire(slot,new DomainError('validation_timeout',422)),30000);
    slot.worker.postMessage({raw:slot.job.raw,format:slot.job.format,timing:slot.job.timing});
  }
}
