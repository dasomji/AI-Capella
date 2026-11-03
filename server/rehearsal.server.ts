import type { Namespace, Socket } from 'socket.io';
import { performance } from 'node:perf_hooks';
import { pool } from './db/index.server';
import { authorize,onMembershipChange,onLibraryChange } from './domain.server';
import { logError } from './logger.server';
import { env } from './env.server';
import { envelopeSchema,joinSchema,stateSchema,type RehearsalState,type Ack } from '../src/rehearsal/contract';
import { apply,initialState,restartPaused } from '../src/rehearsal/controller';
import type { PieceTiming } from '../src/rehearsal/timeline';
import { validateScore } from './score-validation.server';
export const serverNow=()=>performance.timeOrigin+performance.now();
const empty:PieceTiming={baseBpm:100,totalBeats:0,tempos:[{beat:0,bpm:100}],measures:[]};
export function installRehearsal(ns:Namespace) {
 const queues=new Map<string,Promise<unknown>>(),timers=new Map<string,ReturnType<typeof setTimeout>>();
 const seen=new Map<string,Map<string,number>>(),timings=new Map<string,Promise<PieceTiming>>();
 const membership=new Map<Socket,Set<string>>();let generation=0,closed=false;
 function serial<T>(id:string,fn:()=>Promise<T>):Promise<T>{const result=(queues.get(id)??Promise.resolve()).catch(()=>{}).then(fn);queues.set(id,result);void result.finally(()=>{if(queues.get(id)===result)queues.delete(id);}).catch(()=>{});return result;}
 async function timing(e:string,p:string|null,v:number|null):Promise<PieceTiming>{
  if(!p)return empty;
  const {rows}=await pool.query('select content_hash,format,native_score,musicxml from score_versions where ensemble_id=$1 and piece_id=$2 and version_no=$3',[e,p,v]);
  const row=rows[0];if(!row)throw Error('not_found');
  let value=timings.get(row.content_hash);
  if(!value){value=validateScore(row.format==='score'?JSON.stringify(row.native_score):row.musicxml,row.format,true).then(r=>r.timing!);timings.set(row.content_hash,value);void value.catch(()=>timings.delete(row.content_hash));if(timings.size>100)timings.delete(timings.keys().next().value!);}
  return value;
 }
 async function load(e:string,u='server') {const {rows}=await pool.query('select state from rehearsal_sessions where ensemble_id=$1',[e]);return rows.length?stateSchema.parse(rows[0].state):initialState(e,u,serverNow());}
 async function persist(s:RehearsalState){await pool.query('insert into rehearsal_sessions(ensemble_id,revision,state) values($1,$2,$3) on conflict(ensemble_id) do update set revision=$2,state=$3,updated_at=now()',[s.ensembleId,s.revision,JSON.stringify(s)]);}
 async function publish(s:RehearsalState){await persist(s);if(closed)return;ns.to(`rehearsal:${s.ensembleId}`).emit('playback:state',s);schedule(s);}
 function schedule(s:RehearsalState){clearTimeout(timers.get(s.ensembleId));timers.delete(s.ensembleId);if(s.endsAt===null||closed)return;
  const timer=setTimeout(()=>{void serial(s.ensembleId,async()=>{const current=await load(s.ensembleId);if(current.revision!==s.revision)return;if(current.endsAt!==null&&serverNow()<current.endsAt){schedule(current);return;}await publish({...current,revision:current.revision+1,status:'stopped',anchor:{serverTime:current.endsAt!,beat:(await timing(current.ensembleId,current.pieceId,current.versionNo)).totalBeats},countInUntil:null,startingTonesUntil:null,endsAt:null,updatedAt:serverNow()});}).catch(error=>logError('rehearsal.end',error));},Math.min(2147483647,Math.max(0,s.endsAt-serverNow())));timer.unref();timers.set(s.ensembleId,timer);
 }
 const ready=(async()=>{const {rows}=await pool.query('select state from rehearsal_sessions');for(const row of rows){const s=stateSchema.parse(row.state);if(s.status==='playing'||s.status==='countingIn')await persist(restartPaused(s,serverNow(),await timing(s.ensembleId,s.pieceId,s.versionNo)));}})();
 void ready.catch(error=>logError('rehearsal.recovery',error));
 async function member(socket:Socket,e:string){
  if(!socket.connected||socket.data.expiresAt<=serverNow())throw Error('forbidden');
  let set=membership.get(socket);if(!set){set=new Set();membership.set(socket,set);}
  if(set.has(e))return;
  const epoch=generation;await authorize(pool,socket.data.userId,e);
  if(epoch!==generation)return member(socket,e);
  if(!socket.connected)throw Error('forbidden');set.add(e);
 }
 const offMember=onMembershipChange((e,u,removed)=>{generation++;for(const [socket,set] of membership){if(u&&socket.data.userId!==u)continue;set.delete(e);if(removed)void socket.leave(`rehearsal:${e}`);}});
 const offLibrary=onLibraryChange(async(e,changes)=>{if(!changes.some((c:any)=>c.deleted))return;await ready;await serial(e,async()=>{const s=await load(e);if(!changes.some((c:any)=>c.deleted&&c.pieceId===s.pieceId))return;const next=initialState(e,s.updatedBy,serverNow());await publish({...next,revision:s.revision+1});});});
 ns.on('connection',socket=>{
  let tokens=20,last=serverNow();
  socket.on('clock:ping',(ack:unknown)=>{if(typeof ack==='function')ack({serverTime:serverNow()});});
  for(const event of ['rehearsal:join','rehearsal:snapshot'])socket.on(event,async(input:unknown,ack:unknown)=>{
   if(typeof ack!=='function')return;
   const parsed=joinSchema.safeParse(input);if(!parsed.success)return ack({code:'invalid'});
   try{await ready;await serial(parsed.data.ensembleId,async()=>{await member(socket,parsed.data.ensembleId);const state=await load(parsed.data.ensembleId,socket.data.userId);await member(socket,parsed.data.ensembleId);await socket.join(`rehearsal:${parsed.data.ensembleId}`);ack({state});});}catch{ack({code:'forbidden'});}
  });
  socket.on('rehearsal:command',async(input:unknown,callback:unknown)=>{
   const ack=typeof callback==='function'?callback:()=>{};
   const parsed=envelopeSchema.safeParse(input);const commandId=typeof (input as any)?.commandId==='string'?(input as any).commandId:'';
   const reject=(code:Ack['code'])=>ack({commandId,status:'rejected',code});
   const now=serverNow();tokens=Math.min(20,tokens+(now-last)*.02);last=now;if(tokens<1)return reject('rate_limited');tokens--;
   if(!parsed.success)return reject('invalid');const e=parsed.data;
   try{await ready;await serial(e.ensembleId,async()=>{
    try{await member(socket,e.ensembleId);}catch{return reject('forbidden');}
    let ids=seen.get(e.ensembleId);if(!ids){ids=new Map();seen.set(e.ensembleId,ids);}for(const [id,time] of ids)if(now-time>600000)ids.delete(id);
    if(ids.has(e.commandId))return reject('duplicate');
    const s=await load(e.ensembleId,socket.data.userId);
    let t:PieceTiming;try{t=await timing(e.ensembleId,e.command.type==='selectPiece'?e.command.pieceId:s.pieceId,e.command.type==='selectPiece'?e.command.versionNo:s.versionNo);}catch{return reject('not_found');}
    const next=apply(s,e,{now:serverNow(),leadTimeMs:env.PLAYBACK_LEAD_MS,pieceTiming:t,userId:socket.data.userId});if('code' in next)return reject(next.code);
    try{await member(socket,e.ensembleId);}catch{return reject('forbidden');}
    await publish(next);ids.set(e.commandId,serverNow());if(ids.size>1000)ids.delete(ids.keys().next().value!);
    ack({commandId:e.commandId,status:'accepted',revision:next.revision});
   });}catch(error){logError('rehearsal.command',error);reject('invalid');}
  });
  socket.on('disconnect',()=>membership.delete(socket));
 });
 return ()=>{closed=true;offMember();offLibrary();for(const timer of timers.values())clearTimeout(timer);};
}
