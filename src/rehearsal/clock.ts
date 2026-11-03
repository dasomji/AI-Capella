export interface ClockSample {
    t0: number;
    tServer: number;
    t1: number;
}
/** At least eight valid samples; median of the lowest RTT quartile (at least 3).
 * Uncertainty bounds asymmetry, which cannot be inferred from round trips. */
export function estimateClock(samples: ClockSample[]) {
    const valid = samples.filter(s => [s.t0, s.tServer, s.t1].every(Number.isFinite) && s.t1 >= s.t0).sort((a, b) => (a.t1 - a.t0) - (b.t1 - b.t0));
    if (valid.length < 8)
        return null;
    const best = valid.slice(0, Math.max(3, Math.ceil(valid.length / 4)));
    const offsets = best.map(s => s.tServer - (s.t0 + s.t1) / 2).sort((a, b) => a - b);
    const offsetMs = offsets[Math.floor(offsets.length / 2)];
    const uncertaintyMs = Math.max(...best.map(s => (s.t1 - s.t0) / 2 + Math.abs(s.tServer - (s.t0 + s.t1) / 2 - offsetMs)));
    return { offsetMs, uncertaintyMs, sampleCount: valid.length };
}
