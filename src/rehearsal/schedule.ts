import type { RehearsalState } from './contract';
import { lateJoin, positionAt } from './controller';
import { secondsAt, type PieceTiming } from './timeline';
/** Pure decision seam. UI/audio integration must retain the old schedule until effectiveAt.
 * Musical beats stay in source coordinates; tempoFactor scales the entire score tempo map. */
export function playbackSchedule(state: RehearsalState, now: number, timing: PieceTiming) {
  const joined=lateJoin(state,now,timing);
  const effectiveAt=Math.max(now,state.anchor.serverTime);
  const musicAt=Math.max(effectiveAt,state.countInUntil ?? 0,state.startingTonesUntil ?? 0);
  const beat=positionAt(state,musicAt,timing);
  return {
    revision:state.revision, effectiveAt, musicAt, beat,
    playing:joined.status==='playing'||joined.status==='countingIn',
    tempoFactor:state.bpm/timing.baseBpm, transposition:state.transposition,
    countIn:joined.countInUntil===null ? null : {from:Math.max(now,state.startingTonesUntil ?? state.anchor.serverTime),until:joined.countInUntil},
    startingTones:joined.startingTonesUntil===null ? null : {from:effectiveAt,until:joined.startingTonesUntil},
    // Each note's scheduled offset must integrate the source tempo map, not divide beats by one BPM.
    secondsFromBeat:(targetBeat:number)=>(secondsAt(targetBeat,timing)-secondsAt(beat,timing))*timing.baseBpm/state.bpm,
  };
}
