import { normalizeColor } from './design-system/theme/color';
import { readTheme, subscribeTheme, memoizeByTheme, type ThemeSnapshot } from './design-system/theme';
// Compatibility bindings for existing consumers. Values are resolved only on the client and
// updated before consumers repaint; new renderer inputs use the immutable snapshot directly.
export let INK0: string, INK1: string, PAPER: string, QUERY: string;
export let MARK_WEIGHT: number, BRAND_WEIGHT: number;
let stageCache: { ctx: CanvasRenderingContext2D; h: number; width: number; pixels: number; revision: number; fill: CanvasGradient } | null = null;
const gelShades = new Map<string, { top: string; bottom: string }>();
subscribeTheme(theme => {
  INK0 = theme.color('canvas-surface-sunken').css; INK1 = theme.color('canvas-surface').css;
  PAPER = theme.color('score-paper').css;
  QUERY = theme.color('score-query').css;
  MARK_WEIGHT = Number(theme.roles['weight-mark']); BRAND_WEIGHT = Number(theme.roles['weight-brand']);
  gelShades.clear();
}, { immediate: true });

/**
 * The stage the score sits on: velvet, a touch lighter at the top like fabric catching light,
 * instead of flat ink. Cached per height (a gradient object per frame would be wasted work).
 */

export function stageFill(ctx: CanvasRenderingContext2D, height: number, theme = readTheme()): CanvasGradient {
  if (stageCache && stageCache.ctx === ctx && stageCache.h === height && stageCache.width === ctx.canvas.width && stageCache.pixels === ctx.canvas.height && stageCache.revision === theme.revision) return stageCache.fill;
  const fill = ctx.createLinearGradient(0, 0, 0, height);
  for (const [t, role] of [[0, 'score-stage-top'], [Number(theme.roles['score-stage-middle-stop']), 'score-stage-middle'], [1, 'score-stage-bottom']] as const) fill.addColorStop(t, theme.color(role).css);
  stageCache = { ctx, h: height, width: ctx.canvas.width, pixels: ctx.canvas.height, revision: theme.revision, fill };
  return fill;
}

/** The print colour at the given opacity -- hairlines, grid, secondary text (paper on the night ground, ink on parchment). */
export function paper(alpha: number, theme = readTheme()): string {
  return theme.color('score-paper').rgba(alpha);
}

export function withAlpha(color: string, alpha: number): string {
  return normalizeColor(color).rgba(alpha);
}

/** Mix in sRGB, preserving the historical hex path and supporting generated HSL voices. */
export function towardPaper(color: string, k: number, target = readTheme().color('score-paper')): string {
  const { r, g, b } = normalizeColor(color);
  const mix = (c: number, p: number) => Math.round(c + (p - c) * k);
  return `rgb(${mix(r, target.r)},${mix(g, target.g)},${mix(b, target.b)})`;
}
export function towardInk(color: string, k: number, target = readTheme().color('material-gel-deep')): string {
  const { r, g, b } = normalizeColor(color);
  const mix = (c: number, p: number) => Math.round(c + (p - c) * k);
  return `rgb(${mix(r, target.r)},${mix(g, target.g)},${mix(b, target.b)})`;
}

// Gel notes ("Licht"): lit from above, a glossy highlight along the top, a fine rim -- strength as
// agreed for the app (between "subtle" and "balanced" in the design draft).



const gelInputs = memoizeByTheme(theme => ({
  gloss: Number(theme.roles['material-gel-gloss']), paper: theme.color('score-paper'),
  deep: theme.color('material-gel-deep'), shine: theme.color('material-gel-gloss-color'),
}));

