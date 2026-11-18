import type { PartInfo, Score } from './score';
import { readTheme, type ThemeSnapshot } from './design-system/theme';
import { colorForPart } from './palette';

/** Stored by part ID in piece defaults. Allocate before filtering/removing/reordering voices. */
export function assignVoiceNumbers(parts: PartInfo[], stored: Readonly<Record<string, number>> = {}) {
  const numbers = { ...stored };
  let next = Math.max(0, ...Object.values(numbers)) + 1;
  for (const part of parts) {
    numbers[part.id] ??= next++;
    part.voiceNumber = numbers[part.id];
  }
  return numbers;
}
export function voiceLabel(part: PartInfo) {
  return part.voiceNumber ? `${part.voiceNumber} · ${part.name}` : part.name;
}
export function voiceColor(part: PartInfo, score: Score, theme: ThemeSnapshot = readTheme()) {
  const index = score.parts.indexOf(part);
  return colorForPart(score.parts.length > 8 && score.parts.length <= 16 ? (part.voiceNumber ?? index + 1) - 1 : index, Math.max(score.parts.length, part.voiceNumber ?? 0), theme);
}
/** A neutral tab, independent of voice pigment. Text/geometry come from shared roles. */
export function drawVoiceNumber(ctx: CanvasRenderingContext2D, number: number, x: number, y: number, theme = readTheme()) {
  const size = parseFloat(theme.roles['voice-number-size']);
  const width = size * (String(number).length + 1);
  const height = size * 1.4;
  ctx.save();
  ctx.fillStyle = theme.color('surface').css;
  ctx.strokeStyle = theme.color('ink').css;
  ctx.lineWidth = 1;
  ctx.fillRect(x, y, width, height);
  ctx.strokeRect(x + .5, y + .5, width - 1, height - 1);
  ctx.font = `600 ${size}px ${theme.fonts['canvas-mono']}`;
  ctx.fillStyle = theme.color('ink').css;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(number), x + width / 2, y + height / 2);
  ctx.restore();
  return {x, y, width, height};
}
