import { getThemeRevision, subscribeTheme } from './design-system/theme';
import { colorForPart } from './palette';
import { canvasFontsLoaded, canvasFontsReady } from './theme';
import type { Score } from './score';

/** The shared live repaint boundary. It never changes audio or rehearsal state. */
export function subscribeRendererTheme(options: {
  score: () => Score | null;
  repaint: () => void;
  resize: () => void;
}) {
  return subscribeTheme(theme => {
    const score = options.score();
    document.querySelectorAll<HTMLElement>('[data-part]').forEach(el => {
      const index = score?.parts.findIndex(part => part.id === el.dataset.part) ?? -1;
      if (index >= 0 && score) el.style.setProperty('--c', colorForPart(index, score.parts.length, theme));
    });
    document.querySelectorAll<HTMLElement>('[data-theme-voice]').forEach(el => {
      el.style.setProperty('--c', colorForPart(Number(el.dataset.themeVoice), Number(el.dataset.themeVoiceCount), theme));
    });
    if (canvasFontsLoaded(theme)) {
      options.repaint();
      return;
    }
    options.repaint();
    void canvasFontsReady(theme).then(() => {
      if (getThemeRevision() !== theme.revision) return;
      options.resize();
      options.repaint();
    });
  });
}
