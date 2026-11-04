import { it, expect, vi } from 'vitest';
import { apply, initialState, positionAt, restartPaused, lateJoin, revisionChecked } from '../src/rehearsal/controller';
import { estimateClock } from '../src/rehearsal/clock';
import { stateSchema, commandSchema, type Command, type Envelope, type RehearsalState } from '../src/rehearsal/contract';
import { secondsAt, beatAt, timingFromScore } from '../src/rehearsal/timeline';
const t = { totalBeats: 16, baseBpm: 120, tempos: [{ beat: 0, bpm: 120 }, { beat: 4, bpm: 60 }], measures: [{ startBeat: 0, beats: 4, beatType: 4 }] };
let s = { ...initialState('ensemble', 'user', 0), pieceId: 'piece', versionNo: 1, bpm: 120 };
const envelope = (command: Command, baseRevision = 0): Envelope => ({ ensembleId: 'ensemble', commandId: crypto.randomUUID(), baseRevision, clientSentAt: 0, command });
function run(state: RehearsalState, command: Command, now = 0, leadTimeMs = 400) { const result = apply(state, { ...envelope(command, state.revision), clientSentAt: now }, { now, leadTimeMs, pieceTiming: t, userId: 'user' }); if ('code' in result)
    throw Error(result.code); stateSchema.parse(result); return result; }