/** A note bead as gel. `lit` brightens it (the note sounding at the playhead). */
export function gelPill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, lit = false) {
  const { gloss: GEL_GLOSS, paper: light, deep, shine: glossColor } = gelInputs();
  let shades = gelShades.get(color);
  if (!shades) {
    shades = { top: towardPaper(color, 0.28 * GEL_GLOSS, light), bottom: towardInk(color, 0.26 * GEL_GLOSS, deep) };
    gelShades.set(color, shades);
  }
  const r = Math.min(h / 2, w / 2);
  const body = ctx.createLinearGradient(0, y, 0, y + h);
  body.addColorStop(0, lit ? towardPaper(color, 0.5, light) : shades.top);
  body.addColorStop(0.55, lit ? towardPaper(color, 0.3, light) : color);
  body.addColorStop(1, lit ? color : shades.bottom);
  ctx.fillStyle = body;
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fill();
  if (h < 9) return;
  const inset = Math.min(r * 0.6, 5);
  const shine = ctx.createLinearGradient(0, y + 1.5, 0, y + h * 0.5);
  shine.addColorStop(0, glossColor.rgba(0.5 * GEL_GLOSS));
  shine.addColorStop(1, glossColor.rgba(0));
  ctx.fillStyle = shine;
  roundRectPath(ctx, x + inset, y + 1.5, Math.max(0, w - inset * 2), h * 0.46, r * 0.8);
  ctx.fill();
  ctx.strokeStyle = glossColor.rgba(0.16 * GEL_GLOSS);
  ctx.lineWidth = 1;
  roundRectPath(ctx, x + 0.5, y + 0.5, w - 1, h - 1, Math.max(0, r - 0.5));
  ctx.stroke();
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** The playhead as a warm beam of light: a soft band behind the line. */
export function playheadBeam(ctx: CanvasRenderingContext2D, x: number, top: number, height: number) {
  const beam = ctx.createLinearGradient(x - 36, 0, x + 36, 0);
  beam.addColorStop(0, readTheme().color('material-light-warm').rgba(0));
  beam.addColorStop(0.5, readTheme().color('material-light-warm').rgba(0.12));
  beam.addColorStop(1, readTheme().color('material-light-warm').rgba(0));
  ctx.fillStyle = beam;
  ctx.fillRect(x - 36, top, 72, height);
}

/**
 * Paper design: the lamp behind the paper seen along a reading line at x -- a faint warm strip with
 * a bell-shaped fall-off to the sides (the same light as the punched roll's, see lantern.ts).
 */
export function readingStrip(ctx: CanvasRenderingContext2D, x: number, top: number, height: number) {
  const theme = readTheme();
  const peak = Number(theme.roles['material-reading-strip-alpha']);
  const reach = 90;
  const g = ctx.createLinearGradient(x - reach, 0, x + reach, 0);
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    g.addColorStop(t, theme.color('material-lamp').rgba(Number((peak * Math.exp(-(((t - 0.5) / 0.2) ** 2))).toFixed(4))));
  }
  ctx.fillStyle = g;
  ctx.fillRect(x - reach, top, reach * 2, height);
}

/**
 * Resolves once the bundled faces the canvases draw with are loaded. Canvas text silently falls
 * back to a system font if drawn before its web font arrives -- and the piano roll caches lyric
 * bitmaps, so a fallback-rendered syllable would stick until the next rebuild -- so the first
 * paint of either score view waits on this (with a timeout, so a failed font load never blocks
 * the app).
 */
function canvasFontLoads(theme: ThemeSnapshot): [string, string?][] {
  return [
    [`600 12px ${theme.fonts['canvas-text']}`],
    [`600 11px ${theme.fonts['canvas-mono']}`],
    [`32px ${theme.fonts.music}`, ''],
    ...(theme.type === 'revival' ? [[`${Number(theme.roles['weight-mark'])} 12px ${theme.fonts.mark}`, 'A'] as [string, string]] : []),
  ];
}
export function canvasFontsLoaded(theme = readTheme()): boolean {
  return !('fonts' in document) || canvasFontLoads(theme).every(([font, text]) => document.fonts.check(font, text));
}
export function canvasFontsReady(theme = readTheme()): Promise<void> {
  if (canvasFontsLoaded(theme)) return Promise.resolve();
  const loads = Promise.all(canvasFontLoads(theme).map(([font, text]) => document.fonts.load(font, text))).then(() => undefined);
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<void>((resolve) => { timer = setTimeout(resolve, 2500); });
  return Promise.race([loads, timeout]).catch(() => undefined).finally(() => clearTimeout(timer));
}

/** The "?" by a bar number in a ruler (x: its left edge, y: the number's baseline); returns its width. */
export function drawQueryMark(ctx: CanvasRenderingContext2D, x: number, y: number): number {
  ctx.save();
  ctx.fillStyle = QUERY;
  ctx.beginPath();
  ctx.arc(x + 5.5, y - 4, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = INK0;
  ctx.font = `700 9px ${readTheme().fonts['canvas-text']}`;
  ctx.textAlign = 'center';
  ctx.fillText('?', x + 5.5, y - 0.8);
  ctx.restore();
  return 11;
}
