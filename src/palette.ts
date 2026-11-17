import { readTheme, type ThemeSnapshot } from './design-system/theme';
/**
 * Colour for voice `index` of `count` voices. Colours are spread across the whole spectrum rather
 * than handed out in list order, so a four-voice SATB song gets rose/honey/sky/orchid (maximally
 * distinct neighbours, bass always the coolest) instead of the first four warm-ish entries.
 */
export function colorForPart(index: number, count: number, theme: ThemeSnapshot = readTheme()): string {
  const spectrum = theme.spectrum;
  const n = Math.max(1, count);
  if (n <= spectrum.length) {
    const slot = n === 1 ? 0 : Math.round((index * (spectrum.length - 1)) / (n - 1));
    return spectrum[slot].css;
  }
  const hue = (index * theme.fallback.hueStep) % 360;
  return `hsl(${hue}, ${theme.fallback.saturation}%, ${theme.fallback.lightness}%)`;
}