it('integrates score tempo segments and reanchors tempo continuously at effective time', () => {
    expect(secondsAt(6, t)).toBe(4);
    expect(beatAt(4, t)).toBe(6);
    const playing = run(s, { type: 'play' });
    const changed = run(playing, { type:'setTempo',pieceId:'piece',versionNo:1, bpm: 60 }, 2000);
    expect(changed.anchor.beat).toBe(4);
    expect(positionAt(changed, 3400, t)).toBeCloseTo(4.5);
});
it('wraps loops in musical time and clamps natural end', () => {
    let playing = run(s, { type:'setLoop',pieceId:'piece',versionNo:1, enabled: true, startBeat: 2, endBeat: 6 });
    playing = run(playing, { type:'play',pieceId:'piece',versionNo:1,fromBeat: 2 });
    expect(positionAt(playing, 3900, t)).toBeCloseTo(3);
    const end = run(s, { type: 'play' });
    expect(end.endsAt).toBe(14400);
    expect(positionAt(end, 99999, t)).toBe(16);
});
it('freezes pre-roll and late joins discard expired pre-roll; restart pauses at elapsed beat', () => {
    let pre = run(s, { type: 'setStartingTones', enabled: true });
    pre = run(pre, { type: 'setCountIn', bars: 1 });
    pre = run(pre, { type: 'play' });
    expect(pre.countInUntil).toBe(4400);
    expect(positionAt(pre, 3000, t)).toBe(0);
    expect(lateJoin(pre, 5400, t, 100)).toMatchObject({ status: 'playing', beat: 2, localTime: 5300, countInUntil: null, startingTonesUntil: null });
    const paused = restartPaused(pre, 5400, t);
    expect(paused.anchor.beat).toBe(2);
    expect(paused.status).toBe('paused');
    expect(paused.revision).toBe(pre.revision + 1);
});
const commands: Command[] = [{ type: 'selectPiece', pieceId: 'piece', versionNo: 1 }, { type: 'play' }, { type: 'pause' }, { type: 'stop' }, { type:'seek',pieceId:'piece',versionNo:1, beat: 2 }, { type:'setTempo',pieceId:'piece',versionNo:1, bpm: 90 }, { type:'setTransposition',pieceId:'piece',versionNo:1, semitones: 2 }, { type:'setLoop',pieceId:'piece',versionNo:1, enabled: false }, { type: 'setMetronome', enabled: true }, { type: 'setCountIn', bars: 0 }, { type: 'setStartingTones', enabled: false }, { type: 'playStartingTones' }];
it.each(commands)('writes explicit pre-roll fields for $type and checks its revision policy', c => {
    const old = { ...s, revision: 2, status: 'playing' as const, countInUntil: 999, startingTonesUntil: 888 };
    const next = run(old, c);
    expect(Object.keys(next).sort()).toEqual(Object.keys(old).sort());
    if (['pause','stop','seek','selectPiece','setLoop'].includes(c.type)) {
        expect(next.countInUntil).toBeNull();
        expect(next.startingTonesUntil).toBeNull();
    }
    const stale = apply(old, envelope(c), { now: 0, leadTimeMs: 400, pieceTiming: t, userId: 'user' });
    expect('code' in stale ? stale.code : 'accepted').toBe(revisionChecked[c.type] ? 'stale' : 'accepted');
});
it('rejects invalid loop/beat, future revision and expired envelopes', () => {
    expect(run(s, {type:'seek',pieceId:'piece',versionNo:1,beat:17}).anchor.beat).toBe(16);
    expect(apply(s, envelope({ type: 'stop' }, 1), { now: 0, leadTimeMs: 0, pieceTiming: t, userId: 'user' })).toEqual({ code: 'stale' });
    expect(apply(s, envelope({ type: 'stop' }), { now: 6000, leadTimeMs: 0, pieceTiming: t, userId: 'user' })).toEqual({ code: 'expired' });
    expect(commandSchema.safeParse({ type:'setTempo',pieceId:'piece',versionNo:1, bpm: 0 }).success).toBe(false);
});
it('uses lowest RTT samples and bounds unknowable asymmetry with jitter', () => {
    expect(estimateClock(Array(3).fill({ t0: 0, tServer: 0, t1: 0 }))).toBeNull();
    const samples = Array.from({ length: 24 }, (_, i) => { const t0 = i * 1000, up = 10 + i % 3, down = i < 8 ? 30 + i % 4 : 300 + i * 5; return { t0, tServer: t0 + up + 250, t1: t0 + up + down }; });
    const result = estimateClock(samples)!;
    expect(Math.abs(result.offsetMs - 250)).toBeLessThanOrEqual(result.uncertaintyMs);
    expect(result.uncertaintyMs).toBeLessThan(30);
});
it('derives tempo-map marks in quarter units from existing score model', () => {
    const timing = timingFromScore({ tempo: 120, totalBeats: 16, measures: [], marks: [{ kind: 'tempo', beat: 4, metronome: { unit: 'half', dots: 1, perMinute: '40' } }] } as any);
    expect(timing.tempos).toEqual([{ beat: 0, bpm: 120 }, { beat: 4, bpm: 120 }]);
});
it('counts in at the local tempo after a tempo-map change and reports elapsed natural end', () => {
    const configured = run(s, { type: 'setCountIn', bars: 1 });
    const pre = run(configured, { type:'play',pieceId:'piece',versionNo:1,fromBeat: 6 });
    expect(pre.countInUntil).toBe(4400);
    const playing = run(s, { type: 'play' });
    expect(lateJoin(playing, 99999, t).status).toBe('stopped');
});

it('socket transport drops disconnected commands, awaits application, and snapshots after stale',async()=>{
 const {SocketPlaybackTransport}=await import('../src/rehearsal/socket-transport');
 const handlers=new Map<string,Function>(), emitted:string[]=[];let revision=0,hold:(()=>void)|undefined;
 const socket={connected:false,on:(e:string,fn:Function)=>handlers.set(e,fn),off:(e:string)=>handlers.delete(e),disconnect:()=>{},volatile:{emit:(event:string,...args:any[])=>{
   emitted.push(event);const ack=args.at(-1);
   if(event==='clock:ping')ack({serverTime:1000});
   else if(event==='rehearsal:command')ack({commandId:args[0].commandId,status:'rejected',code:'stale'});
   else ack({state:{...initialState('ensemble','user',1000),revision:revision++}});
 }}};
 const transport=new SocketPlaybackTransport(socket,'ensemble',()=>1000);
 transport.subscribe(()=>new Promise<void>(r=>{hold=r;}));
 await expect(transport.send({type:'stop'})).rejects.toThrow('connecting');expect(emitted).toEqual([]);
 socket.connected=true;const joined=transport.join();await vi.waitFor(()=>expect(hold).toBeTypeOf("function"));
 expect(transport.ready).toBe(false);hold!();await joined;expect(transport.ready).toBe(true);
 hold=undefined;const stale=transport.send({type:'stop'});await vi.waitFor(()=>expect(hold).toBeTypeOf('function'));
 expect(emitted.at(-1)).toBe('rehearsal:snapshot');expect(transport.ready).toBe(false);
 await Promise.resolve();hold!();await stale;expect(transport.ready).toBe(true);
 socket.connected=false;handlers.get('disconnect')!();
 const before=emitted.length;await expect(transport.send({type:'play'})).rejects.toThrow('connecting');expect(emitted.length).toBe(before);
 transport.dispose();expect(transport.ready).toBe(false);
});

