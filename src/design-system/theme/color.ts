export type Color = Readonly<{ r: number; g: number; b: number; a: number; css: string; rgba: (alpha?: number) => string; withAlpha: (alpha: number) => Color }>;
const clamp = (value: number, max = 255) => Math.min(max, Math.max(0, value));

/** Concrete sRGB for the authored hex/RGB primitives and generated voice HSL.
 * This pure parser also works in tests/SSR; it never consults a live document. */
export function normalizeColor(input: string): Color {
  const value = input.trim().toLowerCase();
  let channels: number[];
  if (/^#[0-9a-f]{3,4}$/.test(value)) {
    channels = [...value.slice(1)].map(c => parseInt(c + c, 16));
    if (channels.length === 4) channels[3] /= 255;
  } else if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(value)) {
    channels = value.slice(1).match(/../g)!.map(c => parseInt(c, 16));
    if (channels.length === 4) channels[3] /= 255;
  } else {
    const match = value.match(/^(rgba?|hsla?)\(([^)]+)\)$/);
    if (!match) throw Error(`Unsupported concrete theme color: ${input}`);
    const parts = match[2].split(/[\s,\/]+/).filter(Boolean);
    if (parts.length < 3 || parts.length > 4) throw Error(`Invalid theme color: ${input}`);
    const alpha = parts[3] ? parseFloat(parts[3]) / (parts[3].endsWith('%') ? 100 : 1) : 1;
    if (match[1].startsWith('hsl')) {
      const h = ((parseFloat(parts[0]) % 360) + 360) % 360 / 60;
      const s = clamp(parseFloat(parts[1]), 100) / 100;
      const l = clamp(parseFloat(parts[2]), 100) / 100;
      const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(h % 2 - 1)), m = l - c / 2;
      const rgb = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
      channels = [...rgb.map(v => (v + m) * 255), alpha];
    } else channels = [...parts.slice(0, 3).map(p => parseFloat(p) * (p.endsWith('%') ? 2.55 : 1)), alpha];
  }
  if (!channels.every(Number.isFinite)) throw Error(`Invalid theme color: ${input}`);
  const [r, g, b] = channels.slice(0, 3).map(v => Math.round(clamp(v)));
  const a = clamp(channels[3] ?? 1, 1);
  return Object.freeze({ r, g, b, a,
    rgba: (alpha = 1) => `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 1) * a})`,
    withAlpha: (alpha: number) => normalizeColor(`rgba(${r}, ${g}, ${b}, ${clamp(alpha, 1) * a})`),
    css: a === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a})` });
}
