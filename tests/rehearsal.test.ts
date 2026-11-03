import { it, expect } from 'vitest';
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
    const changed = run(playing, { type: 'setTempo', bpm: 60 }, 2000);
    expect(changed.anchor.beat).toBe(positionAt(playing, 2400, t));
    expect(positionAt(changed, 3400, t)).toBeCloseTo(4.5);
});
it('wraps loops in musical time and clamps natural end', () => {
    let playing = run(s, { type: 'setLoop', enabled: true, startBeat: 2, endBeat: 6 });
    playing = run(playing, { type: 'play', fromBeat: 2 });
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
const commands: Command[] = [{ type: 'selectPiece', pieceId: 'piece', versionNo: 1 }, { type: 'play' }, { type: 'pause' }, { type: 'stop' }, { type: 'seek', beat: 2 }, { type: 'setTempo', bpm: 90 }, { type: 'setTransposition', semitones: 2 }, { type: 'setLoop', enabled: false }, { type: 'setMetronome', enabled: true }, { type: 'setCountIn', bars: 0 }, { type: 'setStartingTones', enabled: false }, { type: 'playStartingTones' }];
it.each(commands)('writes explicit pre-roll fields for $type and checks its revision policy', c => {
    const old = { ...s, revision: 2, status: 'playing' as const, countInUntil: 999, startingTonesUntil: 888 };
    const next = run(old, c);
    expect(Object.keys(next).sort()).toEqual(Object.keys(old).sort());
    if (c.type !== 'play' && c.type !== 'playStartingTones') {
        expect(next.countInUntil).toBeNull();
        expect(next.startingTonesUntil).toBeNull();
    }
    const stale = apply(old, envelope(c), { now: 0, leadTimeMs: 400, pieceTiming: t, userId: 'user' });
    expect('code' in stale ? stale.code : 'accepted').toBe(revisionChecked[c.type] ? 'stale' : 'accepted');
});
it('rejects invalid loop/beat, future revision and expired envelopes', () => {
    expect(apply(s, envelope({ type: 'seek', beat: 17 }), { now: 0, leadTimeMs: 0, pieceTiming: t, userId: 'user' })).toEqual({ code: 'invalid' });
    expect(apply(s, envelope({ type: 'stop' }, 1), { now: 0, leadTimeMs: 0, pieceTiming: t, userId: 'user' })).toEqual({ code: 'stale' });
    expect(apply(s, envelope({ type: 'stop' }), { now: 6000, leadTimeMs: 0, pieceTiming: t, userId: 'user' })).toEqual({ code: 'expired' });
    expect(commandSchema.safeParse({ type: 'setTempo', bpm: 0 }).success).toBe(false);
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
