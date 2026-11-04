import {it,expect,vi,beforeEach,afterEach} from 'vitest';
const mocks=vi.hoisted(()=>({failBegin:false,released:vi.fn(),ownerError:undefined as any,locked:true,query:vi.fn(),authorize:vi.fn(),library:undefined as any,member:undefined as any,validate:vi.fn()}));
vi.mock('../server/db/index.server',()=>({pool:{query:mocks.query,connect:async()=>({query:async(sql:string,args:any[])=>{if(typeof sql==='object') return {rows:[{}]};if(sql==='begin'&&mocks.failBegin)throw Error('database');return sql.includes('advisory')?{rows:[{locked:mocks.locked}]}:['begin','commit','rollback'].includes(sql)?{}:mocks.query(sql,args);},on:(_event:string,fn:any)=>{mocks.ownerError=fn;},release:mocks.released})}}));
vi.mock('../server/domain.server',()=>({authorize:mocks.authorize,onMembershipChange:(fn:any)=>{mocks.member=fn;return ()=>{};},onLibraryChange:(fn:any)=>{mocks.library=fn;return ()=>{};}}));
vi.mock('../server/env.server',()=>({env:{PLAYBACK_LEAD_MS:400}}));
vi.mock('../server/logger.server',()=>({logError:vi.fn()}));
vi.mock('../server/score-validation.server',()=>({validateScore:mocks.validate}));
import {installRehearsal} from '../server/rehearsal.server';
import {initialState} from '../src/rehearsal/controller';
const ensemble='00000000-0000-4000-8000-000000000001';
const timing={derivationVersion:2,baseBpm:120,totalBeats:100,tempos:[{beat:0,bpm:120}],measures:[]};
let stored=new Map<string,any>(), recovery:any[]=[];
let cleanup:(()=>void)|undefined;
beforeEach(()=>{mocks.failBegin=false;mocks.released.mockClear();mocks.locked=true;vi.useFakeTimers();mocks.query.mockReset();mocks.authorize.mockReset();stored=new Map();recovery=[];
 mocks.query.mockImplementation(async(sql:string,args:any[])=>{
  if(sql==='select ensemble_id,revision,state from rehearsal_sessions')return {rows:recovery};
  if(sql.startsWith('select state'))return {rows:stored.has(args[0])?[{state:stored.get(args[0])}]:[]};
  if(sql.startsWith('insert into rehearsal_sessions')){const state=JSON.parse(args[2]);stored.set(args[0],state);return {rows:[{revision:state.revision}],rowCount:1};}
  if(sql.startsWith('select content_hash'))return {rows:args[1]==='deleted'?[]:[{content_hash:'h',format:'score',timing}]};
  throw Error('unexpected query');
 });
});
afterEach(()=>{cleanup?.();vi.useRealTimers();vi.restoreAllMocks();});
function setup(){
 let connected:any;const broadcasts:any[]=[];const sockets=new Map(),rooms=new Map();
 const ns={sockets,adapter:{rooms},on:(_e:string,fn:any)=>connected=fn,to:()=>({emit:(_e:string,state:any)=>broadcasts.push(state)})};
 let now=1000;cleanup=installRehearsal(ns as any,{now:()=>now,idleMs:600000});
 function socket(id:string,user=id){const handlers=new Map();const socket:any={id,connected:true,data:{userId:user,expiresAt:1e9},rooms:new Set(),on:(e:string,fn:any)=>handlers.set(e,fn),join:async(room:string)=>{socket.rooms.add(room);const set=rooms.get(room)??new Set();set.add(id);rooms.set(room,set);},leave:async(room:string)=>{socket.rooms.delete(room);rooms.get(room)?.delete(id);},disconnect:()=>{socket.connected=false;for(const set of rooms.values())set.delete(id);handlers.get('disconnect')?.();}};sockets.set(id,socket);connected(socket);
 return {socket,ping:(ack:any)=>handlers.get('clock:ping')(ack),emit:(event:string,input:any)=>new Promise<any>(resolve=>handlers.get(event)(input,resolve))};}
 return {socket,broadcasts,setNow:(n:number)=>now=n};
}
const command=(type:any='stop',extra:any={})=>({ensembleId:ensemble,commandId:crypto.randomUUID(),baseRevision:0,clientSentAt:1000,command:{type},...extra});
it('isolates deleted-piece and malformed recovery rows from healthy joins and commands',async()=>{
 vi.spyOn(console,'error').mockImplementation(()=>{});
 const bad={...initialState('other','u',0),pieceId:'deleted',versionNo:1,status:'playing'};
 recovery=[{ensemble_id:'other',revision:7,state:{...bad,revision:7}},{ensemble_id:'malformed',revision:3,state:{secret:'private',anchor:'broken'}}];
 const app=setup(),c=app.socket('one');
 expect((await c.emit('rehearsal:join',{ensembleId:ensemble})).state.revision).toBe(0);
 expect((await c.emit('rehearsal:command',command())).status).toBe('accepted');
 expect(stored.get('other')).toMatchObject({revision:8,status:'paused',endsAt:null,anchor:{beat:0}});
 expect(stored.get('malformed')).toMatchObject({revision:4,status:'stopped',pieceId:null});
 expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('private');
});
it('keeps 5000 snapshots out of command ordering and caps in-flight reads',async()=>{
 const app=setup(),spam=app.socket('spam'),legit=app.socket('legit');
 await legit.emit('rehearsal:join',{ensembleId:ensemble});
 let release:()=>void=()=>{};const gate=new Promise<void>(r=>release=r);mocks.authorize.mockImplementation(()=>gate);
 const reads=Array.from({length:5000},()=>spam.emit('rehearsal:snapshot',{ensembleId:ensemble}));
 const started=performance.now();const ack=await legit.emit('rehearsal:command',command());
 expect(ack.status).toBe('accepted');expect(performance.now()-started).toBeLessThan(50);
 mocks.authorize.mockResolvedValue(undefined);release(); // remaining admitted authorizations each await the same gate below
 // No command or committed snapshot read waits behind the blocked authorization.
 expect(mocks.query.mock.calls.filter(([sql])=>sql.startsWith('insert into rehearsal_sessions'))).toHaveLength(1);
 await Promise.all(reads);
});
it('returns original acknowledgement and rejects commands before join and expired sessions',async()=>{
 const app=setup(),c=app.socket('one');const e=command();
 expect((await c.emit('rehearsal:command',e)).code).toBe('forbidden');
 await c.emit('rehearsal:join',{ensembleId:ensemble});
 const original=await c.emit('rehearsal:command',e);
 expect(await c.emit('rehearsal:command',e)).toEqual(original);
 expect(app.broadcasts).toHaveLength(1);
 c.socket.data.expiresAt=0;
 expect((await c.emit('rehearsal:command',command())).code).toBe('session_expired');
});
it('pauses idle loops at the current wrapped beat using a controlled timer',async()=>{
 const state={...initialState(ensemble,'u',0),revision:1,pieceId:'p',versionNo:1,status:'playing',bpm:120,loop:{enabled:true,startBeat:2,endBeat:6},anchor:{serverTime:1000,beat:2}};
 stored.set(ensemble,state);
 const app=setup(),c=app.socket('one');await c.emit('rehearsal:join',{ensembleId:ensemble});c.socket.disconnect();
 app.setNow(601500);await vi.advanceTimersByTimeAsync(600000);
 expect(stored.get(ensemble)).toMatchObject({status:'paused',revision:2,anchor:{beat:3},endsAt:null});
});
it('retries a failed end commit, then stops; a newer command defeats the old timer',async()=>{
 const app=setup(),c=app.socket('one');await c.emit('rehearsal:join',{ensembleId:ensemble});
 const selected=await c.emit('rehearsal:command',command('selectPiece',{command:{type:'selectPiece',pieceId:'p',versionNo:1}}));
 await c.emit('rehearsal:command',command('play',{baseRevision:selected.revision}));
 const end=stored.get(ensemble).endsAt;
 const normal=mocks.query.getMockImplementation()!;let failed=false;
 mocks.query.mockImplementation(async(sql,args)=>{if(sql.startsWith('insert into rehearsal_sessions')&&!failed){failed=true;throw Error('database');}return normal(sql,args);});
 app.setNow(end);await vi.advanceTimersByTimeAsync(end-1000);
 expect(stored.get(ensemble).status).toBe('playing');
 await vi.advanceTimersByTimeAsync(251);
 expect(stored.get(ensemble)).toMatchObject({status:'stopped',anchor:{beat:100}});
 const stopped=stored.get(ensemble).revision;
 app.setNow(end+1000);
 await c.emit('rehearsal:command',command('play',{baseRevision:stopped,clientSentAt:end+1000}));
 await c.emit('rehearsal:command',command('pause',{baseRevision:0,clientSentAt:end+1000}));
 const paused=stored.get(ensemble);app.setNow(end+100000);await vi.advanceTimersByTimeAsync(100000);
 expect(stored.get(ensemble)).toEqual(paused);
});
it('reports stale selection with current state and rejects an in-flight revoked command',async()=>{
 const app=setup(),c=app.socket('one');await c.emit('rehearsal:join',{ensembleId:ensemble});
 await c.emit('rehearsal:command',command('selectPiece',{command:{type:'selectPiece',pieceId:'p',versionNo:1}}));
 const stale=await c.emit('rehearsal:command',command('setTempo',{command:{type:'setTempo',pieceId:'old',versionNo:1,bpm:100}}));
 expect(stale).toMatchObject({code:'stale',revision:1,state:{pieceId:'p',revision:1}});
 // A library lookup is an asynchronous authorization boundary.
 await mocks.library(ensemble,[{pieceId:'unrelated',deleted:false}]);
 const normal=mocks.query.getMockImplementation()!;let release!:()=>void;
 const gate=new Promise<void>(r=>release=r);
 mocks.query.mockImplementation(async(sql,args)=>{if(sql.startsWith('select content_hash'))await gate;return normal(sql,args);});
 const pending=c.emit('rehearsal:command',command('play',{baseRevision:1}));
 await Promise.resolve();await Promise.resolve();await Promise.resolve();
 mocks.authorize.mockRejectedValue(Error('forbidden'));mocks.member(ensemble,'one',true);release();
 expect((await pending).code).toBe('forbidden');expect(stored.get(ensemble).revision).toBe(1);
});
it('maps DB failures and revision conflicts to unavailable without broadcasting',async()=>{
 const app=setup(),c=app.socket('one');await c.emit('rehearsal:join',{ensembleId:ensemble});
 const normal=mocks.query.getMockImplementation()!;
 mocks.query.mockImplementation(async(sql,args)=>sql.startsWith('insert into rehearsal_sessions')?{rowCount:0,rows:[]}:normal(sql,args));
 expect((await c.emit('rehearsal:command',command())).code).toBe('unavailable');
 expect(app.broadcasts).toEqual([]);
});
it('backs off validation_busy during recovery by pausing at the persisted anchor',async()=>{
 const state={...initialState(ensemble,'u',0),revision:3,pieceId:'p',versionNo:1,status:'countingIn',countInUntil:9000,anchor:{serverTime:1000,beat:5}};
 recovery=[{ensemble_id:ensemble,revision:3,state}];
 const normal=mocks.query.getMockImplementation()!;
 mocks.query.mockImplementation(async(sql,args)=>{
  if(sql.startsWith('select content_hash'))return {rows:[{content_hash:'legacy',format:'score',timing:null}]};
  if(sql.startsWith('select native_score'))return {rows:[{native_score:'{}'}]};
  return normal(sql,args);
 });
 mocks.validate.mockRejectedValue({code:'validation_busy'});
 const app=setup(),c=app.socket('one');
 expect((await c.emit('rehearsal:join',{ensembleId:ensemble})).state).toMatchObject({status:'paused',revision:4,anchor:{beat:5},countInUntil:null});
});
it('looks up precomputed timing without using the worker',async()=>{
 const app=setup(),c=app.socket('one');await c.emit('rehearsal:join',{ensembleId:ensemble});
 mocks.validate.mockClear();
 expect((await c.emit('rehearsal:command',command('selectPiece',{command:{type:'selectPiece',pieceId:'p',versionNo:1}}))).status).toBe('accepted');
 expect(mocks.validate).not.toHaveBeenCalled();
});
it('shares the user command budget across sockets and refills at five per second',async()=>{
 const app=setup(),a=app.socket('a','same'),b=app.socket('b','same');
 await a.emit('rehearsal:join',{ensembleId:ensemble});await b.emit('rehearsal:join',{ensembleId:ensemble});
 for(let i=0;i<20;i++)expect((await (i%2?a:b).emit('rehearsal:command',command())).status).toBe('accepted');
 expect((await b.emit('rehearsal:command',command())).code).toBe('rate_limited');
 app.setNow(1200);expect((await a.emit('rehearsal:command',command())).status).toBe('accepted');
});
it('lazily backfills legacy timing once through the bounded worker',async()=>{
 const normal=mocks.query.getMockImplementation()!;
 mocks.query.mockImplementation(async(sql,args)=>{
  if(sql.startsWith('select content_hash'))return {rows:[{content_hash:'legacy',format:'score',timing:null}]};
  if(sql.startsWith('select native_score'))return {rows:[{native_score:'{}'}]};
  if(sql.startsWith('update score_versions'))return {rowCount:1,rows:[]};
  return normal(sql,args);
 });
 mocks.validate.mockReset();mocks.validate.mockResolvedValue({timing});
 const app=setup(),c=app.socket('one');await c.emit('rehearsal:join',{ensembleId:ensemble});
 const selection={type:'selectPiece',pieceId:'p',versionNo:1};
 await c.emit('rehearsal:command',command('selectPiece',{command:selection}));
 await c.emit('rehearsal:command',command('selectPiece',{command:selection}));
 expect(mocks.validate).toHaveBeenCalledTimes(1);
 expect(mocks.query.mock.calls.find(([sql])=>sql.startsWith('update score_versions'))?.[1]).toEqual([ensemble,'p',1,JSON.stringify(timing),'2']);
});
it.each([['invalid_score','invalid'],['validation_timeout','unavailable'],['validation_busy','unavailable']])('maps worker %s to %s',async(error,expected)=>{
 const normal=mocks.query.getMockImplementation()!;
 mocks.query.mockImplementation(async(sql,args)=>{
  if(sql.startsWith('select content_hash'))return {rows:[{content_hash:'legacy',format:'score',timing:null}]};
  if(sql.startsWith('select native_score'))return {rows:[{native_score:'{}'}]};
  return normal(sql,args);
 });
 mocks.validate.mockRejectedValue({code:error});
 const app=setup(),c=app.socket('one');await c.emit('rehearsal:join',{ensembleId:ensemble});
 expect((await c.emit('rehearsal:command',command('selectPiece',{command:{type:'selectPiece',pieceId:'p',versionNo:1}}))).code).toBe(expected);
 expect(app.broadcasts).toEqual([]);
});
it('fails closed when another rehearsal process owns the startup lock',async()=>{
 mocks.locked=false;const app=setup(),c=app.socket('one');
 expect(await c.emit('rehearsal:join',{ensembleId:ensemble})).toEqual({code:'unavailable'});
 expect(mocks.query).not.toHaveBeenCalled();expect(app.broadcasts).toEqual([]);
});
it('rejects a command when persistence consumes the minimum remaining lead',async()=>{
 const app=setup(),c=app.socket('one');await c.emit('rehearsal:join',{ensembleId:ensemble});
 const normal=mocks.query.getMockImplementation()!;
 mocks.query.mockImplementation(async(sql,args)=>{const result=await normal(sql,args);if(sql.startsWith('insert into rehearsal_sessions'))app.setNow(1390);return result;});
 expect((await c.emit('rehearsal:command',command())).code).toBe('unavailable');
 expect(app.broadcasts).toEqual([]);
});
it('cancels idle publication when the ownership connection is lost',async()=>{
 stored.set(ensemble,{...initialState(ensemble,'u',0),revision:1,pieceId:'p',versionNo:1,status:'playing',bpm:120,loop:{enabled:true,startBeat:2,endBeat:6},anchor:{serverTime:1000,beat:2}});
 const app=setup(),c=app.socket('one');await c.emit('rehearsal:join',{ensembleId:ensemble});c.socket.disconnect();
 mocks.ownerError(Error('connection lost'));app.setNow(601000);await vi.advanceTimersByTimeAsync(600000);
 expect(stored.get(ensemble).revision).toBe(1);expect(app.broadcasts).toEqual([]);
});
it('commits a pre-roll setting against its effective time while preserving the musical anchor',async()=>{
 const state={...initialState(ensemble,'u',0),revision:1,pieceId:'p',versionNo:1,status:'countingIn',bpm:120,countInUntil:5000,startingTonesUntil:3000,anchor:{serverTime:100,beat:0}};
 stored.set(ensemble,state);const app=setup(),c=app.socket('one');await c.emit('rehearsal:join',{ensembleId:ensemble});
 expect((await c.emit('rehearsal:command',command('setMetronome',{command:{type:'setMetronome',enabled:true}}))).status).toBe('accepted');
 expect(stored.get(ensemble)).toMatchObject({effectiveAt:1400,anchor:state.anchor,countInUntil:5000});
});
it('releases a checked-out database client when transaction startup fails',async()=>{
 const app=setup(),c=app.socket('one');await c.emit('rehearsal:join',{ensembleId:ensemble});
 mocks.failBegin=true;expect((await c.emit('rehearsal:command',command())).code).toBe('unavailable');
 expect(mocks.released).toHaveBeenCalledTimes(1);expect(app.broadcasts).toEqual([]);
});

