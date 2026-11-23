import { voiceLabel } from './voiceIdentity';
import { readTheme, breakpoint, memoizeByTheme } from './design-system/theme';
import { backingSize } from './pixels';
import type { MeasureInfo, NoteEvent, PartInfo, Score, ScoreMark } from './score';
import type { PartMixState } from './audioEngine';
import { MARK_WEIGHT, INK1, PAPER, paper, stageFill, playheadBeam, readingStrip, drawQueryMark } from './theme';
import { backlight, NIGHT_PAPER, paintPaper, paperKind, STILL } from './paper';
import { around, SliceRing } from './sliceRing';

import { drawRulerSignature, signatureChanges, type SignatureChange } from './signatures';
import { drawInkMark, layoutMarks, MARKS_ON, type MarkLayout } from './goldInk';

// Wider than the piano roll's (70): noteheads, stems, accidentals and syllables need the room.
// A phone draws its staves larger (see updateFill), so it starts from less to show about a bar.
export const BASE_PIXELS_PER_BEAT = 120;
// How strongly the lamp shows the paper's inside around the reading line (paper.ts backlight).
const PAPER_BACKLIGHT = 0.2; // quieter than on the roll: here the music is read
const BASE_PIXELS_PER_BEAT_NARROW = 76;
export const STAFF_RULER_HEIGHT_PX = 28; // matches PianoRoll's ruler height, for a consistent look when toggling views
const PLAYHEAD_X_RATIO = 0.2;
// On a narrow (phone-width) canvas the playhead sits a little further right of the pinned margin,
// so the bar just played stays readable.
const mobileBreakpointPx = memoizeByTheme(() => parseFloat(breakpoint('score')));
const MOBILE_PLAYHEAD_X_RATIO = 0.24;
const MAX_DPR = 2;
const LINE_SPACING_PX = 9; // one staff space: distance between two adjacent staff lines
const SP = LINE_SPACING_PX;
const HALF_SPACE_PX = LINE_SPACING_PX / 2; // vertical distance per diatonic step
const STAFF_HEIGHT_PX = LINE_SPACING_PX * 4; // 5 lines, 4 gaps
// Space between one staff's bottom line and the next staff's top line: ledger lines, the lyric
// line under the staff, and the next voice's name label above its staff.
const MIN_STAFF_GAP_PX = 58;
const FIRST_STAFF_TOP_PX = 44; // room for the first voice's label and ledger lines above it
const DIMMED_ALPHA = 0.3; // matches PianoRoll's dimmed-part alpha
// Over everything left of the playhead, as in the piano roll (on parchment the played music fades).
// A note starting exactly at a measure's startBeat would otherwise land its notehead on the
// barline (both computed via the same beatToX) -- nudged right so it sits just after the barline.
// Applied only in drawNote's own local x, never in beatToX itself.
const NOTE_X_OFFSET_PX = 8;
// Fixed distance below the staff's bottom line for every lyric in that staff, so a lyric line
// reads at one height instead of bouncing with the melody. Accepted trade-off: an extreme low note
// can sit below this line, putting its lyric near its own notehead.
const LYRIC_BASELINE_OFFSET_PX = 24;
// A second lyric line, for a second voice on the staff singing other words at the same time (see
// lyricLines); the staff below moves down by as much.
const LYRIC_LINE_STEP_PX = 16;
// The staves grow to fill the view's height (up to these factors), and whatever height is left
// spreads out between them -- instead of leaving the bottom of a tall phone screen empty. The
// time axis grows only by the square root of that factor, so a phone still shows a few beats.
const MAX_FILL_SCALE_NARROW = 1.4;
const MAX_FILL_SCALE = 1.3;
const FILL_BOTTOM_PX = 12;

// The music is pre-painted (see StaffView.paintSlice): in slices of the strip this wide, kept in a
// ring of slots a little wider than the view -- the slices on screen, these many ahead of it (painted
// one per frame while playing on, so a frame never paints the music it shows) and behind it.
const SLICE_DEVICE_PX = 256;
const SLICES_AHEAD = 2;
const SLICES_BEHIND = 1;
const MAX_RING_DEVICE_PX = 8192; // defensive cap on a canvas side, as the roll's (wider: drawn directly)
const MAX_CACHE_DEVICE_PIXELS = 12e6; // the paper's cache, above this (a huge screen): painted directly
// A stretch drawn on its own (a slice, the sounding notes) also draws what lies this close beyond
// its edges: the furthest a note's accidental, dot or displaced head reaches past its own place
// beyond drawNote's 20 px of culling slack, and a syllable's half width (which can be wider).
const RANGE_SLACK_PX = 8;
const LYRIC_REACH_PX = 80;
// How far a sounding note's lit parts reach from its head (accidental, dot, flag, a second's head).
const LIT_HEAD_REACH_PX = 24;
const PAST_FADE_PX = 72; // on paper the shade fades in over this width left of the playhead
// A syllable's half width, at most (12 px type: no letter wider than its size).
const lyricReach = (lyric: string) => lyric.length * 6 + 4;

// What the pre-painted music and caches were painted with, besides the view's own state: a web font
// arriving (canvas text drawn before falls back to another face) and the paper's texture made anew.
let fontEpoch = 0;
let paperEpoch = 0;
if (typeof document !== 'undefined' && 'fonts' in document) document.fonts.addEventListener('loadingdone', () => fontEpoch++);
if (typeof window !== 'undefined') window.addEventListener('paperchange', () => paperEpoch++);

/**
 * How far the paper's texture repeats (css px) at a stretch -- as paper.ts lays it: a 512-texel tile
 * at 0.5 px per texel, scaled within one octave (its fold()). The cached paper (paintPaperArea) is
 * shown at an offset within one repeat.
 */
function paperRepeatPx(stretch: number): number {
  const l = Math.log2(Math.max(1e-3, stretch));
  return 256 * 2 ** (l - Math.floor(l));
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

/**
 * A new canvas for a cache painted again (the old one's memory released): drawing the paper into a
 * reused one after the theme's paper changed kept a trace of the old (renderer-themes check).
 */
function freshCanvas(old: HTMLCanvasElement | null): HTMLCanvasElement {
  if (old) old.width = old.height = 0;
  return document.createElement('canvas');
}

// Engraving glyphs from the SMuFL font (Eugene, bundled as a subset -- see theme.ts FONT_MUSIC). SMuFL
// fonts are drawn at 4 staff spaces per em, with each glyph's origin at its musical reference point
// (a notehead's centre line, a G clef's G line, a rest's staff line), so fillText at a staff
// position places the glyph exactly where an engraver would.

const GLYPH = {
  gClef: '\uE050',
  gClef8vb: '\uE052',
  fClef: '\uE062',
  noteheadWhole: '\uE0A2',
  noteheadHalf: '\uE0A3',
  noteheadBlack: '\uE0A4',
  // Cross noteheads (claps, cymbals) and the percussion clef.
  noteheadXWhole: '\uE0A7',
  noteheadXHalf: '\uE0A8',
  noteheadXBlack: '\uE0A9',
  percussionClef: '\uE069',
  dot: '\uE1E7',
  restWhole: '\uE4E3',
  restHalf: '\uE4E4',
  restQuarter: '\uE4E5',
  rest8th: '\uE4E6',
  rest16th: '\uE4E7',
  rest32nd: '\uE4E8',
};
const FLAG_UP = ['', '\uE240', '\uE242', '\uE244'];
const FLAG_DOWN = ['', '\uE241', '\uE243', '\uE245'];
// Eugene's metrics, in staff spaces (from its SMuFL metadata): notehead widths, the stem anchors
// (stemUpSE / stemDownNW: how far off the notehead's centre line a stem starts -- above it going up,
// below it going down; a half note's further out than a black one's), line thicknesses.
const HEAD_W = 1.14 * SP;
const WHOLE_HEAD_W = 1.516 * SP;
const STEM_UP_Y = { black: 0.1 * SP, half: 0.152 * SP };
const STEM_DOWN_Y = { black: 0.148 * SP, half: 0.212 * SP };
const STEM_THICKNESS = Math.max(1.1, 0.12 * SP);
const STEM_LENGTH = 3.5 * SP;
// Beams (drawBeams): a beam's thickness, the step from one beam level to the next, the shortest a
// beamed stem may get, and a hook's length.
const BEAM_THICKNESS = 0.5 * SP;
const BEAM_STEP = 0.75 * SP;
const MIN_BEAMED_STEM = 2.5 * SP;
const BEAM_HOOK = 1.1 * SP;
const LEDGER_EXTENSION = 0.3 * SP;
const CLEF_W = 2.55 * SP;
const KEY_ACCIDENTAL_ADVANCE = 1.0 * SP;

const LETTER_INDEX: Record<string, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };

function diatonicIndex(step: string, octave: number): number {
  return octave * 7 + (LETTER_INDEX[step] ?? 0);
}

type ClefType = 'treble' | 'bass';
// The bottom line's diatonic index for each clef -- everything else is positioned relative to it.
const CLEF_BOTTOM_LINE: Record<ClefType, number> = {
  treble: diatonicIndex('E', 4),
  bass: diatonicIndex('G', 2),
};

/**
 * Resolves a part's clef + octave shift, preferring the actually-notated MusicXML <clef> (sign/
 * line/clef-octave-change) over the average-pitch heuristic when it's present and one of the two
 * shapes this view can draw (a plain G or F clef). octaveShift is in whole octaves and only ever
 * affects where a note is *positioned* on the staff (added to its diatonic index before comparing
 * against the clef's fixed bottom line) -- never its pitch/spelling/MIDI, which is already
 * correct pitch data regardless of clef. Its most common real value is +1, for the standard choir
 * "tenor clef" convention: a G clef printed with a small 8 below it (MusicXML clef-octave-change
 * -1, "this clef sounds an octave lower than written") -- so tenor notes are actually WRITTEN an
 * octave higher than they sound, landing on/near the staff instead of on many ledger lines below
 * it the way plotting them at their literal sounding octave against a plain treble clef would.
 * Any other sign (a true tenor C-clef, e.g. -- rare in choir writing, and this view has no C-clef
 * glyph to draw anyway) falls back to the heuristic rather than guessing a shape/position that
 * doesn't match what's actually printed.
 */
function resolveClef(clef: PartInfo['clef'], avgMidi: number): { clef: ClefType; octaveShift: number } {
  const octaveShift = -(clef?.octaveChange ?? 0);
  if (clef?.sign === 'G') return { clef: 'treble', octaveShift };
  if (clef?.sign === 'F') return { clef: 'bass', octaveShift };
  return { clef: avgMidi >= 60 ? 'treble' : 'bass', octaveShift: 0 };
}

// Fallback spelling for notes with no parsed step/alter/octave (MIDI imports have no source
// spelling to preserve): a fixed sharps-preferred chromatic table. MusicXML-sourced notes always
// carry their real notated spelling instead (see score.ts's NoteEvent doc comment).
const CHROMATIC_FALLBACK: { step: string; alter: number }[] = [
  { step: 'C', alter: 0 },
  { step: 'C', alter: 1 },
  { step: 'D', alter: 0 },
  { step: 'D', alter: 1 },
  { step: 'E', alter: 0 },
  { step: 'F', alter: 0 },
  { step: 'F', alter: 1 },
  { step: 'G', alter: 0 },
  { step: 'G', alter: 1 },
  { step: 'A', alter: 0 },
  { step: 'A', alter: 1 },
  { step: 'B', alter: 0 },
];

// Standard key-signature accidental positions (in the same staff-position units as note glyphs --
// even = line, odd = space, 0 = bottom line, 8 = top line), independently verified against
// external music-theory references. Order matches the traditional sharp/flat drawing order
// (F,C,G,D,A,E,B for sharps; B,E,A,D,G,C,F for flats), one entry per possible key-signature count.
const SHARP_POSITIONS: Record<ClefType, number[]> = {
  treble: [8, 5, 9, 6, 3, 7, 4],
  bass: [6, 3, 7, 4, 1, 5, 2],
};
const FLAT_POSITIONS: Record<ClefType, number[]> = {
  treble: [4, 7, 3, 6, 2, 5, 1],
  bass: [2, 5, 1, 4, 0, 3, -1],
};
const SHARP_LETTER_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_LETTER_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

/** Per-letter alter implied by a key signature -- e.g. fifths=2 (D major) implies F and C are sharp. */
function impliedAlterForFifths(fifths: number): Record<string, number> {
  const map: Record<string, number> = {};
  if (fifths > 0) {
    for (let i = 0; i < Math.min(fifths, 7); i++) map[SHARP_LETTER_ORDER[i]] = 1;
  } else if (fifths < 0) {
    for (let i = 0; i < Math.min(-fifths, 7); i++) map[FLAT_LETTER_ORDER[i]] = -1;
  }
  return map;
}

// SMuFL accidentals: natural, sharp, flat, plus double sharp/flat as a defensive fallback.
function accidentalGlyph(alter: number): string {
  if (alter === 0) return '\uE261';
  if (alter === 1) return '\uE262';
  if (alter === -1) return '\uE260';
  return alter >= 2 ? '\uE263' : '\uE264';
}

function spellingFor(note: NoteEvent): { step: string; alter: number; octave: number } {
  if (note.step && note.octave != null) return { step: note.step, alter: note.alter ?? 0, octave: note.octave };
  const pitchClass = ((note.midi % 12) + 12) % 12;
  const octave = Math.floor(note.midi / 12) - 1;
  const fallback = CHROMATIC_FALLBACK[pitchClass];
  return { step: fallback.step, alter: fallback.alter, octave };
}

const LETTER_ORDER = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const NATURAL_SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function naturalMidi(step: string, octave: number): number {
  return (octave + 1) * 12 + (NATURAL_SEMITONES[step] ?? 0);
}

