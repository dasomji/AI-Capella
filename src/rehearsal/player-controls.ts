import type { Command, RehearsalState } from './contract';
import type { PlaybackState } from '../sync';
/** Translate the preserved player's preference seam, always binding to canonical selection. */
export function preferenceCommands(patch:Partial<PlaybackState>, state:RehearsalState):Command[] {
 const binding=state.pieceId && state.versionNo ? {pieceId:state.pieceId,versionNo:state.versionNo} : null;
 const commands:Command[]=[];
 if(binding && patch.bpm!==undefined) commands.push({type:'setTempo',...binding,bpm:patch.bpm});
 if(binding && patch.transpose!==undefined) commands.push({type:'setTransposition',...binding,semitones:patch.transpose});
 if(binding && (patch.loopEnabled!==undefined || patch.loopRegion!==undefined)) {
  const region=patch.loopRegion===undefined ? state.loop : patch.loopRegion ? {startBeat:patch.loopRegion.start,endBeat:patch.loopRegion.end}:null;
  commands.push({type:'setLoop',...binding,enabled:patch.loopEnabled ?? state.loop.enabled,...(region?.startBeat!=null && region?.endBeat!=null ? {startBeat:region.startBeat,endBeat:region.endBeat}:{})});
 }
 if(patch.metronomeOn!==undefined) commands.push({type:'setMetronome',enabled:patch.metronomeOn});
 if(patch.startTonesOn!==undefined) commands.push({type:'setStartingTones',enabled:patch.startTonesOn});
 return commands;
}
/** Latest target only; final release flushes even when inside the throttle interval. */
export class SeekCoalescer {
 private timer?: ReturnType<typeof setTimeout>;
 private latest?: Command;
 private last=-Infinity;
 constructor(private send:(command:Command)=>void,private now=()=>performance.now()){}
 seek(beat:number,state:RehearsalState,final=false) {
  if(!state.pieceId || !state.versionNo)return;
  this.latest={type:'seek',pieceId:state.pieceId,versionNo:state.versionNo,beat};
  if(final || this.now()-this.last>=150)this.flush();
  else {clearTimeout(this.timer);this.timer=setTimeout(()=>this.flush(),150-(this.now()-this.last));}
 }
 flush(){clearTimeout(this.timer);if(this.latest){const command=this.latest;this.latest=undefined;this.last=this.now();this.send(command);}}
 cancel(){clearTimeout(this.timer);this.latest=undefined;}
}