it('retries ownership when the previous process releases its lock',async()=>{
 mocks.locked=false;const app=setup(),c=app.socket('one');
 expect((await c.emit('rehearsal:join',{ensembleId:ensemble})).code).toBe('unavailable');
 mocks.locked=true;await vi.advanceTimersByTimeAsync(1000);
 expect((await c.emit('rehearsal:join',{ensembleId:ensemble})).state).toBeDefined();
});
it('reacquires after owner connection loss and repeats recovery',async()=>{
 const app=setup(),c=app.socket('one');await c.emit('rehearsal:join',{ensembleId:ensemble});
 recovery=[{ensemble_id:ensemble,revision:1,state:{...initialState(ensemble,'u',0),revision:1,status:'playing'}}];
 mocks.ownerError(Error('terminated'));await vi.advanceTimersByTimeAsync(1000);
 expect((await c.emit('rehearsal:join',{ensembleId:ensemble})).state).toMatchObject({status:'paused',revision:2});
 expect(app.broadcasts.at(-1)).toMatchObject({status:'paused',revision:2});
});
it('never serves the raw playing snapshot after recovery persistence failure',async()=>{
 recovery=[{ensemble_id:ensemble,revision:1,state:{...initialState(ensemble,'u',0),revision:1,status:'playing'}}];
 const normal=mocks.query.getMockImplementation()!;let fail=true;
 mocks.query.mockImplementation(async(sql,args)=>{if(fail && sql.startsWith('insert into rehearsal_sessions'))throw Error('offline');return normal(sql,args);});
 const app=setup(),c=app.socket('one');
 expect((await c.emit('rehearsal:join',{ensembleId:ensemble})).code).toBe('unavailable');
 fail=false;await vi.advanceTimersByTimeAsync(1000);
 expect((await c.emit('rehearsal:join',{ensembleId:ensemble})).state.status).toBe('paused');
});
it('rejects an invalid derived state before persistence and maps SQL data errors',async()=>{
 const normal=mocks.query.getMockImplementation()!;
 mocks.query.mockImplementation(async(sql,args)=>sql.startsWith('select content_hash')?{rows:[{content_hash:'broken',format:'score',timing:{...timing,baseBpm:2000}}]}:normal(sql,args));
 const app=setup(),c=app.socket('one');await c.emit('rehearsal:join',{ensembleId:ensemble});
 expect((await c.emit('rehearsal:command',command('selectPiece',{command:{type:'selectPiece',pieceId:'p',versionNo:1}}))).code).toBe('invalid');
 expect(app.broadcasts).toEqual([]);
 mocks.query.mockImplementation(async(sql,args)=>{if(sql.startsWith('insert into rehearsal_sessions'))throw {code:'22003'};return normal(sql,args);});
 expect((await c.emit('rehearsal:command',command())).code).toBe('invalid');
});
it('charges ensemble read admission only after membership authorization',async()=>{
 const app=setup();mocks.authorize.mockRejectedValue(Error('forbidden'));
 for(let i=0;i<6;i++){const c=app.socket('spam'+i);for(let j=0;j<20;j++)await c.emit('rehearsal:join',{ensembleId:ensemble});}
 mocks.authorize.mockResolvedValue(undefined);
 expect((await app.socket('legit').emit('rehearsal:join',{ensembleId:ensemble})).state).toBeDefined();
});

