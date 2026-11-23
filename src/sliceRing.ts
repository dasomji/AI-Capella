/**
 * Bookkeeping for a ring of pre-painted slices of a long horizontal strip (the sheet view's music,
 * see StaffView): slice i covers the strip's columns [i * width, (i + 1) * width) and is kept in
 * slot i mod slots of one canvas, so the strip scrolling on reuses the slots of the slices it has
 * left behind -- a buffer only a little wider than the view, painted a slice at a time.
 */
export class SliceRing {
  private held: number[] = [];

  constructor(readonly width: number) {}

  get slots(): number {
    return this.held.length;
  }

  /** A ring of `slots` empty slots. */
  reset(slots: number) {
    this.held = new Array<number>(slots).fill(NaN);
  }

  /** Forgets every slice (their content changed). */
  clear() {
    this.held.fill(NaN);
  }

  slotOf(slice: number): number {
    const n = this.held.length;
    return ((slice % n) + n) % n;
  }

  holds(slice: number): boolean {
    return this.held.length > 0 && this.held[this.slotOf(slice)] === slice;
  }

  /** Slice `slice` is now painted in its slot (in place of whichever it held). */
  hold(slice: number) {
    this.held[this.slotOf(slice)] = slice;
  }

  /** The first and last slice over the strip's columns [from, to). */
  span(from: number, to: number): [number, number] {
    return [Math.floor(from / this.width), Math.floor((to - 1) / this.width)];
  }
}

/** [from, to) without [gapFrom, gapTo): up to two stretches, each [a, b) with a < b. */
export function around(from: number, to: number, gapFrom: number, gapTo: number): [number, number][] {
  if (gapTo <= from || gapFrom >= to || gapFrom >= gapTo) return from < to ? [[from, to]] : [];
  const out: [number, number][] = [];
  if (gapFrom > from) out.push([from, gapFrom]);
  if (gapTo < to) out.push([gapTo, to]);
  return out;
}
