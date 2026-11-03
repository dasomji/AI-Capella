import type { Command, Envelope, RehearsalState as State, RejectionCode } from './contract';
import { secondsAt, beatAt, type PieceTiming } from './timeline';
export const revisionChecked: Record<Command['type'], boolean> = { selectPiece: false, play: true, pause: true, stop: false, seek: true, setTempo: false, setTransposition: false, setLoop: true, setMetronome: false, setCountIn: false, setStartingTones: false, playStartingTones: true };
export function initialState(ensembleId: string, userId: string, now: number): State {
    return { ensembleId, revision: 0, pieceId: null, versionNo: null, status: 'stopped', anchor: { serverTime: now, beat: 0 }, bpm: 100, transposition: 0, loop: { enabled: false, startBeat: null, endBeat: null }, metronome: false, countIn: { bars: 0 }, countInUntil: null, startingTones: { enabled: false }, startingTonesUntil: null, endsAt: null, updatedBy: userId, updatedAt: now };
}
export function positionAt(s: State, now: number, t: PieceTiming): number {
    if (s.status === 'paused' || s.status === 'stopped')
        return s.anchor.beat;
    const start = Math.max(s.anchor.serverTime, s.countInUntil ?? 0, s.startingTonesUntil ?? 0);
    let seconds = secondsAt(s.anchor.beat, t) + Math.max(0, now - start) / 1000 * s.bpm / t.baseBpm;
    if (s.loop.enabled && s.loop.startBeat !== null && s.loop.endBeat !== null) {
        const a = secondsAt(s.loop.startBeat, t), b = secondsAt(s.loop.endBeat, t);
        if (seconds >= b)
            seconds = a + (seconds - a) % (b - a);
    }
    return Math.min(t.totalBeats, beatAt(seconds, t));
}
export type Rejection = {
    code: RejectionCode;
};
export function apply(s: State, e: Envelope, ctx: {
    now: number;
    leadTimeMs: number;
    pieceTiming: PieceTiming;
    userId: string;
}): State | Rejection {
    const { now, pieceTiming: t } = ctx, c = e.command, at = now + ctx.leadTimeMs;
    if (e.baseRevision > s.revision || (revisionChecked[c.type] && e.baseRevision < s.revision))
        return { code: 'stale' };
    if (now - e.clientSentAt > 5000 || e.clientSentAt > now + 5000)
        return { code: 'expired' };
    if (!s.pieceId && !['selectPiece', 'stop', 'setTempo', 'setTransposition', 'setMetronome', 'setCountIn', 'setStartingTones'].includes(c.type))
        return { code: 'not_found' };
    let beat = positionAt(s, at, t);
    let status: State['status'] = s.status === 'countingIn' ? 'playing' : s.status;
    let pieceId = s.pieceId, versionNo = s.versionNo, bpm = s.bpm, transposition = s.transposition;
    let loop = { ...s.loop }, metronome = s.metronome, bars = s.countIn.bars, enabled = s.startingTones.enabled;
    let countInUntil: number | null = null, startingTonesUntil: number | null = null;
    if (c.type === 'selectPiece') {
        pieceId = c.pieceId;
        versionNo = c.versionNo;
        beat = 0;
        status = 'stopped';
        bpm = t.baseBpm;
        transposition = 0;
        loop = { enabled: false, startBeat: null, endBeat: null };
        bars = 0;
        enabled = false;
    }
    if (c.type === 'play') {
        beat = c.fromBeat ?? beat;
        status = 'playing';
        if (enabled)
            startingTonesUntil = at + 2000;
        if (bars) {
            const m = [...t.measures].reverse().find(m => m.startBeat <= beat);
            const localBpm = ([...t.tempos].reverse().find(p => p.beat <= beat)?.bpm ?? t.baseBpm) * bpm / t.baseBpm;
            const duration = bars * (m ? m.beats * 4 / m.beatType : 4) * 60000 / localBpm;
            countInUntil = (startingTonesUntil ?? at) + duration;
            status = 'countingIn';
        }
    }
    if (c.type === 'pause')
        status = 'paused';
    if (c.type === 'stop') {
        status = 'stopped';
        beat = 0;
    }
    if (c.type === 'seek')
        beat = c.beat;
    if (c.type === 'setTempo')
        bpm = c.bpm;
    if (c.type === 'setTransposition')
        transposition = c.semitones;
    if (c.type === 'setMetronome')
        metronome = c.enabled;
    if (c.type === 'setCountIn')
        bars = c.bars;
    if (c.type === 'setStartingTones')
        enabled = c.enabled;
    if (c.type === 'playStartingTones') {
        status = 'paused';
        startingTonesUntil = at + 2000;
    }
    if (c.type === 'setLoop')
        loop = { enabled: c.enabled, startBeat: c.startBeat ?? null, endBeat: c.endBeat ?? null };
    if (beat > t.totalBeats || (loop.enabled && (loop.startBeat === null || loop.endBeat === null || loop.startBeat >= loop.endBeat || loop.endBeat > t.totalBeats)))
        return { code: 'invalid' };
    const start = countInUntil ?? startingTonesUntil ?? at;
    const endsAt = pieceId && (status === 'playing' || status === 'countingIn') && !loop.enabled ? start + (secondsAt(t.totalBeats, t) - secondsAt(beat, t)) * 1000 * t.baseBpm / bpm : null;
    return { ensembleId: s.ensembleId, revision: s.revision + 1, pieceId, versionNo, status, anchor: { serverTime: at, beat }, bpm, transposition, loop, metronome, countIn: { bars }, countInUntil, startingTones: { enabled }, startingTonesUntil, endsAt, updatedBy: ctx.userId, updatedAt: now };
}
export function restartPaused(s: State, now: number, t: PieceTiming): State {
    return { ...s, revision: s.revision + 1, status: 'paused', anchor: { serverTime: now, beat: positionAt(s, now, t) }, countInUntil: null, startingTonesUntil: null, endsAt: null, updatedAt: now };
}
/** offset = server minus local clock. Client schedules remaining pre-roll only. */
export function lateJoin(s: State, now: number, t: PieceTiming, offsetMs = 0) {
    const start = Math.max(now, s.anchor.serverTime, s.countInUntil ?? 0, s.startingTonesUntil ?? 0);
    return { status: s.endsAt !== null && now >= s.endsAt ? 'stopped' : s.status === 'countingIn' && now >= (s.countInUntil ?? 0) ? 'playing' : s.status, beat: positionAt(s, now, t), localTime: start - offsetMs, countInUntil: s.countInUntil !== null && s.countInUntil > now ? s.countInUntil - offsetMs : null, startingTonesUntil: s.startingTonesUntil !== null && s.startingTonesUntil > now ? s.startingTonesUntil - offsetMs : null };
}
