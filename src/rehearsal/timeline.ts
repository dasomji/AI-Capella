import type { Score } from '../score';
/** Quarter-note units, matching Score, AudioEngine and getBeatMarkers. */
export interface PieceTiming { totalBeats:number; baseBpm:number; tempos:{beat:number;bpm:number}[]; measures:{startBeat:number;beats:number;beatType:number}[] }
export function timingFromScore(score:Score):PieceTiming {
 const baseBpm=score.tempo && score.tempo>0 ? score.tempo : 100;
 const tempos=new Map<number,number>([[0,baseBpm]]);
 const units:Record<string,number>={whole:4,half:2,quarter:1,eighth:.5,'16th':.25,'32nd':.125};
 for(const mark of score.marks ?? []) {
  const m=mark.metronome;
  if(mark.kind!=='tempo' || !m) continue;
  const bpm=Number(m.perMinute)*(units[m.unit] ?? 1)*(2-2**(-m.dots));
  if(Number.isFinite(bpm)&&bpm>0&&mark.beat>=0) tempos.set(mark.beat,bpm);
 }
 return {totalBeats:score.totalBeats,baseBpm,tempos:[...tempos].sort((a,b)=>a[0]-b[0]).map(([beat,bpm])=>({beat,bpm})),measures:score.measures.map(({startBeat,beats,beatType})=>({startBeat,beats,beatType}))};
}
export function secondsAt(beat:number,t:PieceTiming):number {
 let seconds=0;
 for(let i=0;i<t.tempos.length;i++) {
  const p=t.tempos[i]; if(beat<=p.beat) break;
  seconds+=(Math.min(beat,t.tempos[i+1]?.beat ?? beat)-p.beat)*60/p.bpm;
 }
 return seconds;
}
export function beatAt(seconds:number,t:PieceTiming):number {
 let remaining=Math.max(0,seconds);
 for(let i=0;i<t.tempos.length;i++) {
  const p=t.tempos[i], span=((t.tempos[i+1]?.beat ?? Infinity)-p.beat)*60/p.bpm;
  if(remaining<=span) return p.beat+remaining*p.bpm/60;
  remaining-=span;
 }
 return 0;
}