it('throttles clock pings independently per socket',()=>{
 const app=setup(),a=app.socket('pings'),b=app.socket('other');let count=0;
 for(let n=0;n<25;n++)a.ping(()=>count++);expect(count).toBe(20);
 b.ping(()=>count++);expect(count).toBe(21);app.setNow(2000);
 for(let n=0;n<11;n++)a.ping(()=>count++);expect(count).toBe(31);
});
it('evicts an idle committed snapshot so a later join loads persistence',async()=>{
 const app=setup(),c=app.socket('idle');await c.emit('rehearsal:join',{ensembleId:ensemble});c.socket.disconnect();
 await vi.advanceTimersByTimeAsync(600000);
 stored.set(ensemble,{...initialState(ensemble,'u',0),revision:10});
 expect((await app.socket('return').emit('rehearsal:join',{ensembleId:ensemble})).state.revision).toBe(10);
});
it('does not rearm an in-flight end timer after ownership loss',async()=>{
 const app=setup(),c=app.socket('end-owner');await c.emit('rehearsal:join',{ensembleId:ensemble});
 const selected=await c.emit('rehearsal:command',command('selectPiece',{command:{type:'selectPiece',pieceId:'p',versionNo:1}}));
 await c.emit('rehearsal:command',command('play',{baseRevision:selected.revision}));
 const end=stored.get(ensemble).endsAt;const normal=mocks.query.getMockImplementation()!;
 mocks.query.mockImplementation(async(sql,args)=>{if(sql.startsWith('insert into rehearsal_sessions')){mocks.locked=false;mocks.ownerError(Error('lost'));throw Error('offline');}return normal(sql,args);});
 app.setNow(end);await vi.advanceTimersByTimeAsync(end-1000);
 expect(vi.getTimerCount()).toBe(1); // ownership retry only, no rehearsal/end timer
});

