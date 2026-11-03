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
    expect(estimateClock(Array(7).fill({ t0: 0, tServer: 0, t1: 0 }))).toBeNull();
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
 expect(serverToAudioTime(102500,500,{currentTime:10,getOutputTimestamp:()=>({contextTime:9.9,performanceTime:1000})},1000,100000)).toBeCloseTo(10.9);
 expect(serverToAudioTime(102500,500,{currentTime:10,outputLatency:.1},1000,100000)).toBeCloseTo(10.9);
});
it('plans future and late starts, skips expired pre-roll and preserves effective-time tempo position',async()=>{
 const {playbackSchedule}=await import('../src/rehearsal/schedule');
 const playing=run(s,{type:'play'});
 expect(playbackSchedule(playing,0,t)).toMatchObject({musicAt:400,beat:0,playing:true});
 expect(playbackSchedule(playing,3400,t)).toMatchObject({musicAt:3400,beat:5,startingTones:null,countIn:null});
 const pre=run({...s,countIn:{bars:1},startingTones:{enabled:true}},{type:'play'});
 expect(playbackSchedule(pre,10000,t)).toMatchObject({startingTones:null,countIn:null});
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
 expect(paused.status).toBe('paused');
 expect(run(paused,{type:'pause'},1000)).toBe(paused);
});