// Circle-of-fifths shift (for the transposed key signature) and diatonic letter shift (for note
// respelling), for every semitone count the app's transpose control can produce (MIN/MAX_TRANSPOSE
// = -7/+7 in main.ts). letterShift is NOT a pure function of fifthsShift alone (two semitone
// counts can share the same fifthsShift, e.g. +6/-6 both landing on fifthsShift=+6 via the
// tritone's conventional sharp-side spelling, yet need different letterShifts to match their own
// actual interval size) -- independently verified per semitone count rather than derived by a
// simpler formula that was checked and found to sometimes pick the enharmonically wrong side of a
// letter shift relative to the fifths-shift-selected key signature.
const TRANSPOSE_TABLE: Record<number, { fifthsShift: number; letterShift: number }> = {
  [-7]: { fifthsShift: -1, letterShift: -4 },
  [-6]: { fifthsShift: 6, letterShift: -4 },
  [-5]: { fifthsShift: 1, letterShift: -3 },
  [-4]: { fifthsShift: -4, letterShift: -2 },
  [-3]: { fifthsShift: 3, letterShift: -2 },
  [-2]: { fifthsShift: -2, letterShift: -1 },
  [-1]: { fifthsShift: 5, letterShift: -1 },
  0: { fifthsShift: 0, letterShift: 0 },
  1: { fifthsShift: -5, letterShift: 1 },
  2: { fifthsShift: 2, letterShift: 1 },
  3: { fifthsShift: -3, letterShift: 2 },
  4: { fifthsShift: 4, letterShift: 2 },
  5: { fifthsShift: -1, letterShift: 3 },
  6: { fifthsShift: 6, letterShift: 3 },
  7: { fifthsShift: 1, letterShift: 4 },
};

/**
 * Respells a note for a transposed key: shifts its letter by the transpose's letterShift (via
 * diatonicIndex, carrying the octave on wraparound), then solves for whichever alter makes that
 * new letter/octave hit the actual transposed pitch (midi + semitones) exactly -- so the spelling
 * always matches both the transposed key signature (same fifthsShift-derived letterShift) and the
 * real sounding pitch, rather than just shifting the alter and keeping the original letter.
 */
function transposeSpelling(spelling: { step: string; alter: number; octave: number }, midi: number, semitones: number): { step: string; alter: number; octave: number } {
  const shift = TRANSPOSE_TABLE[semitones];
  if (!semitones || !shift) return spelling;
  const newDiatonicIndex = diatonicIndex(spelling.step, spelling.octave) + shift.letterShift;
  const newOctave = Math.floor(newDiatonicIndex / 7);
  const newStep = LETTER_ORDER[((newDiatonicIndex % 7) + 7) % 7];
  const alter = midi + semitones - naturalMidi(newStep, newOctave);
  return { step: newStep, alter, octave: newOctave };
}

/** A note's place in a chord of its voice: shared stem direction, whether it draws the stem (up to
 *  the chord's furthest note, in staff positions), and a sideways shift for a second. */
/** One stem: the heads of one voice struck at one moment, and the beam marks it carries. */
interface BeamStem {
  at: number; // beat x 1e4, rounded (the key heads are grouped by)
  beat: number;
  voice: string;
  dur: number;
  heads: { n: NoteEvent; k: number; dur: number; pos: number }[]; // lowest first
  marks: string[] | undefined; // per beam level, as engraved
  forcedUp: boolean | null; // two voices on the staff: the upper one's stems up, the lower one's down
}

interface ChordPlace {
  stemUp: boolean;
  stemTo: number | null;
  dx: number;
}

type Segment = { startBeat: number; durationBeats: number };

/** One note as engraved (see layStaff): whether it shows an accidental, its heads, its chord places. */
interface LaidNote {
  startBeat: number;
  note: NoteEvent;
  accidental: boolean;
  segments: Segment[];
  chords: (ChordPlace | undefined)[] | undefined;
}

/** A staff's music laid out once for the whole piece: notes and beam groups, both by start. */
interface LaidStaff {
  notes: LaidNote[];
  maxDur: number; // the longest note, in beats (a note starting that far back can still be in view)
  beams: { startBeat: number; order: number; group: BeamStem[] }[]; // order: as laid out (drawBeams' order)
  maxBeamSpan: number;
  beamUp: Map<BeamStem, boolean>;
}

/** A dynamic, hairpin, word or tempo mark where drawMarks writes it, x at beat 0 = 0. */
interface LaidMark {
  mark: ScoreMark;
  layout: PartLayout;
  x: number;
  x2: number | undefined;
  w: number;
  rise: number; // its baseline this far above the staff's top line
  scale: number;
  tempo: boolean;
}

/** Ledger-line positions (in the same half-step units as staff position) needed for a note this far outside the staff. */
function ledgerLinePositions(staffPosition: number): number[] {
  const positions: number[] = [];
  if (staffPosition < 0) {
    const count = Math.ceil((-staffPosition - 1) / 2);
    for (let i = 1; i <= count; i++) positions.push(-2 * i);
  } else if (staffPosition > 8) {
    const count = Math.ceil((staffPosition - 8 - 1) / 2);
    for (let i = 1; i <= count; i++) positions.push(8 + 2 * i);
  }
  return positions;
}

type DurationName = 'whole' | 'half' | 'quarter' | 'eighth' | 'sixteenth' | 'thirtysecond';

interface DurationShape {
  filled: boolean; // filled notehead (quarter or shorter) vs. hollow (half/whole)
  hasStem: boolean;
  flags: number; // unbeamed eighth/16th/32nd notes get 1/2/3 flags instead of a beam
  dotted: boolean;
  name: DurationName; // which standard duration this is -- rests pick their glyph from this
}

// { quarter-beat units, filled notehead, has a stem, flag count, name } for the undotted base
// durations; classifyDuration also checks each one's dotted (x1.5) variant and keeps whichever is
// closest.
const DURATION_TABLE: { units: number; filled: boolean; hasStem: boolean; flags: number; name: DurationName }[] = [
  { units: 4, filled: false, hasStem: false, flags: 0, name: 'whole' },
  { units: 2, filled: false, hasStem: true, flags: 0, name: 'half' },
  { units: 1, filled: true, hasStem: true, flags: 0, name: 'quarter' },
  { units: 0.5, filled: true, hasStem: true, flags: 1, name: 'eighth' },
  { units: 0.25, filled: true, hasStem: true, flags: 2, name: 'sixteenth' },
  { units: 0.125, filled: true, hasStem: true, flags: 3, name: 'thirtysecond' },
];

/**
 * Maps a continuous beat-length (the only duration representation the rest of the app carries) to
 * the nearest standard notated duration, for notehead/stem/flag shape. Flagged notes the file beams
 * are drawn under their beam instead (drawBeams); the others keep their flags (see PROJECT.md).
 */
function classifyDuration(durationBeats: number): DurationShape {
  let best = DURATION_TABLE[2];
  let bestDotted = false;
  let bestDiff = Infinity;
  for (const entry of DURATION_TABLE) {
    for (const dotted of [false, true]) {
      const units = dotted ? entry.units * 1.5 : entry.units;
      const diff = Math.abs(units - durationBeats);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = entry;
        bestDotted = dotted;
      }
    }
  }
  return { filled: best.filled, hasStem: best.hasStem, flags: best.flags, dotted: bestDotted, name: best.name };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

// Standard notated durations, descending, including dotted variants -- for splitIntoNotatedSegments's
// largest-fits-without-exceeding pick. Deliberately not classifyDuration (which picks the *nearest*
// value and can exceed the remaining span, e.g. rounding a 0.9-beat remainder up to a 1-beat quarter
// note) -- classifyDuration stays exactly right for the separate job of choosing each already-
// decomposed segment's notehead/stem/flag shape, since by construction its length matches a table entry.
const STANDARD_DURATIONS = [6, 4, 3, 2, 1.5, 1, 0.75, 0.5, 0.375, 0.25, 0.1875, 0.125];
const MIN_REPRESENTABLE_BEATS = 0.0625; // half the smallest standard duration
const MAX_SEGMENTS_PER_NOTE = 64; // defensive cap against an unexpected float edge case

function measureEndBeat(measures: MeasureInfo[], idx: number): number {
  const m = measures[idx];
  const next = measures[idx + 1];
  return next ? next.startBeat : m.startBeat + m.beats * (4 / m.beatType);
}

/** The last measure starting at or before `beat` (else the first); measures are in time order. */
function measureIndexAtBeat(measures: MeasureInfo[], beat: number): number {
  let lo = 0;
  let hi = measures.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (measures[mid].startBeat > beat + 1e-9) hi = mid;
    else lo = mid + 1;
  }
  return Math.max(0, lo - 1);
}