it('maps server instants through output timestamps with a latency fallback',async()=>{
 const {serverToAudioTime}=await import('../src/rehearsal/client-clock');
 expect(serverToAudioTime(102500,500,{state:'running',currentTime:10,getOutputTimestamp:()=>({contextTime:9.9,performanceTime:1000})},1000,100000)).toBeCloseTo(10.9);
 expect(serverToAudioTime(102500,500,{currentTime:10,outputLatency:.1},1000,100000)).toBeCloseTo(10.9);
});
it('plans future and late starts, skips expired pre-roll and preserves effective-time tempo position',async()=>{
 const {playbackSchedule}=await import('../src/rehearsal/schedule');
 const playing=run(s,{type:'play'});
 expect(playbackSchedule(playing,0,t)).toMatchObject({musicAt:400,beat:0,playing:true});
 expect(playbackSchedule(playing,3400,t)).toMatchObject({musicAt:3400,beat:5,startingTones:null,countIn:null});
 const pre=run({...s,countIn:{bars:1},startingTones:{enabled:true}},{type:'play'});
 expect(playbackSchedule(pre,10000,t)).toMatchObject({startingTones:null,countIn:null});
 const setting=run(pre,{type:'setMetronome',enabled:true},1000);
 expect(playbackSchedule(setting,1000,t)).toMatchObject({effectiveAt:1400,musicAt:4400,beat:0});
 const countOnly=run({...s,countIn:{bars:1}},{type:'play'});
 const countSetting=run(countOnly,{type:'setMetronome',enabled:true},1000);
 expect(playbackSchedule(countSetting,1000,t).countIn?.from).toBe(400);
 const tempo=run(playing,{type:'setTempo',pieceId:'piece',versionNo:1,bpm:60},3000);
 expect(playbackSchedule(tempo,3000,t).beat).toBe(positionAt(playing,tempo.anchor.serverTime,t));
 expect(playbackSchedule(playing,400,t).secondsFromBeat(6)).toBe(4);
});
it('refreshes the clock on join, periodic ticks, wake, online, reconnect and sleep',async()=>{
 const {PlaybackClock}=await import('../src/rehearsal/client-clock');const {JSDOM}=await import('jsdom');const dom=new JSDOM('',{pretendToBeVisual:true});
 vi.stubGlobal('window',dom.window);vi.stubGlobal('document',dom.window.document);vi.useFakeTimers();
 let now=1000;const ping=vi.fn(async()=>now+500);const clock=new PlaybackClock(ping,()=>{},()=>now);
 try {
  clock.start();await clock.refresh();expect(ping).toHaveBeenCalledTimes(8);expect(clock.serverNow()).toBe(1500);
  await vi.advanceTimersByTimeAsync(30000);expect(ping).toHaveBeenCalledTimes(8);
  now+=30000;await vi.advanceTimersByTimeAsync(1000);expect(ping).toHaveBeenCalledTimes(16);
  dom.window.document.dispatchEvent(new dom.window.Event('visibilitychange'));await clock.refresh();expect(ping).toHaveBeenCalledTimes(24);
  dom.window.dispatchEvent(new dom.window.Event('online'));await clock.refresh();expect(ping).toHaveBeenCalledTimes(32);
  await clock.reconnect();expect(ping).toHaveBeenCalledTimes(40);
  now+=4000;await vi.advanceTimersByTimeAsync(1000);expect(ping).toHaveBeenCalledTimes(48);
 }finally{clock.dispose();vi.useRealTimers();vi.unstubAllGlobals();dom.window.close();}
});
it.each([
 {type:'setMetronome',enabled:true}, {type:'setCountIn',bars:2},
 {type:'setStartingTones',enabled:false}, {type:'setTransposition',pieceId:'piece',versionNo:1,semitones:3},
] satisfies Command[])('preserves active pre-roll through $type', command=>{
 const pre=run({...s,countIn:{bars:1},startingTones:{enabled:true}},{type:'play'});
 const next=run(pre,command,1000);
 expect(next).toMatchObject({status:'countingIn',countInUntil:4400,startingTonesUntil:2400,anchor:{beat:0}});
 expect(next.anchor).toEqual(pre.anchor);expect(next.effectiveAt).toBe(1400);
 expect(positionAt(next,4400,t)).toBe(0);
});
it('rescales remaining count-in and preserves starting tones on tempo change',()=>{
 const pre=run({...s,countIn:{bars:1},startingTones:{enabled:true}},{type:'play'});
 const next=run(pre,{type:'setTempo',pieceId:'piece',versionNo:1,bpm:60},1000);
 expect(next).toMatchObject({status:'countingIn',startingTonesUntil:2400,countInUntil:6400});
 expect(positionAt(next,7400,t)).toBe(1);
});
it('makes repeated play a no-op, playing fromBeat a seek, and pause unchecked',()=>{
 const playing=run({...s,countIn:{bars:1}},{type:'play'});
 expect(run(playing,{type:'play'},1000)).toBe(playing);
 const seek=run(playing,{type:'play',pieceId:'piece',versionNo:1,fromBeat:6},1000);
 expect(seek).toMatchObject({status:'playing',countInUntil:null,anchor:{beat:6}});
 expect(apply({...playing,revision:5},envelope({type:'pause'}),{now:0,leadTimeMs:0,pieceTiming:t,userId:'user'})).toMatchObject({status:'paused',revision:6});
});
it('clamps seek, restarts from end and stops after downtime beyond natural end',()=>{
 const end=run(s,{type:'seek',pieceId:'piece',versionNo:1,beat:20});
 expect(end).toMatchObject({status:'stopped',anchor:{beat:16}});
 expect(run(end,{type:'play'}).anchor.beat).toBe(0);
 expect(run(run(s,{type:'play'}),{type:'play'},20000).anchor.beat).toBe(0);
 expect(restartPaused(run(s,{type:'play'}),20000,t)).toMatchObject({status:'stopped',anchor:{beat:16}});
});
it('binds relative settings to selection and normalizes loop anchors',()=>{
 for(const type of ['setTempo','setTransposition','seek','setLoop'] as const){
  const c=commands.find(c=>c.type===type)!;
  expect(apply(s,envelope({...c,pieceId:'old'} as Command),{now:0,leadTimeMs:0,pieceTiming:t,userId:'u'})).toEqual({code:'stale'});
 }
 const loop=run({...s,anchor:{serverTime:0,beat:8}},{type:'setLoop',pieceId:'piece',versionNo:1,enabled:true,startBeat:2,endBeat:6});
 expect(loop.anchor.beat).toBe(2);
 expect(run(loop,{type:'seek',pieceId:'piece',versionNo:1,beat:7}).loop.enabled).toBe(false);
});
it('normalizes against the first tempo-map entry without rounding sound tempo',()=>{
 const timing=timingFromScore({tempo:90.4,totalBeats:16,measures:[],marks:[{kind:'tempo',beat:0,metronome:{unit:'quarter',dots:0,perMinute:'80'}}]} as any);
 expect(timing.baseBpm).toBe(80); expect(timing.tempos[0].bpm).toBe(80);
 expect(timingFromScore({tempo:90.4,totalBeats:16,measures:[],marks:[]} as any).baseBpm).toBe(90.4);
});
it('retries unavailable with backoff and the same command ID, applies stale state, and gates expired sessions',async()=>{
 vi.useFakeTimers();
 const {SocketPlaybackTransport}=await import('../src/rehearsal/socket-transport');
 const sent:any[]=[];let mode='unavailable',attempt=0;
 const socket={connected:true,on:()=>{},off:()=>{},disconnect:()=>{},volatile:{emit:(event:string,...args:any[])=>{
  const ack=args.at(-1);
  if(event!=='rehearsal:command')return ack({state:s});
  sent.push(args[0]);attempt++;
  if(mode==='unavailable')return ack(attempt<3?{commandId:args[0].commandId,status:'rejected',code:'unavailable'}:{commandId:args[0].commandId,status:'accepted',revision:1});
  if(mode==='stale')return ack({commandId:args[0].commandId,status:'rejected',code:'stale',revision:4,state:{...s,revision:4}});
  ack({commandId:args[0].commandId,status:'rejected',code:'session_expired'});
 }}};
 const transport=new SocketPlaybackTransport(socket,'ensemble',()=>1000);const applied:number[]=[];
 transport.subscribe(state=>{applied.push(state.revision);});
 try {
  await transport.join();const pending=transport.send({type:'pause'});
  await vi.advanceTimersByTimeAsync(99);expect(sent).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(201);expect((await pending).status).toBe('accepted');
  expect(sent).toHaveLength(3);expect(new Set(sent.map(s=>s.commandId)).size).toBe(1);
  mode='stale';await transport.send({type:'stop'});expect(applied).toEqual([0,4]);
  mode='expired';await transport.send({type:'pause'});expect(transport.ready).toBe(false);
 }finally{transport.dispose();vi.useRealTimers();}
});
it('schedules an idle pause, normalizes loop start and skips completed count-in',async()=>{
 const {playbackSchedule}=await import('../src/rehearsal/schedule');
 const loop=run(s,{type:'setLoop',pieceId:'piece',versionNo:1,enabled:true,startBeat:2,endBeat:6});
 expect(playbackSchedule(loop,1000,t)).toMatchObject({playing:false,beat:2});
 const pre=run({...s,countIn:{bars:1}},{type:'play'});
 expect(restartPaused(pre,1000,t)).toMatchObject({status:'paused',anchor:{beat:0},countInUntil:null});
 expect(playbackSchedule(pre,2500,t)).toMatchObject({playing:true,countIn:null,beat:.2});
});
it('accepts pause without a selected piece and repeated pause preserves the revision',()=>{
 const paused=run(initialState('ensemble','user',0),{type:'pause'});
 expect(paused.status).toBe('stopped');
 expect(run(paused,{type:'pause'},1000)).toBe(paused);
});
it('clears elapsed pre-roll on setting changes without pulling natural end earlier',()=>{
 const pre=run({...s,countIn:{bars:1},startingTones:{enabled:true}},{type:'play'});
 const changed=run(pre,{type:'setMetronome',enabled:true},5000);
 expect(changed).toMatchObject({countInUntil:null,startingTonesUntil:null,status:'playing',anchor:{beat:2}});
 expect(changed.endsAt).toBe(pre.endsAt);
 const tempo=run(pre,{type:'setTempo',pieceId:'piece',versionNo:1,bpm:60},3000);
 expect(tempo.countInUntil).toBe(5400);expect(tempo.startingTonesUntil).toBeNull();
 expect(positionAt(tempo,6400,t)).toBe(1);
});
it('prefers precise sound tempo over both the displayed tempo and beat-zero metronome',()=>{
 const timing=timingFromScore({tempo:90,totalBeats:16,measures:[],marks:[{kind:'tempo',beat:0,tempoBpm:90.4,metronome:{unit:'quarter',dots:0,perMinute:'120'}}]} as any);
 expect(timing.baseBpm).toBe(90.4);expect(timing.tempos[0]).toEqual({beat:0,bpm:90.4});
 expect(secondsAt(4,timing)).toBeCloseTo(240/90.4);
});

