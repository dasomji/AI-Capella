import { describe, expect, it } from 'vitest';
import { around, SliceRing } from '../src/sliceRing';

describe('SliceRing', () => {
  it('keeps slice i in slot i mod slots, negative slices included', () => {
    const ring = new SliceRing(256);
    ring.reset(7);
    expect(ring.slotOf(0)).toBe(0);
    expect(ring.slotOf(9)).toBe(2);
    expect(ring.slotOf(-1)).toBe(6);
    expect(ring.holds(9)).toBe(false);
    ring.hold(9);
    expect(ring.holds(9)).toBe(true);
    // Slice 2 shares the slot: holding it evicts 9.
    ring.hold(2);
    expect(ring.holds(9)).toBe(false);
    expect(ring.holds(2)).toBe(true);
    ring.clear();
    expect(ring.holds(2)).toBe(false);
  });

  it('gives consecutive slices distinct slots across a span no wider than the ring', () => {
    const ring = new SliceRing(256);
    ring.reset(7);
    for (let first = -20; first < 20; first++) {
      const slots = new Set(Array.from({ length: 7 }, (_, d) => ring.slotOf(first + d)));
      expect(slots.size).toBe(7);
    }
  });

  it('finds the slices over a stretch of columns', () => {
    const ring = new SliceRing(256);
    expect(ring.span(0, 256)).toEqual([0, 0]);
    expect(ring.span(10, 600)).toEqual([0, 2]);
    expect(ring.span(-300, -10)).toEqual([-2, -1]);
  });

  it('holds nothing before it has slots', () => {
    expect(new SliceRing(256).holds(0)).toBe(false);
  });
});

describe('around', () => {
  it('cuts a gap out of a stretch', () => {
    expect(around(0, 100, 30, 60)).toEqual([[0, 30], [60, 100]]);
    expect(around(0, 100, -10, 60)).toEqual([[60, 100]]);
    expect(around(0, 100, 30, 200)).toEqual([[0, 30]]);
    expect(around(0, 100, 120, 200)).toEqual([[0, 100]]);
    expect(around(0, 100, 50, 50)).toEqual([[0, 100]]);
    expect(around(0, 100, -5, 105)).toEqual([]);
    expect(around(5, 5, 0, 1)).toEqual([]);
  });
});
