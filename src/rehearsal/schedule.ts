import type { RehearsalState } from './contract';
import { lateJoin, positionAt } from './controller';
import { secondsAt, type PieceTiming } from './timeline';
/** Pure decision seam. UI/audio integration must retain the old schedule until effectiveAt.
 * Musical beats stay in source coordinates; tempoFactor scales the entire score tempo map. */
export function playbackSchedule(state: RehearsalState, now: number, timing: PieceTiming) {
  const joined=lateJoin(state,now,timing);
  const effectiveAt=Math.max(now,state.effectiveAt ?? state.anchor.serverTime);
  const musicAt=Math.max(effectiveAt,state.countInUntil ?? 0,state.startingTonesUntil ?? 0);
  const beat=positionAt(state,musicAt,timing);
  return {
    revision:state.revision, effectiveAt, musicAt, beat, status:joined.status, endsAt:state.endsAt, loop:state.loop,
    playing:joined.status==='playing'||joined.status==='countingIn',
    tempoFactor:state.bpm/timing.baseBpm, transposition:state.transposition,
    countIn:joined.countInUntil===null ? null : {from:state.startingTonesUntil ?? state.anchor.serverTime,until:joined.countInUntil},
    startingTones:joined.startingTonesUntil===null ? null : {from:state.anchor.serverTime,until:joined.startingTonesUntil},
    // Each note's scheduled offset must integrate the source tempo map, not divide beats by one BPM.
    secondsFromBeat:(targetBeat:number)=>(secondsAt(targetBeat,timing)-secondsAt(beat,timing))*timing.baseBpm/state.bpm,
  };
}
/** Compare score-time positions, taking the shortest distance across a loop wrap. */
export function playbackDriftMs(state:RehearsalState,now:number,actualBeat:number,timing:PieceTiming){
 const factor=timing.baseBpm/state.bpm*1000;
 let delta=(secondsAt(positionAt(state,now,timing),timing)-secondsAt(actualBeat,timing))*factor;
 if(state.loop.enabled && state.loop.startBeat!==null && state.loop.endBeat!==null){
  const span=(secondsAt(state.loop.endBeat,timing)-secondsAt(state.loop.startBeat,timing))*factor;
  if(span>0)delta=((delta+span/2)%span+span)%span-span/2;
 }
 return delta;
}