import { preferenceCommands, SeekCoalescer } from '../src/rehearsal/player-controls';
import { AudioEngine } from '../src/audioEngine';
it('binds player settings to accepted selection and keeps personal mix out of commands',()=>{
 expect(preferenceCommands({bpm:90,transpose:2,loopEnabled:true,loopRegion:{start:2,end:6},metronomeOn:true,startTonesOn:true},s)).toEqual([
 {type:'setTempo',pieceId:'piece',versionNo:1,bpm:90},
 {type:'setTransposition',pieceId:'piece',versionNo:1,semitones:2},
 {type:'setLoop',pieceId:'piece',versionNo:1,enabled:true,startBeat:2,endBeat:6},
 {type:'setMetronome',enabled:true},{type:'setStartingTones',enabled:true}]);
 expect(preferenceCommands({bpm:90},{...s,pieceId:null,versionNo:null})).toEqual([]);
});
it('coalesces seek drags and flushes latest bound value on release, cancels on leave',()=>{
 vi.useFakeTimers();let now=0;const send=vi.fn();const seeks=new SeekCoalescer(send,()=>now);
 seeks.seek(1,s);now=20;seeks.seek(2,s);now=40;seeks.seek(3,s);
 expect(send).toHaveBeenCalledTimes(1);
 now=150;vi.advanceTimersByTime(150);
 expect(send).toHaveBeenLastCalledWith({type:'seek',pieceId:'piece',versionNo:1,beat:3});
 now=160;seeks.seek(4,s,true);expect(send).toHaveBeenCalledTimes(3);
 now=170;seeks.seek(5,s);seeks.cancel();vi.advanceTimersByTime(200);expect(send).toHaveBeenCalledTimes(3);
 vi.useRealTimers();
});
/** Exercise the actual engine entry point with a fake output clock and voice factory. */
function fakeSharedEngine(){
 const engine=Object.create(AudioEngine.prototype) as AudioEngine;
 const voice={sources:[],gain:{gain:{cancelAndHoldAtTime:vi.fn(),linearRampToValueAtTime:vi.fn()}}};
 const note=vi.fn((..._args:any[])=>voice);
 Object.assign(engine,{ctx:{currentTime:10,state:'running',baseLatency:0,outputLatency:0},score:{notes:[{partId:'a',startBeat:4,durationBeats:2,midi:60}],totalBeats:16},partGains:new Map([['a',{}]]),scheduledVoices:[],beatMarkers:[],idleTimer:null,lightOffsetSec:0,outputLatencyOffsetMs:0,playNote:note,dynamicLevel:()=>1});
 return {engine,note,voice};
}
it('engine schedules tempo-map notes at mapped future start and retains old voices until effective pause',()=>{
 const {engine,note,voice}=fakeSharedEngine();
 const now=performance.timeOrigin+performance.now();
 const state={...s,status:'playing' as const,anchor:{beat:0,serverTime:now+400},effectiveAt:now+400};
 const scheduled=engine.scheduleShared(state,t,now,0,[]);
 expect(scheduled.serverTime).toBe(now+400);
 expect(note.mock.calls[0][1]).toBeCloseTo(scheduled.audioTime+2,2);
 expect(note.mock.calls[0][2]).toBeCloseTo(2);
 engine.scheduleShared({...state,status:'paused',effectiveAt:now+800,anchor:{beat:.8,serverTime:now+800}},t,now,0,[]);
 expect(voice.gain.gain.cancelAndHoldAtTime.mock.calls[0][0]).toBeGreaterThan(10.7);
});
it('engine late join skips expired pre-roll and schedules at integrated score position',()=>{
 const {engine,note}=fakeSharedEngine();const now=performance.timeOrigin+performance.now();
 engine.scheduleShared({...s,status:'countingIn',anchor:{beat:0,serverTime:now-3000},effectiveAt:now-3000,countInUntil:now-3000,startingTonesUntil:now-4000},t,now,0,[]);
 expect(engine.getCurrentBeat()).toBeCloseTo(5,1);
 expect(note).toHaveBeenCalledTimes(1);
});
it('engine fills repeated tempo-map loop windows and avoids retriggering held notes on refill',()=>{
 const {engine,note}=fakeSharedEngine();const now=performance.timeOrigin+performance.now();
 engine.scheduleShared({...s,status:'playing',anchor:{beat:2,serverTime:now+400},effectiveAt:now+400,loop:{enabled:true,startBeat:2,endBeat:6}},t,now,0,[]);
 expect(note.mock.calls.length).toBeGreaterThanOrEqual(2);
 const first=note.mock.calls[0][1],second=note.mock.calls[1][1];
 expect(second-first).toBeCloseTo(3,2);
 const before=note.mock.calls.length;
 engine.tick();expect(note.mock.calls.length).toBe(before);
});
it('whole-piece loop sends explicit bounds required by the existing controller',()=>{
 expect(preferenceCommands({loopEnabled:true},s,16)).toEqual([{type:'setLoop',pieceId:'piece',versionNo:1,enabled:true,startBeat:0,endBeat:16}]);
});
it('drift uses musical milliseconds and the shortest distance over a loop wrap',async()=>{
 const {playbackDriftMs}=await import('../src/rehearsal/schedule');
 const state={...s,status:'playing' as const,anchor:{beat:2,serverTime:0},loop:{enabled:true,startBeat:2,endBeat:6}};
 expect(playbackDriftMs(state,3010,5.99,t)).toBeCloseTo(20);
 expect(playbackDriftMs({...state,loop:{enabled:false,startBeat:null,endBeat:null}},1000,3.9,t)).toBeCloseTo(50);
});