/** Binary search (notes/gaps are always startBeat-sorted) for the first index at or after `beat`. */
function firstIndexAtOrAfter(items: { startBeat: number }[], beat: number): number {
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (items[mid].startBeat < beat) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Splits one (possibly tie-merged) note's duration into individually-notatable segments: forces a
 * split at every barline crossing (a note can't cross one in real notation, same as MusicXML
 * itself), and within a barline-clipped span greedily picks the largest standard duration that
 * fits without exceeding it. Fixes the concretely observed bug where a merged tied note (see
 * NoteEvent's doc comment on why ties are merged at parse time) rendered as one long,
 * rhythmically-illegible notehead -- e.g. the "Butterfly" arrangement's opening notes.
 */
function splitIntoNotatedSegments(startBeat: number, durationBeats: number, measures: MeasureInfo[]): { startBeat: number; durationBeats: number }[] {
  const segments: { startBeat: number; durationBeats: number }[] = [];
  let cursor = startBeat;
  let remaining = durationBeats;
  let measureIdx = measures.length ? measureIndexAtBeat(measures, cursor) : -1;
  let iterations = 0;

  while (remaining > 1e-6 && iterations < MAX_SEGMENTS_PER_NOTE) {
    iterations++;
    let span = remaining;
    if (measureIdx >= 0) {
      const untilBarline = measureEndBeat(measures, measureIdx) - cursor;
      if (untilBarline > 1e-6) span = Math.min(span, untilBarline);
    }

    if (span < MIN_REPRESENTABLE_BEATS && segments.length) {
      // Too small to represent as its own segment (a barline landing a hair off due to float
      // accumulation, or genuine leftover at the very end) -- fold it into the previous segment
      // instead, so segment durations still sum exactly to the original.
      segments[segments.length - 1].durationBeats += span;
      cursor += span;
      remaining -= span;
    } else {
      const picked = Math.min(STANDARD_DURATIONS.find((d) => d <= span + 1e-6) ?? MIN_REPRESENTABLE_BEATS, span);
      segments.push({ startBeat: cursor, durationBeats: picked });
      cursor += picked;
      remaining -= picked;
    }

    while (measureIdx >= 0 && measureIdx + 1 < measures.length && cursor >= measureEndBeat(measures, measureIdx) - 1e-6) {
      measureIdx++;
    }
  }

  if (!segments.length) {
    segments.push({ startBeat, durationBeats });
  } else if (remaining > 1e-6) {
    console.warn('[LightScore] splitIntoNotatedSegments hit its iteration cap; a note may render with an approximated duration.');
    segments[segments.length - 1].durationBeats += remaining;
  }
  return segments;
}

/**
 * Turns a NoteEvent's preserved tieSegments (the individual duration of each originally
 * tied-together <note> write) into the same {startBeat, durationBeats}[] shape
 * splitIntoNotatedSegments produces -- but without any of its barline-clipping logic, since each
 * original <note> element, by construction, could never cross a measure boundary in MusicXML
 * (that's literally why ties exist), so these segments are inherently already barline-safe.
 */
function segmentsFromTieLengths(startBeat: number, lengths: number[]): { startBeat: number; durationBeats: number }[] {
  const segments: { startBeat: number; durationBeats: number }[] = [];
  let cursor = startBeat;
  for (const len of lengths) {
    segments.push({ startBeat: cursor, durationBeats: len });
    cursor += len;
  }
  return segments;
}

/**
 * Infers the silent gaps in one part's part-writing: any span where nothing is sounding, between
 * notes or before the first/after the last. Notes sharing a startBeat (a chord/homophonic layer)
 * count as one event, using the latest end-time among them, so a gap is only reported once
 * everything sounding at that point has actually finished. Scoped to one monophonic voice per
 * part -- true for typical SATB choir writing (this app's primary use case). A genuinely
 * multi-voice part (MusicXML <backup>/<forward> producing overlapping non-chord content within
 * one part) may infer incorrect/overlapping gaps -- a known limitation, not silently mishandled
 * (it just won't happen to look right for that unusual case). `notes` must be sorted by
 * startBeat, which every part's note list already is (score.notes is sorted once at parse time).
 */
function computeRestGaps(notes: NoteEvent[], totalBeats: number): { startBeat: number; durationBeats: number }[] {
  const gaps: { startBeat: number; durationBeats: number }[] = [];
  let cursor = 0;
  let i = 0;
  while (i < notes.length) {
    const eventStart = notes[i].startBeat;
    let eventEnd = eventStart + notes[i].durationBeats;
    let j = i + 1;
    while (j < notes.length && Math.abs(notes[j].startBeat - eventStart) < 1e-6) {
      eventEnd = Math.max(eventEnd, notes[j].startBeat + notes[j].durationBeats);
      j++;
    }
    if (eventStart > cursor + 1e-6) gaps.push({ startBeat: cursor, durationBeats: eventStart - cursor });
    cursor = Math.max(cursor, eventEnd);
    i = j;
  }
  if (cursor < totalBeats - 1e-6) gaps.push({ startBeat: cursor, durationBeats: totalBeats - cursor });
  return gaps;
}

interface PartLayout {
  partId: string;
  key: string; // its notes and rests: the part's id, or for one staff of several, see staffKey
  staff: number; // 1, or which of its part's staves (a piano's two hands are one voice on two)
  ofStaves: number; // how many staves its part has
  clef: ClefType;
  octaveShift: number; // whole octaves added to a note's diatonic index before staff positioning -- see resolveClef
  topY: number; // css px, y of the staff's top line within the content area (before scroll) -- recomputed for visible staves each frame
  lyricLines: number; // 1, or 2 where two voices on the staff sing different words at once
  percussion: boolean;
}

/** A staff's height with the room under it: lines, lyrics, and the next voice's label. */
function staffSpan(layout: PartLayout): number {
  return STAFF_HEIGHT_PX + MIN_STAFF_GAP_PX + (layout.lyricLines - 1) * LYRIC_LINE_STEP_PX;
}

const voiceNumber = (n: NoteEvent) => Number(n.voice ?? 1) || 1;

/** The notes of one staff of a part printed on several are kept under this key. */
const staffKey = (partId: string, staff: number, ofStaves: number) => (ofStaves > 1 ? `${partId}#${staff}` : partId);

/**
 * Which lyric line each syllable of a staff goes on. Two voices on one staff (tenor 1 and 2) can
 * sing different words at the same time -- one holding "drop" while the other sings "Mind-less
 * de-": printed on one line they run into each other. As an engraver does, the second voice's
 * words then go on a second line under the first -- within a phrase (its notes up to a rest), all
 * the words from the first that collides to the last, so a line of words doesn't hop between
 * heights in the middle. Words that only alternate between the
 * voices stay on one line; a syllable another voice sings with it at the same moment is printed
 * once. Returns the line per syllable (-1: printed by the other voice) and how many lines there are.
 */
function lyricLines(notes: NoteEvent[]): { lines: number; lineOf: Map<NoteEvent, number> } {
  const lineOf = new Map<NoteEvent, number>();
  const sung = notes.filter((n) => n.lyric);
  if (new Set(sung.map(voiceNumber)).size < 2) return { lines: 1, lineOf };
  const EPS = 1e-6;
  const end = (n: NoteEvent) => n.startBeat + n.durationBeats;
  // A syllable of a later voice that meets one of an earlier voice: the same word at the same
  // moment is a duplicate; other words sounding at the same time collide.
  const colliding = new Set<NoteEvent>();
  for (const n of sung) {
    for (const m of sung) {
      if (voiceNumber(m) >= voiceNumber(n) || m.startBeat >= end(n) - EPS || n.startBeat >= end(m) - EPS) continue;
      if (Math.abs(m.startBeat - n.startBeat) < EPS && m.lyric === n.lyric) lineOf.set(n, -1);
      else colliding.add(n);
    }
  }
  // Phrases: each voice's notes, broken at its rests. A phrase with a collision moves down whole.
  let lines = 1;
  const byVoice = new Map<number, NoteEvent[]>();
  for (const n of notes) byVoice.set(voiceNumber(n), [...(byVoice.get(voiceNumber(n)) ?? []), n]);
  for (const voiceNotes of byVoice.values()) {
    let phrase: NoteEvent[] = [];
    let reach = -Infinity;
    const close = () => {
      // From the first colliding word to the last, whole words (syllables joined by hyphens) --
      // the words around them, alone in the music, stay on the first line.
      const words = phrase.filter((n) => n.lyric);
      let first = words.findIndex((n) => colliding.has(n));
      let last = words.length - 1 - [...words].reverse().findIndex((n) => colliding.has(n));
      if (first >= 0) {
        while (first > 0 && words[first - 1].lyricJoin) first--;
        while (last < words.length - 1 && words[last].lyricJoin) last++;
        lines = 2;
        for (const n of words.slice(first, last + 1)) if (lineOf.get(n) !== -1) lineOf.set(n, 1);
      }
      phrase = [];
    };
    for (const n of voiceNotes) {
      if (n.startBeat > reach + EPS) close();
      phrase.push(n);
      reach = Math.max(reach, end(n));
    }
    close();
  }
  return { lines, lineOf };
}

/**
 * Traditional staff notation, one 5-line staff per voice stacked top to bottom (never overlaid --
 * SATB voices sharing a pitch would be unreadable on a shared staff), set with a real engraving
 * font: neutral staff lines, notes/stems/flags in the voice's colour, and a pinned left margin
 * with each voice's name, clef and key signature that the music scrolls under -- so lyrics and
 * notes never collide with clefs, and the clef you're reading is always in view. Muted voices
 * leave the stack entirely instead of leaving a gap.
 *
 * The music is laid out once for the whole piece (layStaff, layMarks) and pre-painted, as it rests,
 * into slices of a strip kept in a ring a little wider than the view (paintSlice) -- the next
 * slices painted ahead one per frame while playing on -- and each frame shows them at whole device
 * pixels, like PianoRoll's buffer. Drawn anew every frame: only what moves against the music or
 * depends on the playhead -- the paper's lamp, the notes sounding now (in a narrow stretch, drawn
 * with everything else there in the original order, so their glow lies as before), the played
 * shade, the playhead; the paper and the pinned margin come from caches.
 *
 * Reflects the app's transpose setting fully, like a real transposed part: both the key signature
 * and every note's spelling shift together, derived from the same circle-of-fifths shift (see
 * TRANSPOSE_TABLE/transposeSpelling) so they always agree with each other.
 */
export class StaffView {
  private theme = readTheme();
  private shadeRevision = -1;
  private pastShade = '';
  private canvas: HTMLCanvasElement;
  private score: Score;
  // Where a written beat sounds: with swing (swing.ts) the notation stays as written, but each note
  // is lit when it is heard.
  private soundAt: (beat: number) => number = (beat) => beat;
  private partColor: (partId: string) => string;
  private ctx2d: CanvasRenderingContext2D;
  private dpr = 1;
  private cssWidth = 0;
  private cssHeight = 0;
  private pixelsPerBeat = BASE_PIXELS_PER_BEAT;
  private zoom = 1;
  private scrollY = 0; // css px scrolled down, when the stacked staves don't all fit vertically
  private notesByStaff: Map<string, NoteEvent[]>; // by PartLayout.key
  private layouts: PartLayout[];
  private lyricLineOf = new Map<NoteEvent, number>(); // see lyricLines; absent: the first line
  private hiddenParts = new Set<string>();
  private dimmedParts = new Set<string>();
  private signatureAt: Map<number, SignatureChange>; // by bar start beat
  private marks: MarkLayout | null; // dynamics, tempo and words in gold ink (goldInk.ts)
  private restsByStaff: Map<string, { startBeat: number; durationBeats: number }[]>;
  private transpose = 0;
  private gutterPx = 80;
  private sections: { label: string; beat: number }[] = [];
  private markedBars = new Set<number>();
  private sectionsSeen = ''; // what the ruler shows of the sections and marked bars (by value)
  private markedBarsSeen = '';
  // Fill-the-height factor (see MAX_FILL_SCALE) and the extra room between staves it leaves.
  // render() draws in "logical" units -- cssWidth/cssHeight/pixelsPerBeat swapped for the
  // scaled-down values -- under a ctx.scale(fill), so the drawing code itself is unchanged.
  private fill = 1;
  private extraGap = 0;
  // Bumped by every change of what the pre-painted music looks like (zoom, transpose, mix, size...).
  private version = 0;
  // The stretch being drawn, in the drawing's x: what lies beyond it (plus the drawing code's own
  // slack) is left out. The view's music area when drawn directly; a slice; the sounding notes.
  private drawFrom = 0;
  private drawTo = 0;
  private laid = new Map<string, LaidStaff>(); // by PartLayout.key, see layStaff
  private laidMarks: LaidMark[] = [];
  private laidStamp = '';
  // The ring of pre-painted slices (see paintSlice): the music and the ruler's bar numbers, each
  // slice SLICE_DEVICE_PX wide; the music covers the content rows [ringTop, ringTop + ringHeight).
  private ring = new SliceRing(SLICE_DEVICE_PX);
  private ringMusic: HTMLCanvasElement | null = null;
  private ringRuler: HTMLCanvasElement | null = null;
  private ringStamp = '';
  private ringTop = 0;
  private ringHeight = 0;
  private marginCache: HTMLCanvasElement | null = null;
  private marginStamp = '';
  private paperCache: HTMLCanvasElement | null = null;
  private paperStamp = '';
  private pastFade: CanvasGradient | null = null;
  private pastFadeStamp = '';
  private stats = { slices: 0, sync: 0, ahead: 0, litPx: 0, laidMs: 0 };

  constructor(canvas: HTMLCanvasElement, score: Score, partColor: (partId: string) => string) {
    this.canvas = canvas;
    this.score = score;
    this.partColor = partColor;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.ctx2d = ctx;

    this.signatureAt = new Map(signatureChanges(score.measures).map((c) => [c.beat, c]));
    this.marks = MARKS_ON ? layoutMarks(score) : null;

    // Each staff's notes: a part's, or for a part on several staves (a piano), each staff's own.
    const staffCount = new Map(score.parts.map((p) => [p.id, p.staves?.length ?? 1]));
    this.notesByStaff = new Map();
    for (const note of score.notes) {
      const of = staffCount.get(note.partId) ?? 1;
      const key = staffKey(note.partId, Math.min(of, Math.max(1, note.staff ?? 1)), of);
      const list = this.notesByStaff.get(key);
      if (list) list.push(note);
      else this.notesByStaff.set(key, [note]);
    }
    for (const list of this.notesByStaff.values()) list.sort((a, b) => a.startBeat - b.startBeat);

    // Rest gaps depend only on each staff's own notes and the piece's total length -- static for
    // the life of this score, so computed once here rather than every render.
    this.restsByStaff = new Map();
    for (const [key, notes] of this.notesByStaff) {
      this.restsByStaff.set(key, computeRestGaps(notes, score.totalBeats));
    }

    // Clef per part: see resolveClef -- prefers the actually-notated MusicXML <clef> when present
    // and recognized, falling back to a heuristic from the part's own average pitch for MIDI
    // imports or an unrecognized clef sign.
    // A part on several staves (a piano's two hands) gets one layout per staff, each with its clef.
    this.layouts = score.parts.flatMap((p) => {
      const staves = p.staves && p.staves.length > 1 ? p.staves : [{ clef: p.clef }];
      return staves.map((staffInfo, i) => {
        const key = staffKey(p.id, i + 1, staves.length);
        const notes = this.notesByStaff.get(key) ?? [];
        const avgMidi = notes.length ? notes.reduce((sum, n) => sum + n.midi, 0) / notes.length : 60;
        // A percussion staff (claps, drums): its notes sit where printed on a treble staff, under a
        // percussion clef and no key signature.
        const percussion = staffInfo.clef?.sign === 'percussion' || (notes.length > 0 && notes.every((n) => n.unpitched));
        const { clef, octaveShift } = percussion ? { clef: 'treble' as const, octaveShift: 0 } : resolveClef(staffInfo.clef, avgMidi);
        const lyrics = lyricLines(notes);
        for (const [note, line] of lyrics.lineOf) this.lyricLineOf.set(note, line);
        return { partId: p.id, key, staff: i + 1, ofStaves: staves.length, clef, octaveShift, percussion, topY: 0, lyricLines: lyrics.lines };
      });
    });
    this.updateGutter();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.cssWidth = rect.width;
    this.cssHeight = rect.height;
    this.dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const size = backingSize(this.canvas, rect.width, rect.height, this.dpr);
    this.canvas.width = size.w;
    this.canvas.height = size.h;
    this.ctx2d.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.version++;
    this.setZoom(this.zoom);
    this.updateFill();
    this.scrollByPixels(0);
  }

  /** Recomputes how far the staves grow to fill the height (see MAX_FILL_SCALE). */
  private updateFill() {
    const shown = this.layouts.filter((l) => !this.hiddenParts.has(l.partId));
    const count = shown.length;
    if (!count || this.cssHeight <= 0) {
      this.fill = 1;
      this.extraGap = 0;
      return;
    }
    const natural = STAFF_RULER_HEIGHT_PX + FIRST_STAFF_TOP_PX + shown.reduce((sum, l) => sum + staffSpan(l), 0) + FILL_BOTTOM_PX;
    const maxFill = this.cssWidth < mobileBreakpointPx() ? MAX_FILL_SCALE_NARROW : MAX_FILL_SCALE;
    this.fill = clamp(this.cssHeight / natural, 1, maxFill);
    this.extraGap = Math.max(0, (this.cssHeight / this.fill - natural) / count);
  }

  /** Height of the ruler strip on screen (it grows with the staves). */
  rulerHeight(): number {
    return STAFF_RULER_HEIGHT_PX * this.fill;
  }

  /** Runs `draw` in logical units: the drawing code sees the scaled-down size and zoom. */
  private inLogicalUnits<T>(draw: () => T): T {
    const k = this.fill;
    if (k === 1) return draw();
    const saved = { w: this.cssWidth, h: this.cssHeight, ppb: this.pixelsPerBeat };
    this.cssWidth = saved.w / k;
    this.cssHeight = saved.h / k;
    this.pixelsPerBeat = saved.ppb / Math.sqrt(k);
    try {
      return draw();
    } finally {
      this.cssWidth = saved.w;
      this.cssHeight = saved.h;
      this.pixelsPerBeat = saved.ppb;
    }
  }

  /** Lights the notes when they sound with swing (or straight again: null). */
  setSwing(soundAt: ((beat: number) => number) | null) {
    this.soundAt = soundAt ?? ((beat) => beat);
  }

  setZoom(factor: number) {
    const base = this.cssWidth > 0 && this.cssWidth < mobileBreakpointPx() ? BASE_PIXELS_PER_BEAT_NARROW : BASE_PIXELS_PER_BEAT;
    if (factor === this.zoom && base * factor === this.pixelsPerBeat) return;
    this.zoom = factor;
    this.pixelsPerBeat = base * factor;
    this.version++;
  }

  /** Fully key-signature-aware: also shifts the drawn key signature, not just note spellings. */
  setTranspose(semitones: number) {
    if (semitones === this.transpose) return;
    this.transpose = semitones;
    this.updateGutter();
    this.laid.clear(); // spellings, so places, stems and accidentals
    this.version++;
  }

  /** Section letters (rehearsal marks) printed as boxed letters in the ruler. */
  setSections(sections: { label: string; beat: number }[]) {
    // (Compared by value: the caller may hand in the same array, edited in place.)
    const seen = sections.map((s) => `${s.label}@${s.beat}`).join('|');
    this.sections = sections;
    if (seen !== this.sectionsSeen) this.version++;
    this.sectionsSeen = seen;
  }

  /** Bar numbers the scan wasn't sure of, marked with a "?" in the ruler. */
  setMarkedBars(bars: Set<number>) {
    const seen = [...bars].sort((a, b) => a - b).join('|');
    this.markedBars = bars;
    if (seen !== this.markedBarsSeen) this.version++;
    this.markedBarsSeen = seen;
  }

  /**
   * The pinned margin is sized for the widest key signature anywhere in the piece (after
   * transposing), so the playhead doesn't shift sideways when scrolling past a key change.
   */
  private updateGutter() {
    const maxAccidentals = Math.max(0, ...this.score.measures.map((m) => Math.min(7, Math.abs(this.transposedFifths(m.fifths)))));
    this.gutterPx = Math.round(12 + CLEF_W + 8 + maxAccidentals * KEY_ACCIDENTAL_ADVANCE + 14);
  }

  /** This note's spelling as actually drawn -- the printed spelling, respelled for the current transpose. */
  private effectiveSpelling(note: NoteEvent): { step: string; alter: number; octave: number } {
    const spelling = spellingFor(note);
    return this.transpose && !note.unpitched ? transposeSpelling(spelling, note.midi, this.transpose) : spelling;
  }

  private transposedFifths(rawFifths: number): number {
    return rawFifths + (this.transpose ? (TRANSPOSE_TABLE[this.transpose]?.fifthsShift ?? 0) : 0);
  }

  /**
   * Mirrors PianoRoll.setPartMix: muted (or only-this-voice-away) parts leave the stack entirely,
   * while ducked (non-soloed during a regular Solo) parts draw at DIMMED_ALPHA without lyrics.
   */
  setPartMix(mix: Map<string, PartMixState>) {
    const hidden = new Set<string>();
    const dimmed = new Set<string>();
    const anySolo = Array.from(mix.values()).some((s) => s === 'solo');
    for (const [partId, state] of mix) {
      if (state === 'muted') hidden.add(partId);
      else if (anySolo && state !== 'solo') dimmed.add(partId);
    }
    const same = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((p) => b.has(p));
    if (same(hidden, this.hiddenParts) && same(dimmed, this.dimmedParts)) return;
    this.hiddenParts = hidden;
    this.dimmedParts = dimmed;
    this.version++;
    this.updateFill();
    this.scrollByPixels(0);
  }

  /** On-screen pixels per beat (the fill factor included), for converting drags into beats. */
  getPixelsPerBeat() {
    return this.pixelsPerBeat * Math.sqrt(this.fill);
  }

  /** Visible staves with their current stacking positions (muted voices close up). */
  private visibleLayouts(): PartLayout[] {
    let y = FIRST_STAFF_TOP_PX;
    const out: PartLayout[] = [];
    for (const layout of this.layouts) {
      if (this.hiddenParts.has(layout.partId)) continue;
      layout.topY = y;
      out.push(layout);
      y += staffSpan(layout) + this.extraGap;
    }
    return out;
  }

  private contentHeightPx(): number {
    const shown = this.layouts.filter((l) => !this.hiddenParts.has(l.partId));
    return FIRST_STAFF_TOP_PX + shown.reduce((sum, l) => sum + staffSpan(l) + this.extraGap, 0);
  }

  /** Vertical pan, css px -- only does anything once the stacked staves overflow the viewport. */
  scrollByPixels(deltaPx: number) {
    const maxScroll = Math.max(0, this.contentHeightPx() - (this.cssHeight / this.fill - STAFF_RULER_HEIGHT_PX));
    this.scrollY = clamp(this.scrollY + deltaPx / this.fill, 0, maxScroll);
  }

  private playheadX(): number {
    const ratio = this.cssWidth < mobileBreakpointPx() ? MOBILE_PLAYHEAD_X_RATIO : PLAYHEAD_X_RATIO;
    return this.gutterPx + (this.cssWidth - this.gutterPx) * ratio;
  }

  /**
   * The measure that governs the given beat -- the last measure whose startBeat doesn't exceed
   * it, falling back to the first measure for a beat before the piece even starts. Decides which
   * key signature the pinned margin shows for whatever is currently scrolled into view.
   */
  private measureAtOrBefore(beat: number): MeasureInfo | undefined {
    let current: MeasureInfo | undefined;
    for (const m of this.score.measures) {
      if (m.startBeat > beat) break;
      current = m;
    }
    return current ?? this.score.measures[0];
  }

  /**
   * A line's x on a whole device pixel (a barline, a ruler tick) -- of the drawing's x, whose 0 is
   * on a whole device pixel wherever the music is drawn (the canvas, a slice, see paintSlice): so a
   * line falls on the same device pixel in every one of them.
   */
  private snapX(x: number): number {
    const k = this.dpr * this.fill;
    return Math.round(x * k) / k;
  }

  private beatToX(beat: number, displayBeat: number): number {
    return this.playheadX() + (beat - displayBeat) * this.pixelsPerBeat;
  }

  /** Inverse of beatToX -- canvas-local x to beat, for the ruler's click-to-seek. */
  xToBeat(x: number, displayBeat: number): number {
    return this.inLogicalUnits(() => displayBeat + (x / this.fill - this.playheadX()) / this.pixelsPerBeat);
  }

  render(displayBeat: number, playheadBeat: number) {
    this.theme = readTheme();
    if (this.shadeRevision !== this.theme.revision) {
      this.shadeRevision = this.theme.revision;
      this.pastShade = this.theme.color('score-past').rgba(Number(this.theme.roles['score-past-alpha']));
    }
    const ctx = this.ctx2d;
    if (this.fill === 1) {
      this.renderLogical(displayBeat, playheadBeat);
      return;
    }
    ctx.save();
    ctx.scale(this.fill, this.fill);
    try {
      this.inLogicalUnits(() => this.renderLogical(displayBeat, playheadBeat));
    } finally {
      ctx.restore();
    }
  }

  /** Counters for profiling (development): slices painted, of them in the frame that showed them, ... */
  debugInfo() {
    const px = (c: HTMLCanvasElement | null) => (c ? c.width * c.height : 0);
    const mb = (4 * (px(this.ringMusic) + px(this.ringRuler) + px(this.paperCache) + px(this.marginCache))) / 1e6;
    return { ...this.stats, slots: this.ring.slots, ringW: this.ringMusic?.width ?? 0, ringH: this.ringMusic?.height ?? 0, paperW: this.paperCache?.width ?? 0, paperH: this.paperCache?.height ?? 0, marginW: this.marginCache?.width ?? 0, marginH: this.marginCache?.height ?? 0, mb: Math.round(mb * 10) / 10 };
  }

  private renderLogical(displayBeat: number, playheadBeat: number) {
    const ctx = this.ctx2d;
    const width = this.cssWidth;
    const height = this.cssHeight;
    if (width <= 0 || height <= 0) return;
    const G = this.gutterPx;
    const k = this.dpr * this.fill; // device px per drawing unit

    const startBeat = displayBeat - (this.playheadX() - G) / this.pixelsPerBeat;
    const layouts = this.visibleLayouts();
    const playheadPx = Math.round(this.beatToX(playheadBeat, displayBeat));
    this.ensureLaid(layouts);
    // The pre-painted music lies on a grid of whole device pixels (see paintSlice), so it is shown
    // at whole device pixels: as if at `gridBeat`, within half a device pixel of displayBeat.
    const ring = this.ensureRing(width, height);
    const shift = Math.round((this.playheadX() - displayBeat * this.pixelsPerBeat) * k);
    const gridBeat = ring ? (this.playheadX() - shift / k) / this.pixelsPerBeat : displayBeat;

    if ((this.theme.material.surface === 'paper')) {
      // The music is printed on the paper: it lies under the notes anchored to beat 0 and the top
      // of the staves, moving and stretching with them; around the reading line the lamp behind it
      // shows its inside.
      const frame = { x: this.beatToX(0, gridBeat), y: STAFF_RULER_HEIGHT_PX - this.scrollY, sx: this.pixelsPerBeat / BASE_PIXELS_PER_BEAT, sy: 1 };
      // (The margin and the ruler are painted over the rest.)
      this.paintPaperArea(ctx, G, width, height, frame);
      if (playheadPx > G - 60 && playheadPx < width + 160) backlight(ctx, playheadPx, STAFF_RULER_HEIGHT_PX, height - STAFF_RULER_HEIGHT_PX, frame, PAPER_BACKLIGHT);
    } else {
      ctx.fillStyle = stageFill(ctx, height);
      ctx.fillRect(0, 0, width, height);
      if (this.paperCache) {
        // No paper here: its cache's memory back (a zero-sized canvas holds none).
        this.paperCache.width = this.paperCache.height = 0;
        this.paperCache = null;
        this.paperStamp = '';
      }
    }

    if (ring) this.showMusic(ctx, layouts, shift, gridBeat, playheadBeat, width, height);
    else {
      ctx.save();
      ctx.beginPath();
      ctx.rect(G, STAFF_RULER_HEIGHT_PX, width - G, height - STAFF_RULER_HEIGHT_PX);
      ctx.clip();
      ctx.translate(0, STAFF_RULER_HEIGHT_PX - this.scrollY);
      this.paintRange(ctx, layouts, G, width, displayBeat, playheadBeat);
      ctx.restore();
    }

    // Played music steps back, as in the piano roll.
    if (playheadPx > G) {
      const end = Math.min(width, playheadPx);
      if ((this.theme.material.surface === 'paper')) {
        // A soft edge, as on the punched roll, so the lamp's strip isn't cut in half. The shade is
        // even up to the fade (the gradient pads there): a flat fill, and the gradient over just
        // the last PAST_FADE_PX -- split on a whole device pixel, so the two fills meet cleanly.
        const fadeAt = playheadPx - PAST_FADE_PX;
        const flatTo = Math.min(end, Math.max(G, Math.round(fadeAt * k) / k));
        ctx.fillStyle = this.pastShade;
        if (flatTo > G) ctx.fillRect(G, STAFF_RULER_HEIGHT_PX, flatTo - G, height - STAFF_RULER_HEIGHT_PX);
        if (end > flatTo) {
          ctx.save();
          ctx.translate(fadeAt, 0);
          ctx.fillStyle = this.pastFadeOf(ctx);
          ctx.fillRect(flatTo - fadeAt, STAFF_RULER_HEIGHT_PX, end - flatTo, height - STAFF_RULER_HEIGHT_PX);
          ctx.restore();
        }
      } else {
        ctx.fillStyle = this.pastShade;
        ctx.fillRect(G, STAFF_RULER_HEIGHT_PX, end - G, height - STAFF_RULER_HEIGHT_PX);
      }
    }

    this.showMargin(ctx, layouts, startBeat, height);
    if (ring) {
      this.drawRulerGround(ctx);
      this.showRing(ctx, this.ringRuler!, shift, 0, 0, Math.round(STAFF_RULER_HEIGHT_PX * k), width, null);
    } else {
      const endBeat = displayBeat + (width - this.playheadX()) / this.pixelsPerBeat;
      this.drawFrom = G;
      this.drawTo = width;
      this.drawRuler(ctx, displayBeat, startBeat, endBeat);
    }

    // Playhead, positioned from playheadBeat (the actual sounding position), not displayBeat.
    if (playheadPx >= G - 16 && playheadPx <= width + 16) {
      if ((this.theme.material.surface === 'paper')) {
        // As on the punched roll: the lamp behind the paper shows as a faint strip along the line.
        readingStrip(ctx, playheadPx, 0, height);
        ctx.fillStyle = paper(0.72);
        ctx.fillRect(playheadPx - 0.5, 0, 1, height);
      } else {
        playheadBeam(ctx, playheadPx, 0, height);
        ctx.fillStyle = PAPER;
        ctx.fillRect(playheadPx - 1, 0, 2, height);
      }
      ctx.fillStyle = PAPER;
      ctx.beginPath();
      ctx.moveTo(playheadPx - 6, 0);
      ctx.lineTo(playheadPx + 6, 0);
      ctx.lineTo(playheadPx, 8);
      ctx.closePath();
      ctx.fill();
    }
  }

  /**
   * The music over [from, to) of the drawing's x, as at displayBeat, in the content's coordinates
   * (y from the top of the staves): barlines, staves, marks -- in that order, as always. With
   * playheadBeat -Infinity nothing is lit (the music at rest, as pre-painted).
   */
  private paintRange(ctx: CanvasRenderingContext2D, layouts: PartLayout[], from: number, to: number, displayBeat: number, playheadBeat: number) {
    this.drawFrom = from - RANGE_SLACK_PX;
    this.drawTo = to + RANGE_SLACK_PX;
    const startBeat = displayBeat + (this.drawFrom - this.playheadX()) / this.pixelsPerBeat;
    // (A syllable is centred on its note: one starting this far right can still reach in.)
    const endBeat = displayBeat + (this.drawTo + LYRIC_REACH_PX - this.playheadX()) / this.pixelsPerBeat;
    this.drawBarlines(ctx, layouts, displayBeat, startBeat, endBeat);
    for (const layout of layouts) this.drawStaff(ctx, layout, displayBeat, playheadBeat, startBeat, endBeat);
    this.drawMarks(ctx, layouts, displayBeat);
  }

  /** The whole piece's music and marks laid out for what the view shows now (see layStaff, layMarks). */
  private ensureLaid(layouts: PartLayout[]) {
    const stamp = `${this.version}|${this.theme.revision}|${fontEpoch}|${this.pixelsPerBeat}`;
    if (stamp === this.laidStamp) return;
    const t0 = performance.now();
    this.laidStamp = stamp;
    for (const layout of layouts) this.laidStaff(layout);
    this.laidMarks = this.layMarks(layouts);
    this.stats.laidMs += performance.now() - t0;
  }

  private laidStaff(layout: PartLayout): LaidStaff {
    let laid = this.laid.get(layout.key);
    if (!laid) this.laid.set(layout.key, (laid = this.layStaff(layout)));
    return laid;
  }

  /**
   * The ring of pre-painted slices, sized for the view (or null: too wide for one, drawn directly).
   * Emptied when what it shows changes, or when the view scrolls out of the rows it holds.
   */
  private ensureRing(width: number, height: number): SliceRing | null {
    const k = this.dpr * this.fill;
    const sd = this.ring.width;
    const slots = Math.ceil(((width - this.gutterPx) * k) / sd) + 1 + SLICES_AHEAD + SLICES_BEHIND;
    if (slots * sd > MAX_RING_DEVICE_PX || typeof document === 'undefined') return null;
    // Rows: the view's, and a quarter of it above and below (scrolling a little stays in them).
    const view = height - STAFF_RULER_HEIGHT_PX;
    const reach = this.contentHeightPx() > view ? Math.round(view / 4) : 0;
    const rows = view + 2 * reach;
    const stamp = `${this.laidStamp}|${k}|${slots}|${rows}|${width}|${this.gutterPx}`;
    if (stamp !== this.ringStamp || !this.ringMusic || !this.ringRuler) {
      this.ringStamp = stamp;
      this.ringMusic ??= document.createElement('canvas');
      this.ringRuler ??= document.createElement('canvas');
      // Only a real change of size is set: setting it (even to the same) allocates the canvas anew.
      const size = (c: HTMLCanvasElement, w: number, h: number) => {
        if (c.width !== w) c.width = w;
        if (c.height !== h) c.height = h;
      };
      size(this.ringMusic, slots * sd, Math.ceil(rows * k) + 2);
      size(this.ringRuler, slots * sd, Math.ceil(STAFF_RULER_HEIGHT_PX * k));
      this.ringHeight = rows;
      this.ring.reset(slots);
      this.ringTop = Number.NaN;
    }
    if (!(this.scrollY >= this.ringTop - 1e-6 && this.scrollY + view <= this.ringTop + this.ringHeight + 1e-6)) {
      this.ringTop = Math.max(0, this.scrollY - reach);
      this.ring.clear();
    }
    return this.ring;
  }

  /**
   * Paints slice i of the music (and of the ruler's bar numbers) into its slot, as the music rests:
   * slice i holds the strip's device columns [i, i + 1) x SLICE_DEVICE_PX, where the strip's column
   * of a beat is beat x pixelsPerBeat in device px -- the same grid for every slice, so they meet
   * seamlessly, and the view shows them at whole device pixels.
   */
  private paintSlice(layouts: PartLayout[], i: number) {
    const k = this.dpr * this.fill;
    const sd = this.ring.width;
    const left = this.ring.slotOf(i) * sd;
    const w = sd / k;
    // A displayBeat that puts this slice's left edge at x = 0.
    const at = (this.playheadX() + i * w) / this.pixelsPerBeat;
    const music = this.ringMusic!.getContext('2d');
    if (music) {
      music.save();
      music.setTransform(1, 0, 0, 1, 0, 0);
      music.clearRect(left, 0, sd, this.ringMusic!.height);
      music.beginPath();
      music.rect(left, 0, sd, this.ringMusic!.height);
      music.clip();
      music.setTransform(k, 0, 0, k, left, -this.ringTop * k);
      this.paintRange(music, layouts, 0, w, at, -Infinity);
      music.restore();
    }
    const ruler = this.ringRuler!.getContext('2d');
    if (ruler) {
      ruler.save();
      ruler.setTransform(1, 0, 0, 1, 0, 0);
      ruler.clearRect(left, 0, sd, this.ringRuler!.height);
      ruler.beginPath();
      ruler.rect(left, 0, sd, this.ringRuler!.height);
      ruler.clip();
      ruler.setTransform(k, 0, 0, k, left, 0);
      this.drawFrom = -RANGE_SLACK_PX;
      this.drawTo = w + RANGE_SLACK_PX;
      this.drawRulerLabels(ruler, at, at + (this.drawFrom - this.playheadX()) / this.pixelsPerBeat, at + (this.drawTo - this.playheadX()) / this.pixelsPerBeat);
      ruler.restore();
    }
    this.ring.hold(i);
    this.stats.slices++;
  }

  /**
   * The pre-painted music on screen (at device offset `shift` from the strip), its slices painted
   * first where missing -- and where notes sound now, that stretch drawn directly over the paper
   * instead (lit, with everything else there, in the original order). Then, if this frame had no
   * slice to paint, the next one ahead.
   */
  private showMusic(ctx: CanvasRenderingContext2D, layouts: PartLayout[], shift: number, gridBeat: number, playheadBeat: number, width: number, height: number) {
    const k = this.dpr * this.fill;
    const left = Math.round(this.gutterPx * k);
    const right = Math.round(width * k);
    const [first, last] = this.ring.span(left - shift, right - shift);
    let painted = 0;
    for (let i = first; i <= last; i++) {
      if (this.ring.holds(i)) continue;
      this.paintSlice(layouts, i);
      painted++;
    }
    this.stats.sync += painted;
    const lit = this.litStretch(layouts, gridBeat, playheadBeat);
    const gapFrom = lit ? clamp(Math.floor(lit[0] * k), left, right) : right;
    const gapTo = lit ? clamp(Math.ceil(lit[1] * k), left, right) : right;
    const top = Math.round(STAFF_RULER_HEIGHT_PX * k);
    // The ring's row for content y is (y - ringTop) x k; on screen it is at (ruler + y - scrollY) x k.
    const dy = Math.round((STAFF_RULER_HEIGHT_PX - this.scrollY + this.ringTop) * k);
    this.showRing(ctx, this.ringMusic!, shift, top - dy, top, Math.round(height * k), width, gapFrom < gapTo ? [gapFrom, gapTo] : null);
    this.stats.litPx = Math.max(0, gapTo - gapFrom);
    if (gapFrom < gapTo) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(gapFrom / k, top / k, (gapTo - gapFrom) / k, height - top / k);
      ctx.clip();
      ctx.translate(0, dy / k - this.ringTop);
      this.paintRange(ctx, layouts, gapFrom / k, gapTo / k, gridBeat, playheadBeat);
      ctx.restore();
    }
    if (painted) return;
    for (let d = 1; d <= SLICES_AHEAD + SLICES_BEHIND; d++) {
      const i = d <= SLICES_AHEAD ? last + d : first - (d - SLICES_AHEAD);
      if (this.ring.holds(i)) continue;
      this.paintSlice(layouts, i);
      this.stats.ahead++;
      return;
    }
  }

  /**
   * Copies a ring's slices to the screen's device columns [gutter, width) (all of them already
   * painted), rows [top, bottom) from the ring's row srcTop on -- leaving out the device columns
   * `gap`. 1:1 at whole device pixels.
   */
  private showRing(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, shift: number, srcTop: number, top: number, bottom: number, width: number, gap: [number, number] | null) {
    const k = this.dpr * this.fill;
    const sd = this.ring.width;
    const left = Math.round(this.gutterPx * k);
    const right = Math.round(width * k);
    const rows = Math.min(bottom - top, canvas.height - srcTop);
    if (rows <= 0 || srcTop < 0) return;
    const [first, last] = this.ring.span(left - shift, right - shift);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    for (let i = first; i <= last; i++) {
      const from = Math.max(left, i * sd + shift);
      const to = Math.min(right, (i + 1) * sd + shift);
      const src = this.ring.slotOf(i) * sd - i * sd - shift; // + screen column = the ring's column
      for (const [a, b] of gap ? around(from, to, gap[0], gap[1]) : [[from, to]]) {
        if (b > a) ctx.drawImage(canvas, src + a, srcTop, b - a, rows, a, top, b - a, rows);
      }
    }
    ctx.restore();
  }

  /**
   * Where the music sounding at playheadBeat lies in the drawing's x (as at displayBeat), its glow
   * included: everything there is drawn lit, the rest is the pre-painted music. Null: none sounds.
   */
  private litStretch(layouts: PartLayout[], displayBeat: number, playheadBeat: number): [number, number] | null {
    let lo = Infinity;
    let hi = -Infinity;
    const xOf = (beat: number) => this.beatToX(beat, displayBeat) + NOTE_X_OFFSET_PX;
    const sounds = (from: number, to: number) => this.soundAt(from) <= playheadBeat && playheadBeat < this.soundAt(to);
    for (const layout of layouts) {
      if (this.dimmedParts.has(layout.partId)) continue; // a ducked voice is never lit
      const laid = this.laidStaff(layout);
      const notes = laid.notes;
      // (With swing a note sounds a little off its written beat: a beat either way is ample.)
      for (let i = firstIndexAtOrAfter(notes, playheadBeat - laid.maxDur - 1); i < notes.length && notes[i].startBeat <= playheadBeat + 1; i++) {
        const { note, segments } = notes[i];
        if (!sounds(note.startBeat, note.startBeat + note.durationBeats)) continue;
        if (note.lyric && (this.lyricLineOf.get(note) ?? 0) >= 0) {
          const x = xOf(note.startBeat);
          lo = Math.min(lo, x - lyricReach(note.lyric));
          hi = Math.max(hi, x + lyricReach(note.lyric));
        }
        for (const seg of segments) {
          if (!sounds(seg.startBeat, seg.startBeat + seg.durationBeats)) continue;
          const x = xOf(seg.startBeat);
          lo = Math.min(lo, x - LIT_HEAD_REACH_PX);
          hi = Math.max(hi, x + LIT_HEAD_REACH_PX);
        }
      }
      // A beam lights around each sounding stem: from halfway to the stem before to halfway on.
      const beams = laid.beams;
      for (let i = firstIndexAtOrAfter(beams, playheadBeat - laid.maxBeamSpan - 1); i < beams.length && beams[i].startBeat <= playheadBeat + 1; i++) {
        const group = beams[i].group;
        for (let s = 0; s < group.length; s++) {
          if (!sounds(group[s].beat, group[s].beat + group[s].dur)) continue;
          lo = Math.min(lo, xOf(group[Math.max(0, s - 1)].beat) - LIT_HEAD_REACH_PX);
          hi = Math.max(hi, xOf(group[Math.min(group.length - 1, s + 1)].beat) + LIT_HEAD_REACH_PX);
        }
      }
    }
    if (lo > hi) return null;
    // A shadow's blur reaches about 1.2x its value (1.5x: with room to spare), in device px -- the
    // transform doesn't scale it.
    const glow = (1.5 * Number(this.theme.roles['score-staff-glow-blur'])) / (this.dpr * this.fill) + 1;
    return [lo - glow, hi + glow];
  }

  /**
   * The paper under the music (as paintPaper paints it), from a cache: painted once, a repeat of the
   * texture wider and taller than the music's area, shown at the offset within one repeat where
   * `frame` puts it -- to the nearest device pixel.
   */
  private paintPaperArea(ctx: CanvasRenderingContext2D, G: number, width: number, height: number, frame: { x: number; y: number; sx: number; sy: number }) {
    const k = this.dpr * this.fill;
    const repeatX = paperRepeatPx(frame.sx);
    const repeatY = paperRepeatPx(frame.sy);
    const w = width - G + repeatX + 2;
    const h = height - STAFF_RULER_HEIGHT_PX + repeatY + 2;
    if (w * h * k * k > MAX_CACHE_DEVICE_PIXELS || typeof document === 'undefined') {
      paintPaper(ctx, G, STAFF_RULER_HEIGHT_PX, width - G, height - STAFF_RULER_HEIGHT_PX, frame, 'surface', NIGHT_PAPER);
      return;
    }
    const stamp = `${this.theme.revision}|${paperEpoch}|${paperKind()}|${NIGHT_PAPER}|${k}|${frame.sx}|${frame.sy}|${w}|${h}`;
    if (stamp !== this.paperStamp || !this.paperCache) {
      this.paperStamp = stamp;
      const c = (this.paperCache = freshCanvas(this.paperCache));
      c.width = Math.ceil(w * k);
      c.height = Math.ceil(h * k);
      const pctx = c.getContext('2d');
      if (!pctx) return;
      pctx.setTransform(k, 0, 0, k, 0, 0);
      paintPaper(pctx, 0, 0, w, h, { x: 0, y: 0, sx: frame.sx, sy: frame.sy }, 'surface', NIGHT_PAPER);
    }
    // The cache's x shows the texture where the screen's x + frame.x (within a repeat) does.
    const u = Math.round(mod(G - frame.x, repeatX) * k);
    const v = Math.round(mod(STAFF_RULER_HEIGHT_PX - frame.y, repeatY) * k);
    const x0 = Math.round(G * k);
    const y0 = Math.round(STAFF_RULER_HEIGHT_PX * k);
    const cw = Math.round(width * k) - x0;
    const ch = Math.round(height * k) - y0;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.paperCache, u, v, cw, ch, x0, y0, cw, ch);
    ctx.restore();
  }

  private partLabel(partId: string): string {
    const part = this.score.parts.find((p) => p.id === partId);
    return part ? voiceLabel(part) : '';
  }

  /** The played shade's fade (paper): over [0, PAST_FADE_PX], drawn translated to where it ends. */
  private pastFadeOf(ctx: CanvasRenderingContext2D): CanvasGradient {
    const stamp = `${this.theme.revision}|${this.pastShade}`;
    if (!this.pastFade || stamp !== this.pastFadeStamp) {
      this.pastFadeStamp = stamp;
      const fade = ctx.createLinearGradient(0, 0, PAST_FADE_PX, 0);
      fade.addColorStop(0, this.pastShade);
      fade.addColorStop(1, this.theme.color('score-past').rgba(0));
      this.pastFade = fade;
    }
    return this.pastFade;
  }

  /**
   * The pinned margin (drawMargin), from a cache painted again only when it changes: the key at the
   * left edge, a vertical scroll, the mix, the theme, the size.
   */
  private showMargin(ctx: CanvasRenderingContext2D, layouts: PartLayout[], startBeat: number, height: number) {
    const k = this.dpr * this.fill;
    const measure = this.measureAtOrBefore(startBeat);
    const fifths = measure ? this.transposedFifths(measure.fifths) : 0;
    if (typeof document === 'undefined') {
      this.drawMargin(ctx, layouts, startBeat, height);
      return;
    }
    // (A voice renamed changes its part's name in place: its label is part of what the cache shows.)
    let names = '';
    for (const layout of layouts) if (layout.staff === 1) names += `|${this.partLabel(layout.partId)}`;
    const stamp = `${this.version}|${this.theme.revision}|${fontEpoch}|${paperEpoch}|${paperKind()}|${NIGHT_PAPER}|${fifths}|${this.scrollY}|${k}|${height}|${this.cssWidth}${names}`;
    if (stamp !== this.marginStamp || !this.marginCache) {
      this.marginStamp = stamp;
      const c = (this.marginCache = freshCanvas(this.marginCache));
      const mctx = c.getContext('2d');
      if (!mctx) return;
      // Its paper and the fade into the music, and the voices' names, which can reach further.
      mctx.font = `600 12px ${this.theme.fonts['canvas-text']}`;
      let reach = this.gutterPx + 28;
      for (const layout of layouts) {
        if (layout.staff === 1) reach = Math.max(reach, 25 + mctx.measureText(this.partLabel(layout.partId)).width + 4);
      }
      c.width = Math.min(Math.ceil(Math.min(reach, this.cssWidth) * k), Math.max(1, Math.round(this.cssWidth * k)));
      c.height = Math.max(1, Math.ceil(height * k));
      mctx.setTransform(k, 0, 0, k, 0, 0);
      this.drawMargin(mctx, layouts, startBeat, height);
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.marginCache, 0, 0);
    ctx.restore();
  }

  /** The pinned left margin: voice name above each staff, then clef and key signature on it. */
  private drawMargin(ctx: CanvasRenderingContext2D, layouts: PartLayout[], startBeat: number, height: number) {
    const G = this.gutterPx;
    const ground = this.theme.color(this.theme.material.surface === 'paper' ? 'page-background' : 'canvas-surface');
    // The pinned margin is a strip of its own: its paper stays put.
    if ((this.theme.material.surface === 'paper')) paintPaper(ctx, 0, STAFF_RULER_HEIGHT_PX, G, height - STAFF_RULER_HEIGHT_PX, STILL, 'surface', NIGHT_PAPER);
    else {
      ctx.fillStyle = ground.css;
      ctx.fillRect(0, STAFF_RULER_HEIGHT_PX, G, height - STAFF_RULER_HEIGHT_PX);
    }
    // Music scrolling into the margin fades out instead of stopping at a hard edge.
    const fade = ctx.createLinearGradient(G, 0, G + 28, 0);
    fade.addColorStop(0, ground.rgba(1));
    fade.addColorStop(1, ground.rgba(0));
    ctx.fillStyle = fade;
    ctx.fillRect(G, STAFF_RULER_HEIGHT_PX, 28, height - STAFF_RULER_HEIGHT_PX);

    const measure = this.measureAtOrBefore(startBeat);
    const fifths = measure ? this.transposedFifths(measure.fifths) : 0;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, STAFF_RULER_HEIGHT_PX, this.cssWidth, height - STAFF_RULER_HEIGHT_PX);
    ctx.clip();
    ctx.translate(0, STAFF_RULER_HEIGHT_PX - this.scrollY);
    for (const layout of layouts) {
      const bottomLineY = layout.topY + STAFF_HEIGHT_PX;
      const dimmed = this.dimmedParts.has(layout.partId);
      ctx.globalAlpha = dimmed ? 0.5 : 1;
      ctx.fillStyle = paper(0.22);
      for (let i = 0; i < 5; i++) ctx.fillRect(0, Math.round(layout.topY + i * SP), G + 28, 1);
      ctx.fillStyle = paper(0.8);
      ctx.font = `${SP * 4}px ${this.theme.fonts.music}`;
      ctx.textBaseline = 'alphabetic';
      const clefX = 12;
      if (layout.percussion) ctx.fillText(GLYPH.percussionClef, clefX + 6, bottomLineY - 4 * HALF_SPACE_PX);
      else if (layout.clef === 'bass') ctx.fillText(GLYPH.fClef, clefX, bottomLineY - 6 * HALF_SPACE_PX);
      else ctx.fillText(layout.octaveShift === 1 ? GLYPH.gClef8vb : GLYPH.gClef, clefX, bottomLineY - 2 * HALF_SPACE_PX);
      if (!layout.percussion) this.drawKeySignature(ctx, fifths, layout.clef, bottomLineY, clefX + CLEF_W + 8);

      // A part on several staves: its staves joined at the left edge in its colour, named once.
      if (layout.ofStaves > 1 && layout.staff < layout.ofStaves) {
        const next = layouts.find((l) => l.partId === layout.partId && l.staff === layout.staff + 1);
        if (next) {
          ctx.fillStyle = this.partColor(layout.partId);
          ctx.fillRect(3, layout.topY, 2, next.topY + STAFF_HEIGHT_PX - layout.topY);
        }
      }
      if (layout.staff > 1) continue;
      const part = this.score.parts.find((p) => p.id === layout.partId);
      const name = part ? voiceLabel(part) : '';
      // Above the treble clef's top curl (the G clef reaches ~10px above the top line).
      const labelY = layout.topY - 21;
      ctx.fillStyle = this.partColor(layout.partId);
      ctx.beginPath();
      ctx.arc(16, labelY, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = `600 12px ${this.theme.fonts['canvas-text']}`;
      ctx.fillStyle = paper(dimmed ? 0.5 : 0.9);
      ctx.textBaseline = 'middle';
      ctx.fillText(name, 25, labelY + 0.5);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /** Draws the key signature's sharps/flats after the clef. */
  private drawKeySignature(ctx: CanvasRenderingContext2D, fifths: number, clef: ClefType, bottomLineY: number, xStart: number) {
    if (!fifths) return;
    const positions = fifths > 0 ? SHARP_POSITIONS[clef] : FLAT_POSITIONS[clef];
    const count = Math.min(Math.abs(fifths), positions.length);
    const glyph = accidentalGlyph(fifths > 0 ? 1 : -1);
    for (let i = 0; i < count; i++) {
      ctx.fillText(glyph, xStart + i * KEY_ACCIDENTAL_ADVANCE, bottomLineY - positions[i] * HALF_SPACE_PX);
    }
  }

  private drawRuler(ctx: CanvasRenderingContext2D, displayBeat: number, startBeat: number, endBeat: number) {
    const G = this.gutterPx;
    this.drawRulerGround(ctx);
    ctx.save();
    ctx.beginPath();
    ctx.rect(G, 0, this.cssWidth - G, STAFF_RULER_HEIGHT_PX);
    ctx.clip();
    this.drawRulerLabels(ctx, displayBeat, startBeat, endBeat);
    ctx.restore();
  }

  private drawRulerGround(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = INK1;
    ctx.fillRect(0, 0, this.cssWidth, STAFF_RULER_HEIGHT_PX);
    ctx.fillStyle = paper(0.12);
    ctx.fillRect(0, STAFF_RULER_HEIGHT_PX - 1, this.cssWidth, 1);
  }

  /** The bar numbers, section letters, query marks and signature changes along the ruler. */
  private drawRulerLabels(ctx: CanvasRenderingContext2D, displayBeat: number, startBeat: number, endBeat: number) {
    ctx.textBaseline = 'alphabetic';
    for (const measure of this.score.measures) {
      if (measure.startBeat < startBeat - 8 || measure.startBeat > endBeat) continue;
      const x = this.snapX(this.beatToX(measure.startBeat, displayBeat));
      ctx.fillStyle = paper(0.4);
      ctx.fillRect(x, STAFF_RULER_HEIGHT_PX - 10, 1, 9);
      let textX = x + 6;
      const section = this.sections.find((s) => Math.abs(s.beat - measure.startBeat) < 1e-6);
      if (section) {
        ctx.font = `${MARK_WEIGHT} 12px ${this.theme.fonts.mark}`;
        const boxW = Math.max(17, ctx.measureText(section.label).width + 8);
        ctx.strokeStyle = PAPER;
        ctx.lineWidth = 1.3;
        ctx.strokeRect(x + 5.5, 5.5, boxW, 17);
        ctx.fillStyle = PAPER;
        ctx.textAlign = 'center';
        ctx.fillText(section.label, x + 5.5 + boxW / 2, 18.5);
        ctx.textAlign = 'start';
        textX = x + boxW + 11;
      }
      ctx.font = `600 11px ${this.theme.fonts['canvas-mono']}`;
      ctx.fillStyle = paper(0.62);
      ctx.fillText(String(measure.number), textX, 18);
      let after = textX + ctx.measureText(String(measure.number)).width;
      if (this.markedBars.has(measure.number)) after += 3 + drawQueryMark(ctx, after + 3, 18);
      const change = this.signatureAt.get(measure.startBeat);
      if (change) {
        const fifths = change.fifths !== undefined ? this.transposedFifths(change.fifths) : undefined;
        drawRulerSignature(ctx, change, fifths, after + 7, paper(0.85));
      }
    }
  }

  private drawBarlines(ctx: CanvasRenderingContext2D, layouts: PartLayout[], displayBeat: number, startBeat: number, endBeat: number) {
    if (!layouts.length) return;
    const top = layouts[0].topY;
    const bottom = layouts[layouts.length - 1].topY + STAFF_HEIGHT_PX;
    // Barlines run through the gaps between staves too, joining the voices into one system, as in
    // a printed choral score -- but only across the staff area, not above/below it.
    ctx.fillStyle = paper(0.28);
    for (const measure of this.score.measures) {
      if (measure.startBeat < startBeat - 4 || measure.startBeat > endBeat) continue;
      const x = this.snapX(this.beatToX(measure.startBeat, displayBeat));
      ctx.fillRect(x, top, 1, bottom - top);
      // A change of key is marked with a double bar line, as printed.
      if (this.signatureAt.get(measure.startBeat)?.keyChange) ctx.fillRect(x - 3, top, 1, bottom - top);
    }
    // Final barline: a classical thin + thick double bar, culled in pixel space.
    const endX = this.snapX(this.beatToX(this.score.totalBeats, displayBeat));
    if (endX >= this.drawFrom - this.gutterPx - 4 && endX <= this.drawTo + this.pixelsPerBeat) {
      ctx.fillStyle = paper(0.55);
      ctx.fillRect(endX, top, 1, bottom - top);
      ctx.fillRect(endX + 4, top, 3.5, bottom - top);
    }
  }

  private drawStaff(ctx: CanvasRenderingContext2D, layout: PartLayout, displayBeat: number, playheadBeat: number, startBeat: number, endBeat: number) {
    const color = this.partColor(layout.partId);
    const dimmed = this.dimmedParts.has(layout.partId);
    // octaveShift (see resolveClef) is folded into the bottom-line reference itself, in whole
    // octaves (7 diatonic steps).
    const bottomLineIndex = CLEF_BOTTOM_LINE[layout.clef] - layout.octaveShift * 7;
    const bottomLineY = layout.topY + STAFF_HEIGHT_PX;

    // Staff lines: neutral paper, the same for every voice -- the voice's colour lives in its notes.
    ctx.fillStyle = paper(dimmed ? 0.12 : 0.22);
    for (let i = 0; i < 5; i++) ctx.fillRect(this.drawFrom, Math.round(layout.topY + i * SP), this.drawTo - this.drawFrom, 1);
    ctx.globalAlpha = dimmed ? DIMMED_ALPHA : 1;

    // The notes laid out once (layStaff); those near the stretch drawn are found by binary search
    // (startBeat-sorted), the loop breaking once past it -- O(notes near it), not O(whole piece).
    const laid = this.laidStaff(layout);
    const notes = laid.notes;
    for (let i = firstIndexAtOrAfter(notes, startBeat - 2 - laid.maxDur); i < notes.length; i++) {
      const { note, accidental, segments, chords } = notes[i];
      if (note.startBeat > endBeat) break;
      if (note.startBeat + note.durationBeats < startBeat - 2) continue;
      this.drawNote(ctx, note, bottomLineIndex, bottomLineY, displayBeat, playheadBeat, color, dimmed, accidental, segments, chords);
    }
    const near: LaidStaff['beams'] = [];
    for (let i = firstIndexAtOrAfter(laid.beams, startBeat - 2 - laid.maxBeamSpan); i < laid.beams.length && laid.beams[i].startBeat <= endBeat; i++) near.push(laid.beams[i]);
    // (In the order they are engraved in: overlapping groups of two voices lie as they always did.)
    const groups = near.sort((a, b) => a.order - b.order).map((b) => b.group);
    this.drawBeams(ctx, groups, laid.beamUp, bottomLineY, displayBeat, playheadBeat, color, dimmed);

    const rests = this.restsByStaff.get(layout.key) ?? [];
    const restsStartIdx = firstIndexAtOrAfter(rests, startBeat - 2);
    // A rest gap starting well before the cursor can still extend into view (a whole-measure rest
    // whose start is far left of startBeat) -- back up to the previous gap too.
    const restsSearchIdx = restsStartIdx > 0 ? restsStartIdx - 1 : 0;
    ctx.globalAlpha = dimmed ? DIMMED_ALPHA * 0.8 : 0.8;
    for (let i = restsSearchIdx; i < rests.length; i++) {
      const gap = rests[i];
      if (gap.startBeat > endBeat) break;
      if (gap.startBeat + gap.durationBeats < startBeat - 2) continue;
      this.drawRestGap(ctx, gap, bottomLineY, displayBeat, color);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * One staff's music engraved for the whole piece, once (again only after a transpose): each
   * note's accidental, its heads (a tied note's split at its ties or bar lines), its chord places
   * (stem direction, a second's displaced head) and the beam groups. Laid out over the whole piece,
   * a tie or beam reaching past the edge of the view is laid out as it is engraved.
   */
  private layStaff(layout: PartLayout): LaidStaff {
    // Accidental bookkeeping: which pitches this measure already has an accidental established
    // for, per standard notation convention.
    // The bar a note is in: by its printed number, among the bars at its place -- a repeated bar is
    // played (and drawn) again under the same number, its accidentals starting afresh.
    const measures = this.score.measures;
    let at = 0;
    let currentMeasure: MeasureInfo | undefined;
    let currentMeasureNumber = -1;
    let impliedAlter: Record<string, number> = {};
    const accidentalMap = new Map<string, number>();
    const notes = this.notesByStaff.get(layout.key) ?? [];
    // The noteheads struck together in this part -- a note's own head, or a tied note's head carried
    // on past a bar line -- are grouped by when they sound and by voice. A voice's heads together are
    // a chord: one stem for all of them, in the direction the note furthest from the middle line asks
    // for. Two voices at once on one staff: the upper one's stems go up, the lower one's down, as
    // engraved -- rather than two stems over each other. Stems joined by a beam in the file are drawn
    // with it (drawBeams), all pointing one way.
    const placeOf = (n: NoteEvent) => {
      const sp = this.effectiveSpelling(n);
      return diatonicIndex(sp.step, sp.octave) - (CLEF_BOTTOM_LINE[layout.clef] - layout.octaveShift * 7);
    };
    const chords = new Map<NoteEvent, (ChordPlace | undefined)[]>();
    const segmentsOf = new Map<NoteEvent, { startBeat: number; durationBeats: number }[]>();
    const heads = new Map<number, { n: NoteEvent; k: number; dur: number; pos: number }[]>();
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      const segs = n.tieSegments ? segmentsFromTieLengths(n.startBeat, n.tieSegments) : splitIntoNotatedSegments(n.startBeat, n.durationBeats, this.score.measures);
      segmentsOf.set(n, segs);
      const pos = placeOf(n);
      segs.forEach((seg, k) => {
        const at = Math.round(seg.startBeat * 1e4);
        if (!heads.has(at)) heads.set(at, []);
        heads.get(at)!.push({ n, k, dur: seg.durationBeats, pos });
      });
    }
    // Each moment's heads by length: heads of one length are a chord on one stem -- even when the
    // file writes them in two voices -- and heads of two lengths are two voices.
    const stems: BeamStem[] = [];
    for (const [at, struck] of heads) {
      const byLength = new Map<number, typeof struck>();
      for (const h of struck) {
        const len = Math.round(h.dur * 1e4);
        if (!byLength.has(len)) byLength.set(len, []);
        byLength.get(len)!.push(h);
      }
      // Two voices: the file's first voice on top (stems up) where it says which is which, else the
      // higher one.
      const voiceNo = (g: typeof struck) => Math.min(...g.map((h) => Number(h.n.voice)));
      const groups = [...byLength.values()];
      const numbered = groups.every((g) => Number.isFinite(voiceNo(g))) && new Set(groups.map(voiceNo)).size === groups.length;
      const voices = groups.sort(numbered ? (a, b) => voiceNo(a) - voiceNo(b) : (a, b) => Math.max(...b.map((h) => h.pos)) - Math.max(...a.map((h) => h.pos)));
      const twoVoices = voices.length > 1;
      voices.forEach((group, v) => {
        const placed = [...group].sort((a, b) => a.pos - b.pos);
        // Its beam marks, and the voice they chain in: the file's lowest-numbered voice that has some.
        const marked = group.filter((h) => h.n.beams?.[h.k]?.[0]).sort((a, b) => (a.n.voice ?? '').localeCompare(b.n.voice ?? '', undefined, { numeric: true }));
        const first = marked[0];
        stems.push({
          at,
          beat: at / 1e4,
          voice: first?.n.voice ?? group[0].n.voice ?? `len ${Math.round(group[0].dur * 1e4)}`,
          dur: group[0].dur,
          heads: placed,
          marks: first?.n.beams?.[first.k],
          forcedUp: twoVoices ? v === 0 : null,
        });
      });
    }
    // Beams as engraved: the stems of one voice joined from a beam's 'begin' to its 'end'.
    stems.sort((a, b) => a.at - b.at);
    const beamGroups: BeamStem[][] = [];
    const openBeams = new Map<string, BeamStem[]>();
    for (const st of stems) {
      const mark = st.marks?.[0];
      if (!mark || mark.includes('hook')) continue;
      if (mark === 'begin') openBeams.set(st.voice, [st]);
      else {
        const group = openBeams.get(st.voice) ?? [];
        group.push(st);
        if (mark === 'end') {
          if (group.length > 1) beamGroups.push(group);
          openBeams.delete(st.voice);
        } else openBeams.set(st.voice, group);
      }
    }
    for (const group of openBeams.values()) if (group.length > 1) beamGroups.push(group);
    const beamed = new Set<BeamStem>(beamGroups.flat());
    // A beamed group's stems all point one way: the voice's way where two share the staff, else the
    // way the note furthest from the middle line asks for.
    const beamUp = new Map<BeamStem, boolean>();
    for (const group of beamGroups) {
      const forced = group.find((st) => st.forcedUp !== null)?.forcedUp;
      const all = group.flatMap((st) => st.heads.map((h) => h.pos));
      const up = forced ?? Math.max(...all) - 4 < 4 - Math.min(...all);
      for (const st of group) beamUp.set(st, up);
    }
    for (const st of stems) {
      const inBeam = beamed.has(st);
      if (st.heads.length < 2 && st.forcedUp === null && !inBeam) continue;
      const placed = st.heads;
      const low = placed[0].pos;
      const high = placed[placed.length - 1].pos;
      const stemUp = beamUp.get(st) ?? st.forcedUp ?? high - 4 < 4 - low;
      const owner = stemUp ? placed[0] : placed[placed.length - 1];
      const far = stemUp ? high : low;
      // Walked from the stem's end of the chord: a second's two heads can't share a column, so
      // the one further along moves to the other side of the stem, as engravers do.
      const walk = stemUp ? placed : [...placed].reverse();
      let lastDisplaced = false;
      walk.forEach((h, k) => {
        const before = walk[k - 1];
        const displaced = !!before && Math.abs(before.pos - h.pos) === 1 && !lastDisplaced;
        lastDisplaced = displaced;
        if (!chords.has(h.n)) chords.set(h.n, []);
        // A beamed stem is drawn with its beam (drawBeams), not by the note.
        chords.get(h.n)![h.k] = { stemUp, stemTo: !inBeam && h === owner ? far : null, dx: displaced ? (stemUp ? 1 : -1) * (HEAD_W - STEM_THICKNESS) : 0 };
      });
    }
    const laidNotes: LaidNote[] = [];
    let maxDur = 0;
    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      while (at + 1 < measures.length && measures[at + 1].startBeat <= note.startBeat + 1e-6) at++;
      // (A grace note just before its bar's first beat already belongs to that bar.)
      const own = measures[at]?.number === note.measureNumber || measures[at + 1]?.number !== note.measureNumber ? measures[at] : measures[at + 1];
      if (own !== currentMeasure || note.measureNumber !== currentMeasureNumber) {
        currentMeasure = own;
        currentMeasureNumber = note.measureNumber;
        accidentalMap.clear();
        impliedAlter = impliedAlterForFifths(this.transposedFifths(own?.fifths ?? 0));
      }
      const spelling = this.effectiveSpelling(note);
      const key = `${spelling.step}${spelling.octave}`;
      const trackedAlter = accidentalMap.has(key) ? accidentalMap.get(key)! : (impliedAlter[spelling.step] ?? 0);
      // A percussion note's place is no pitch: never an accidental.
      const showAccidental = !note.unpitched && spelling.alter !== trackedAlter;
      if (!note.unpitched) accidentalMap.set(key, spelling.alter);

      laidNotes.push({ startBeat: note.startBeat, note, accidental: showAccidental, segments: segmentsOf.get(note)!, chords: chords.get(note) });
      maxDur = Math.max(maxDur, note.durationBeats);
    }
    const beams = beamGroups.map((group, order) => ({ startBeat: group[0].beat, order, group })).sort((a, b) => a.startBeat - b.startBeat);
    const maxBeamSpan = beamGroups.reduce((m, g) => Math.max(m, g[g.length - 1].beat + g[g.length - 1].dur - g[0].beat), 0);
    return { notes: laidNotes, maxDur, beams, maxBeamSpan, beamUp };
  }

  /**
   * Dynamics, hairpins and words in gold ink above each staff, as printed in a choral score (so
   * here a dynamic every voice shares stands on every staff); tempo marks above the top staff.
   */
  private drawMarks(ctx: CanvasRenderingContext2D, layouts: PartLayout[], displayBeat: number) {
    if (!layouts.length) return;
    const shift = this.beatToX(0, displayBeat); // laid out with beat 0 at x = 0
    for (const lm of this.laidMarks) {
      const x = lm.x + shift;
      // (Script letters can swing out a little past their measured width.)
      if (x + lm.w + 20 < this.drawFrom || x - 20 > this.drawTo) continue;
      const alpha = lm.tempo ? undefined : this.dimmedParts.has(lm.layout.partId) ? 0.35 : 1;
      drawInkMark(ctx, lm.mark, { x, y: lm.layout.topY - lm.rise, x2: lm.x2 === undefined ? undefined : lm.x2 + shift, alpha, scale: lm.scale });
    }
  }

  /**
   * Where drawMarks writes each mark, for the whole piece (at beat 0 = x 0): marks at the same spot
   * are written one after the other, so each is measured once here (drawInkMark's measure).
   */
  private layMarks(layouts: PartLayout[]): LaidMark[] {
    const out: LaidMark[] = [];
    if (!this.marks || !layouts.length) return out;
    const ctx = this.ctx2d;
    const atZero = this.playheadX() / this.pixelsPerBeat; // a displayBeat that puts beat 0 at x = 0
    let rowEnd = -Infinity;
    for (const m of this.marks.lane) {
      if (m.kind !== 'tempo') continue;
      const x = this.beatToX(m.beat, atZero) + NOTE_X_OFFSET_PX - 4;
      if (x < rowEnd + 12) continue;
      const w = drawInkMark(ctx, m, { x, y: 0, scale: 1.05 }, true);
      rowEnd = x + w;
      out.push({ mark: m, layout: layouts[0], x, x2: undefined, w, rise: 26, scale: 1.05, tempo: true });
    }
    // Shared dynamics and hairpins stand on every staff; shared words once, over the top one.
    const shared = this.marks.lane.filter((m) => m.kind === 'dynamic' || m.kind === 'wedge');
    const sharedWords = this.marks.lane.filter((m) => m.kind === 'words');
    for (const layout of layouts) {
      // A part on several staves: each staff its own marks, the shared ones over its top staff.
      const ofPart = (this.marks.byPart.get(layout.partId) ?? []).filter((m) => (m.staff ?? 1) === layout.staff || layout.ofStaves === 1);
      const own = [...(layout.staff === 1 ? shared : []), ...(layout === layouts[0] ? sharedWords : []), ...ofPart];
      own.sort((a, b) => a.beat - b.beat);
      let lastEnd = -Infinity; // marks at the same spot are written one after the other
      for (const m of own) {
        const x = Math.max(lastEnd + 9, this.beatToX(m.beat, atZero) + (m.kind === 'wedge' ? NOTE_X_OFFSET_PX : NOTE_X_OFFSET_PX - 6));
        const x2 = m.endBeat !== undefined ? Math.max(x + 12, this.beatToX(m.endBeat, atZero) + NOTE_X_OFFSET_PX) : undefined;
        const w = drawInkMark(ctx, m, { x, y: 0, x2, scale: 0.9 }, true);
        lastEnd = x + w;
        out.push({ mark: m, layout, x, x2, w, rise: m.kind === 'wedge' ? 12 : 8, scale: 0.9, tempo: false });
      }
    }
    return out;
  }

  /** Splits one silent gap into notated segments and draws each as a rest glyph. */
  private drawRestGap(ctx: CanvasRenderingContext2D, gap: { startBeat: number; durationBeats: number }, bottomLineY: number, displayBeat: number, color: string) {
    const segments = splitIntoNotatedSegments(gap.startBeat, gap.durationBeats, this.score.measures);
    ctx.font = `${SP * 4}px ${this.theme.fonts.music}`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = color;
    for (const seg of segments) {
      const x = this.beatToX(seg.startBeat, displayBeat) + NOTE_X_OFFSET_PX;
      if (x < this.drawFrom - 20 || x > this.drawTo + 20) continue;
      const shape = classifyDuration(seg.durationBeats);
      // Whole rests hang from the 4th line; every other rest is centred on the middle line.
      const glyph = { whole: GLYPH.restWhole, half: GLYPH.restHalf, quarter: GLYPH.restQuarter, eighth: GLYPH.rest8th, sixteenth: GLYPH.rest16th, thirtysecond: GLYPH.rest32nd }[shape.name];
      const y = bottomLineY - (shape.name === 'whole' ? 6 : 4) * HALF_SPACE_PX;
      const w = ctx.measureText(glyph).width;
      ctx.fillText(glyph, x - w / 2, y);
      if (shape.dotted) ctx.fillText(GLYPH.dot, x + w / 2 + 0.4 * SP, bottomLineY - 5 * HALF_SPACE_PX);
    }
  }

  /** A tie: a slim filled crescent between two noteheads, bulging away from the stems. */
  /**
   * The beams, as engraved in the file: per group a straight beam -- sloped with the melody, at most
   * a staff space across the group, moved out so every stem keeps a readable length -- the stems
   * from their notes to it, and the further beams (sixteenths, thirty-seconds) between the stems that
   * carry them, or as a short stub (a dotted rhythm's hook). A beam lights while any of its notes
   * sounds; each stem with its note.
   */
  private drawBeams(
    ctx: CanvasRenderingContext2D,
    groups: BeamStem[][],
    beamUp: Map<BeamStem, boolean>,
    bottomLineY: number,
    displayBeat: number,
    playheadBeat: number,
    color: string,
    dimmed: boolean,
  ) {
    const yOf = (pos: number) => bottomLineY - pos * HALF_SPACE_PX;
    const lit = (st: BeamStem) => !dimmed && this.soundAt(st.beat) <= playheadBeat && playheadBeat < this.soundAt(st.beat + st.dur);
    const glowing = (on: boolean, draw: () => void) => {
      if (on) {
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = Number(this.theme.roles['score-staff-glow-blur']);
        draw();
        ctx.restore();
      }
      draw();
    };
    ctx.fillStyle = color;
    for (const group of groups) {
      const up = beamUp.get(group[0]) ?? true;
      const xs = group.map((st) => {
        const headX = this.beatToX(st.beat, displayBeat) + NOTE_X_OFFSET_PX - HEAD_W / 2;
        return up ? headX + HEAD_W - STEM_THICKNESS : headX;
      });
      if (xs[xs.length - 1] < this.drawFrom - 40 || xs[0] > this.drawTo + 40) continue;
      // Each stem's beam end: from the head nearest the beam, the usual stem length on.
      const levels = Math.max(...group.map((st) => st.marks?.length ?? 1));
      const reach = STEM_LENGTH + Math.max(0, levels - 1) * BEAM_STEP;
      const near = group.map((st) => yOf(up ? st.heads[st.heads.length - 1].pos : st.heads[0].pos));
      const ends = near.map((y) => (up ? y - reach : y + reach));
      const span = xs[xs.length - 1] - xs[0] || 1;
      const slope = clamp((ends[ends.length - 1] - ends[0]) / span, -SP / span, SP / span) * (Math.abs(ends[ends.length - 1] - ends[0]) < 2 ? 0 : 1);
      // Moved out until no stem is shorter than the shortest a beamed note takes.
      const shortest = MIN_BEAMED_STEM + Math.max(0, levels - 1) * BEAM_STEP;
      let y0 = ends[0];
      for (let i = 0; i < group.length; i++) {
        const y = y0 + slope * (xs[i] - xs[0]);
        if (up && y > near[i] - shortest) y0 -= y - (near[i] - shortest);
        if (!up && y < near[i] + shortest) y0 += near[i] + shortest - y;
      }
      const beamY = (x: number) => y0 + slope * (x - xs[0]);

      // Stems: from the head furthest from the beam to the beam.
      group.forEach((st, i) => {
        const far = yOf(up ? st.heads[0].pos : st.heads[st.heads.length - 1].pos);
        const y1 = beamY(xs[i]);
        glowing(lit(st), () => {
          if (up) ctx.fillRect(xs[i], y1, STEM_THICKNESS, far - STEM_UP_Y.black - y1);
          else ctx.fillRect(xs[i], far + STEM_DOWN_Y.black, STEM_THICKNESS, y1 - far - STEM_DOWN_Y.black);
        });
      });

      // Beams: level 0 across the group; further levels where the stems carry them.
      const bar = (level: number, xa: number, xb: number) => {
        const off = (up ? 1 : -1) * level * BEAM_STEP;
        const ya = beamY(xa) + off;
        const yb = beamY(xb) + off;
        const t = up ? BEAM_THICKNESS : -BEAM_THICKNESS;
        ctx.beginPath();
        ctx.moveTo(xa, ya);
        ctx.lineTo(xb, yb);
        ctx.lineTo(xb, yb + t);
        ctx.lineTo(xa, ya + t);
        ctx.closePath();
        ctx.fill();
      };
      // The bars as engraved, as spans per level...
      const spans: [number, number, number][] = [[0, xs[0], xs[xs.length - 1] + STEM_THICKNESS]];
      for (let level = 1; level < levels; level++) {
        for (let i = 0; i < group.length; i++) {
          const mark = group[i].marks?.[level];
          if (!mark) continue;
          const next = group[i + 1]?.marks?.[level];
          if ((mark === 'begin' || mark === 'continue') && (next === 'continue' || next === 'end')) {
            spans.push([level, xs[i], xs[i + 1] + STEM_THICKNESS]);
          } else if (mark === 'forward hook') {
            const to = Math.min(xs[i] + BEAM_HOOK, i + 1 < group.length ? (xs[i] + xs[i + 1]) / 2 : xs[i] + BEAM_HOOK);
            spans.push([level, xs[i], to + STEM_THICKNESS]);
          } else if (mark === 'backward hook') {
            const from = Math.max(xs[i] - BEAM_HOOK, i > 0 ? (xs[i - 1] + xs[i]) / 2 : xs[i] - BEAM_HOOK);
            spans.push([level, from, xs[i] + STEM_THICKNESS]);
          }
        }
      }
      for (const [level, xa, xb] of spans) bar(level, xa, xb);
      // ...and lit around each sounding note: from halfway back to the note before to halfway on
      // to the next (from its own stem, for the first and the last).
      group.forEach((st, i) => {
        if (!lit(st)) return;
        const from = i > 0 ? (xs[i - 1] + xs[i] + STEM_THICKNESS) / 2 : xs[i];
        const to = i < group.length - 1 ? (xs[i] + xs[i + 1] + STEM_THICKNESS) / 2 : xs[i] + STEM_THICKNESS;
        glowing(true, () => {
          for (const [level, xa, xb] of spans) if (Math.min(xb, to) > Math.max(xa, from)) bar(level, Math.max(xa, from), Math.min(xb, to));
        });
      });
    }
  }

  private drawTie(ctx: CanvasRenderingContext2D, x1: number, x2: number, y: number, stemUp: boolean) {
    const dir = stemUp ? 1 : -1;
    const edgeY = y + dir * 0.55 * SP;
    const outer = edgeY + dir * 0.75 * SP;
    const inner = edgeY + dir * 0.53 * SP;
    const left = x1 + 0.5 * SP;
    const right = x2 - 0.5 * SP;
    if (right - left < 2) return;
    ctx.beginPath();
    ctx.moveTo(left, edgeY);
    ctx.bezierCurveTo(left + (right - left) * 0.25, outer, left + (right - left) * 0.75, outer, right, edgeY);
    ctx.bezierCurveTo(left + (right - left) * 0.75, inner, left + (right - left) * 0.25, inner, left, edgeY);
    ctx.fill();
  }

  private drawNote(
    ctx: CanvasRenderingContext2D,
    note: NoteEvent,
    bottomLineIndex: number,
    bottomLineY: number,
    displayBeat: number,
    playheadBeat: number,
    color: string,
    dimmed: boolean,
    showAccidental: boolean,
    segmentsGiven?: { startBeat: number; durationBeats: number }[],
    chords?: (ChordPlace | undefined)[],
  ) {
    const firstX = this.beatToX(note.startBeat, displayBeat) + NOTE_X_OFFSET_PX;
    const lastX = this.beatToX(note.startBeat + note.durationBeats, displayBeat) + NOTE_X_OFFSET_PX;
    // (Its syllable, centred on it, can reach further than the rest.)
    const reach = note.lyric ? Math.max(20, lyricReach(note.lyric)) : 20;
    if (lastX < this.drawFrom - reach || firstX > this.drawTo + reach) return;

    const spelling = this.effectiveSpelling(note);
    const staffPosition = diatonicIndex(spelling.step, spelling.octave) - bottomLineIndex;
    const y = bottomLineY - staffPosition * HALF_SPACE_PX;
    // Standard convention: stem up when the note is below the middle line, down at or above it; a
    // chord's heads share their stem's direction, and of two voices the upper stems up (drawStaff).
    const ownUp = staffPosition < 4;
    const sounding = !dimmed && this.soundAt(note.startBeat) <= playheadBeat && playheadBeat < this.soundAt(note.startBeat + note.durationBeats);

    ctx.fillStyle = color;
    ctx.font = `${SP * 4}px ${this.theme.fonts.music}`;
    ctx.textBaseline = 'alphabetic';

    // A tie-merged note is split back into individually-notatable segments, each with its own
    // notehead/stem/flag, joined by ties -- preferring the original tie boundaries from the source
    // file (tieSegments) over a mathematical split.
    const segments = segmentsGiven ?? (note.tieSegments ? segmentsFromTieLengths(note.startBeat, note.tieSegments) : splitIntoNotatedSegments(note.startBeat, note.durationBeats, this.score.measures));
    // A head is lit while it sounds -- the whole note with it: head, stem, flag, dot (and the
    // accidental, with the first head).
    const litSeg = (seg: { startBeat: number; durationBeats: number }) => sounding && this.soundAt(seg.startBeat) <= playheadBeat && playheadBeat < this.soundAt(seg.startBeat + seg.durationBeats);
    const glowing = (lit: boolean, draw: () => void) => {
      if (lit) {
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = Number(this.theme.roles['score-staff-glow-blur']);
        draw();
        ctx.restore();
      }
      draw();
    };

    // Accidental: only where the key signature (or an earlier note in the same measure) doesn't
    // already imply it -- standard practice. Not repeated on tied-to noteheads.
    if (showAccidental) {
      const glyph = accidentalGlyph(spelling.alter);
      const w = ctx.measureText(glyph).width;
      glowing(!!segments[0] && litSeg(segments[0]), () => ctx.fillText(glyph, firstX - HEAD_W / 2 - w - 0.25 * SP, y));
    }

    let prevSegX: number | null = null;
    // Ties curve away from the stems -- the first head's direction for the whole note.
    const tieUp = chords?.[0]?.stemUp ?? ownUp;
    for (const [k, seg] of segments.entries()) {
      const chord = chords?.[k];
      const stemUp = chord ? chord.stemUp : ownUp;
      const shift = chord?.dx ?? 0;
      const segX = this.beatToX(seg.startBeat, displayBeat) + NOTE_X_OFFSET_PX;
      const onScreen = segX >= this.drawFrom - 20 && segX <= this.drawTo + 20;
      const shape = classifyDuration(seg.durationBeats);

      if (onScreen) {
        const head =
          note.notehead === 'x'
            ? shape.name === 'whole' ? GLYPH.noteheadXWhole : shape.filled ? GLYPH.noteheadXBlack : GLYPH.noteheadXHalf
            : shape.name === 'whole' ? GLYPH.noteheadWhole : shape.filled ? GLYPH.noteheadBlack : GLYPH.noteheadHalf;
        const headW = shape.name === 'whole' ? WHOLE_HEAD_W : HEAD_W;
        const hx = segX - headW / 2 + shift;
        // Ledger lines (neutral, like the staff) under every head outside the staff -- the heads
        // a tie carries on past a bar line need them just as much as the first.
        const ledgers = ledgerLinePositions(staffPosition);
        if (ledgers.length) {
          ctx.fillStyle = paper(0.55);
          for (const pos of ledgers) ctx.fillRect(hx - LEDGER_EXTENSION, Math.round(bottomLineY - pos * HALF_SPACE_PX), headW + LEDGER_EXTENSION * 2, 1.2);
          ctx.fillStyle = color;
        }
        glowing(litSeg(seg), () => {
          ctx.fillText(head, hx, y);

          if (shape.dotted) {
            // A dot on a line moves up into the space above it.
            ctx.fillText(GLYPH.dot, hx + headW + 0.35 * SP, y - (staffPosition % 2 === 0 ? HALF_SPACE_PX : 0));
          }

          // In a chord only one note draws the stem, from its head past the chord's furthest note.
          if (shape.hasStem && (!chord || chord.stemTo !== null)) {
            const reach = chord && chord.stemTo !== null ? Math.abs(chord.stemTo - staffPosition) * HALF_SPACE_PX : 0;
            const stemLength = STEM_LENGTH + reach + Math.max(0, shape.flags - 1) * 0.75 * SP;
            if (stemUp) {
              const sx = hx - shift + HEAD_W - STEM_THICKNESS;
              const top = y - stemLength;
              ctx.fillRect(sx, top, STEM_THICKNESS, y - STEM_UP_Y[shape.filled ? 'black' : 'half'] - top);
              if (shape.flags) ctx.fillText(FLAG_UP[Math.min(3, shape.flags)], sx, top);
            } else {
              const sx = hx - shift;
              const bottom = y + stemLength;
              const from = STEM_DOWN_Y[shape.filled ? 'black' : 'half'];
              ctx.fillRect(sx, y + from, STEM_THICKNESS, bottom - y - from);
              if (shape.flags) ctx.fillText(FLAG_DOWN[Math.min(3, shape.flags)], sx, bottom);
            }
          }
        });
      }

      if (prevSegX != null) this.drawTie(ctx, prevSegX, segX, y, tieUp);
      prevSegX = segX;
    }

    // Lyric, at a fixed height below the staff so a lyric line reads level; paper (not the voice
    // colour) so it stays legible against every voice colour. Skipped for dimmed (ducked) parts.
    const lyricLine = this.lyricLineOf.get(note) ?? 0;
    if (note.lyric && !dimmed && lyricLine >= 0) {
      ctx.font = `500 12px ${this.theme.fonts['canvas-text']}`;
      ctx.fillStyle = paper(sounding ? 1 : 0.84);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(note.lyric, firstX, bottomLineY + LYRIC_BASELINE_OFFSET_PX + lyricLine * LYRIC_LINE_STEP_PX);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = color;
    }
  }
}
