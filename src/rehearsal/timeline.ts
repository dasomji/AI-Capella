import { metronomeBpm, type Score } from '../score';
export const TIMING_DERIVATION_VERSION = 2;
/** Quarter-note units, matching Score, AudioEngine and getBeatMarkers. */
export interface PieceTiming {
    derivationVersion?: number;
    totalBeats: number;
    baseBpm: number;
    tempos: {
        beat: number;
        bpm: number;
    }[];
    measures: {
        startBeat: number;
        beats: number;
        beatType: number;
    }[];
}
export function timingFromScore(score: Score): PieceTiming {
    const baseBpm = Number.isFinite(score.tempo) ? Math.min(1000,Math.max(1,score.tempo!)) : 100;
    const tempos = new Map<number, number>([[0, baseBpm]]);
    for (const mark of score.marks ?? []) {
        const m = mark.metronome;
        if (mark.kind !== 'tempo')
            continue;
        const bpm = mark.tempoBpm ?? (m ? metronomeBpm(Number(m.perMinute), m.unit, m.dots) : NaN);
        if (Number.isFinite(bpm) && bpm > 0 && mark.beat >= 0)
            tempos.set(mark.beat, Math.min(1000,Math.max(1,bpm)));
    }
    return { derivationVersion:TIMING_DERIVATION_VERSION, totalBeats: score.totalBeats, baseBpm: [...tempos].sort((a,b) => a[0]-b[0])[0][1], tempos: [...tempos].sort((a, b) => a[0] - b[0]).map(([beat, bpm]) => ({ beat, bpm })), measures: score.measures.map(({ startBeat, beats, beatType }) => ({ startBeat, beats, beatType })) };
}
export function secondsAt(beat: number, t: PieceTiming): number {
    let seconds = 0;
    for (let i = 0; i < t.tempos.length; i++) {
        const p = t.tempos[i];
        if (beat <= p.beat)
            break;
        seconds += (Math.min(beat, t.tempos[i + 1]?.beat ?? beat) - p.beat) * 60 / p.bpm;
    }
    return seconds;
}
export function beatAt(seconds: number, t: PieceTiming): number {
    let remaining = Math.max(0, seconds);
    for (let i = 0; i < t.tempos.length; i++) {
        const p = t.tempos[i], span = ((t.tempos[i + 1]?.beat ?? Infinity) - p.beat) * 60 / p.bpm;
        if (remaining <= span)
            return p.beat + remaining * p.bpm / 60;
        remaining -= span;
    }
    return 0;
}