it('keeps calibration through dropped pings and starts a fresh round after reconnect',async()=>{
 const {PlaybackClock}=await import('../src/rehearsal/client-clock');
 let count=0,release!:()=>void;let block=false;
 const clock=new PlaybackClock(async()=>{count++;if(block){block=false;await new Promise<void>(r=>release=r);}if(count===9)throw Error('dropped');return 1500;},()=>{},()=>1000);
 await clock.refresh();await clock.refresh();expect(clock.usable).toBe(true);expect(clock.diagnostics?.sampleCount).toBe(7);
 block=true;const old=clock.refresh();const fresh=clock.reconnect();release();await Promise.all([old,fresh]);expect(count).toBeGreaterThan(24);expect(clock.usable).toBe(true);
});
it('isolates a throwing subscriber and repairs an invalid broadcast with a snapshot',async()=>{
 const {SocketPlaybackTransport}=await import('../src/rehearsal/socket-transport');
 const handlers=new Map<string,any>();const events:string[]=[];
 const socket:any={connected:true,on:(e:string,fn:any)=>handlers.set(e,fn),off:()=>{},disconnect:()=>{},volatile:{emit:(e:string,_input:any,ack:any)=>{events.push(e);ack({state:s});}}};
 const transport=new SocketPlaybackTransport(socket,'ensemble',()=>1000);let calls=0;
 transport.subscribe(()=>{throw Error('listener');});transport.subscribe(()=>{calls++;});
 await transport.join();expect(transport.ready).toBe(true);expect(calls).toBe(1);
 expect(()=>handlers.get('playback:state')({invalid:true})).not.toThrow();
 await vi.waitFor(()=>expect(events).toContain('rehearsal:snapshot'));transport.dispose();
});
it('rejects stale and suspended output timestamps',async()=>{
 const {serverToAudioTime}=await import('../src/rehearsal/client-clock');
 for(const state of ['running','suspended'])expect(serverToAudioTime(145000,0,{state,currentTime:10,outputLatency:.1,getOutputTimestamp:()=>({contextTime:0,performanceTime:1000})},44000,100000)).toBeCloseTo(10.9);
});
it('clamps the first tempo mark and keeps pre-roll grid origin after a preference change',async()=>{
 const timing=timingFromScore({tempo:120,totalBeats:16,measures:[],marks:[{kind:'tempo',beat:0,tempoBpm:2000}]} as any);
 expect(timing.baseBpm).toBe(1000);
 const {playbackSchedule}=await import('../src/rehearsal/schedule');
 const state={...s,status:'countingIn' as const,bpm:120,anchor:{beat:0,serverTime:2400},effectiveAt:3550,countInUntil:4400};
 expect(playbackSchedule(state,3500,t).countIn?.from).toBe(2400);
});
it('keeps stopped pause stopped and disables loop for paused play outside loop',()=>{
 expect(run({...s,status:'stopped'},{type:'pause'}).status).toBe('stopped');
 const next=run({...s,status:'paused',loop:{enabled:true,startBeat:2,endBeat:4}},{type:'play',fromBeat:6,pieceId:'piece',versionNo:1});
 expect(next.loop.enabled).toBe(false);expect(next.anchor.beat).toBe(6);
});
it('invalidates calibration when wall time advances but performance time pauses',async()=>{
 const {PlaybackClock}=await import('../src/rehearsal/client-clock');
 const wall=vi.spyOn(Date,'now');wall.mockReturnValue(1000);
 const clock=new PlaybackClock(async()=>1500,()=>{},()=>1000);
 await clock.refresh();expect(clock.usable).toBe(true);
 wall.mockReturnValue(11000);expect(clock.usable).toBe(false);
 await clock.refresh();expect(clock.usable).toBe(true);wall.mockRestore();
});
it('applies additional device output latency to the shared scheduling batch',()=>{
 const {engine}=fakeSharedEngine();const now=performance.timeOrigin+performance.now();
 const state={...s,status:'playing' as const,anchor:{beat:0,serverTime:now+400},effectiveAt:now+400};
 const first=engine.scheduleShared(state,t,now,0,[]);
 engine.outputLatencyOffsetMs=200;
 const second=engine.scheduleShared(state,t,now,0,[]);
 expect(first.audioTime-second.audioTime).toBeCloseTo(.2,2);
});
it('rejects PostgreSQL-overflow version numbers and sends asynchronously without randomUUID',async()=>{
 expect(commandSchema.safeParse({type:'selectPiece',pieceId:'piece',versionNo:2147483648}).success).toBe(false);
 const {SocketPlaybackTransport}=await import('../src/rehearsal/socket-transport');let envelope:any;
 const socket:any={connected:true,on:()=>{},off:()=>{},disconnect:()=>{},volatile:{emit:(event:string,input:any,ack:any)=>{if(event==='rehearsal:command'){envelope=input;ack({commandId:input.commandId,status:'accepted',revision:1});}else ack({state:s});}}};
 const transport=new SocketPlaybackTransport(socket,'ensemble',()=>{throw Error('clock');});await transport.join();
 await expect(transport.send({type:'stop'})).rejects.toThrow('clock');transport.dispose();
 const cryptoWithoutUUID={getRandomValues:crypto.getRandomValues.bind(crypto)};vi.stubGlobal('crypto',cryptoWithoutUUID);
 const second=new SocketPlaybackTransport(socket,'ensemble',()=>1500);
 try{await second.join();await second.send({type:'stop'});expect(envelope.clientSentAt).toBe(1500);expect(envelope.commandId).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);}finally{second.dispose();vi.unstubAllGlobals();}
});
it('keeps retrying unavailable joins beyond the old four attempts, and stops after server disconnect',async()=>{
 const {SocketPlaybackTransport}=await import('../src/rehearsal/socket-transport');vi.useFakeTimers();
 const handlers=new Map<string,any>();let attempts=0;const notices:string[]=[];
 const socket:any={connected:true,on:(e:string,fn:any)=>handlers.set(e,fn),off:()=>{},disconnect:()=>{socket.connected=false;},volatile:{emit:(_e:string,_input:any,ack:any)=>{attempts++;ack(attempts<=6?{code:'unavailable'}:{state:s});}}};
 const transport=new SocketPlaybackTransport(socket,'ensemble',()=>1000,()=>{},code=>notices.push(code));
 try{handlers.get('connect')();await vi.advanceTimersByTimeAsync(30000);expect(attempts).toBe(7);expect(transport.ready).toBe(true);
 handlers.get('rehearsal:closed')({code:'socket_limit'});handlers.get('disconnect')('io server disconnect');await vi.advanceTimersByTimeAsync(60000);expect(attempts).toBe(7);expect(notices.at(-1)).toBe('socket_limit');expect(transport.ready).toBe(false);
 }finally{transport.dispose();vi.useRealTimers();}
});