it('reconciles deletions received while ownership is unavailable on recovery',async()=>{
 stored.set(ensemble,{...initialState(ensemble,'u',0),revision:2,pieceId:'p',versionNo:1});
 mocks.locked=false;const app=setup(),c=app.socket('delete');
 expect((await c.emit('rehearsal:join',{ensembleId:ensemble})).code).toBe('unavailable');
 await mocks.library(ensemble,[{deleted:true,pieceId:'p'}]);
 mocks.locked=true;await vi.advanceTimersByTimeAsync(1000);
 expect((await c.emit('rehearsal:join',{ensembleId:ensemble})).state).toMatchObject({pieceId:null,revision:3});
});

it('maps actual Zod errors from timing validation to invalid',async()=>{
 const {z}=await import('zod');const bad=z.number().safeParse('bad');
 const normal=mocks.query.getMockImplementation()!;
 mocks.query.mockImplementation(async(sql,args)=>{if(sql.startsWith('select content_hash'))throw bad.error;return normal(sql,args);});
 const c=setup().socket('zod');await c.emit('rehearsal:join',{ensembleId:ensemble});
 expect((await c.emit('rehearsal:command',command('selectPiece',{command:{type:'selectPiece',pieceId:'p',versionNo:1}}))).code).toBe('invalid');
});
