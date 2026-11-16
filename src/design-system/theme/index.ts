import { bootstrapTheme, themeRegistry, themePreference } from './bootstrap';
import { themeRoleNames } from './roles.generated';
export { themeRegistry, themePreference } from './bootstrap';
import type { ThemeId, ThemePreference } from './bootstrap';
import { normalizeColor } from './color';
import type { Color } from './color';
export type { ThemeId, ThemePreference, Color };

export const colorRoles = ['page-background', 'surface', 'surface-sunken', 'surface-raised', 'surface-overlay', 'surface-hover', 'ink', 'ink-secondary', 'ink-muted', 'rule', 'rule-strong', 'accent', 'focus', 'danger', 'success', 'warning', 'on-accent', 'on-danger', 'backdrop', 'admin-surface', 'admin-ink', 'admin-secondary', 'admin-rule', 'admin-accent', 'admin-danger', 'admin-header-rule', 'admin-system-surface', 'transcription-accent', 'transcription-warning', 'accent-offline', 'accent-invitation', 'feedback-wish', 'feedback-idea', 'feedback-note', 'feedback-survey', 'browser-chrome', 'score-query', 'score-paper', 'score-past', 'score-key-light', 'score-key-dark', 'score-key-light-ink', 'score-key-dark-ink', 'score-lyric', 'score-ruler', 'canvas-surface-sunken', 'canvas-surface', 'canvas-surface-raised', 'canvas-surface-overlay', 'score-stage-top', 'score-stage-middle', 'score-stage-bottom', 'material-gold-deep', 'material-gold-mid', 'material-gold-light', 'material-wordmark-ink', 'material-wordmark-gold-deep', 'material-wordmark-gold-mid', 'material-wordmark-gold-light', 'material-light-warm', 'material-light-hot', 'material-lamp', 'material-paper-fibre-light', 'material-paper-fibre-ink', 'material-paper-lamp'] as const;
export const fontRoles = ['body', 'control', 'mono', 'display', 'heading', 'song-title', 'mark', 'brand', 'script', 'music', 'auth-body', 'auth-display', 'auth-mono', 'canvas-text', 'canvas-mono', 'canvas-display'] as const;
export type ThemeSnapshot = Readonly<{
  revision: number; id: ThemeId; preference: ThemePreference; type: string;
  color: (role: typeof colorRoles[number]) => Color;
  colors: Readonly<Record<typeof colorRoles[number], Color>>;
  fonts: Readonly<Record<typeof fontRoles[number], string>>;
  spectrum: readonly Color[];
  fallback: Readonly<{ hueStep: number; saturation: number; lightness: number }>;
  print: Readonly<{ paper: Color; ink: Color; textFont: string; musicFont: string; notationScale: number }>;
  /** All semantic role values, including material/filter recipes and dimensional scales. */
  roles: Readonly<Record<string, string>>;
}>;
let snapshot: ThemeSnapshot | undefined;
let revision = 0;
let initialized = false;
const quietChanges = new Set<() => void>();
const listeners = new Set<(theme: ThemeSnapshot) => void>();

let observedKey = '';
const attributeKey = () => ['theme', 'type', 'themePreference'].map(key => document.documentElement.dataset[key]).join('|');
function refresh() {
  observedKey = attributeKey();
  snapshot = undefined;
  revision++;
  // Do not perform style reads for unused API subscribers; readTheme is lazy.
  if (listeners.size) { const value = readTheme(); for (const listener of listeners) listener(value); }
}
function updateChrome() {
  const color = getComputedStyle(document.documentElement).getPropertyValue('--ds-browser-chrome').trim();
  if (color) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
}
export function systemTheme(): ThemeId {
  const scheme = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  return (themeRegistry.find(theme => theme.system === scheme) ?? themeRegistry[0]).id;
}
/** Legacy main keeps its quiet-moment/reload policy until renderer caches migrate in P2. */
export function onSystemThemeChange(fn: () => void) {
  quietChanges.add(fn);
  return () => { quietChanges.delete(fn); };
}
// A visit's URL override has already been consumed. A new choice must survive reload
// rather than re-storing the old query (and bouncing choices between open tabs).
function forgetInitialThemeQuery() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('design')) return;
  url.searchParams.delete('design');
  window.history.replaceState(window.history.state, '', url);
}
export function initializeTheme() {
  if (typeof document === 'undefined') return;
  if (initialized) return;
  initialized = true;
  if (!document.documentElement.dataset.theme) bootstrapTheme();
  updateChrome();
  const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: light)') : undefined;
  media?.addEventListener('change', () => {
    if (document.documentElement.dataset.themePreference !== 'system') return;
    if (quietChanges.size) { for (const change of quietChanges) change(); return; }
    bootstrapTheme('system'); updateChrome(); refresh();
  });
  window.addEventListener('storage', event => {
    if (event.key !== 'ai-capella-design' && event.key !== null) return;
    forgetInitialThemeQuery();
    if (quietChanges.size) { for (const change of quietChanges) change(); return; }
    // Cross-tab choices use stored values, not this tab's initial URL override.
    bootstrapTheme(themePreference(event.newValue)); updateChrome(); refresh();
  });
  observedKey = attributeKey();
  revision++;
  window.addEventListener('design-material-change', refresh);
  new MutationObserver(() => { if (observedKey === attributeKey()) return; updateChrome(); refresh(); }).observe(document.documentElement, {
    attributes: true, attributeFilter: ['data-theme', 'data-type', 'data-theme-preference'],
  });
  // Token edits in dev invalidate the snapshot as well as the browser's CSS.
  if (import.meta.hot) import.meta.hot.on('vite:afterUpdate', refresh);
}
export function setThemePreference(preference: ThemePreference) {
  if (preference !== 'system' && !themeRegistry.some(theme => theme.id === preference)) throw Error('Unknown theme preference');
  if (typeof document === 'undefined') return;
  initializeTheme();
  try {
    if (preference === 'system') localStorage.removeItem('ai-capella-design');
    else localStorage.setItem('ai-capella-design', themeRegistry.find(theme => theme.id === preference)!.storage);
  } catch { /* This visit can still choose a theme. */ }
  forgetInitialThemeQuery();
  if (quietChanges.size) { for (const change of quietChanges) change(); return; }
  bootstrapTheme(preference); updateChrome(); refresh();
}

/** Immutable, concrete snapshot. One getComputedStyle per revision, never per frame. */
export function readTheme(): ThemeSnapshot {
  if (typeof document === 'undefined') throw Error('readTheme() needs a styled client document; call it in a client effect');
  initializeTheme();
  if (observedKey !== attributeKey()) refresh();
  if (snapshot) return snapshot;
  const root = document.documentElement, style = getComputedStyle(root);
  const roles: Record<string, string> = {};
  for (const role of themeRoleNames) roles[role] = style.getPropertyValue('--ds-' + role).trim();
  const value = (role: string) => {
    const result = roles[role];
    if (!result) throw Error(`Missing design token --ds-${role}; load design-system/app.css before reading the theme`);
    return result;
  };
  const number = (role: string) => { const n = Number(value(role)); if (!Number.isFinite(n)) throw Error(`Non-numeric design token ${role}`); return n; };
  const colors = Object.freeze(Object.fromEntries(colorRoles.map(role => [role, normalizeColor(value(role))]))) as ThemeSnapshot['colors'];
  const fonts = Object.freeze(Object.fromEntries(fontRoles.map(role => [role, value('font-' + role)]))) as ThemeSnapshot['fonts'];
  snapshot = Object.freeze({
    revision, id: root.dataset.theme as ThemeId, preference: root.dataset.themePreference as ThemePreference, type: root.dataset.type ?? 'bodoni',
    color: (role: typeof colorRoles[number]) => colors[role],
    colors, fonts, spectrum: Object.freeze(Array.from({ length: 8 }, (_, i) => normalizeColor(value(`voice-${i + 1}`)))),
    fallback: Object.freeze({ hueStep: number('voice-fallback-hue-step'), saturation: number('voice-fallback-saturation'), lightness: number('voice-fallback-lightness') }),
    print: Object.freeze({ paper: normalizeColor(value('print-paper')), ink: normalizeColor(value('print-ink')), textFont: value('print-font-text'), musicFont: value('print-font-music'), notationScale: number('print-notation-scale') }),
    roles: Object.freeze(roles),
  });
  return snapshot;
}
export function subscribeTheme(fn: (theme: ThemeSnapshot) => void, { immediate = false }: { immediate?: boolean } = {}) {
  if (typeof document === 'undefined') return () => {};
  initializeTheme(); listeners.add(fn);
  if (immediate) fn(readTheme());
  return () => { listeners.delete(fn); };
}

/** Cheap revision key: no snapshot allocation or style read. */
export function getThemeRevision() {
  if (typeof document === 'undefined') return 0;
  initializeTheme();
  if (observedKey !== attributeKey()) refresh();
  return revision;
}
/** Cache one derived resource per revision; retain one wrapper per resource. */
export function memoizeByTheme<T>(fn: (theme: ThemeSnapshot) => T): () => T {
  let cachedRevision = -1;
  let cached: T;
  return () => {
    const next = getThemeRevision();
    if (cachedRevision !== next) { cached = fn(readTheme()); cachedRevision = next; }
    return cached;
  };
}
/** Runtime material writers notify after setting their distinct live input. */
export function notifyThemeMaterialChange() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('design-material-change'));
}
export type Breakpoint = 'phone' | 'phone-wide' | 'account' | 'compact' | 'wordmark' | 'score' | 'panel';
export function breakpoint(name: Breakpoint): string {
  if (typeof document === 'undefined') throw Error('breakpoint() requires a styled client document');
  const result = getComputedStyle(document.documentElement).getPropertyValue(`--tw-breakpoint-${name}`).trim();
  if (!/^\d+(?:\.\d+)?(?:px|rem)$/.test(result)) throw Error(`Missing breakpoint ${name}`);
  const pixels = parseFloat(result) * (result.endsWith('rem') ? parseFloat(getComputedStyle(document.documentElement).fontSize) : 1);
  if (!Number.isFinite(pixels)) throw Error(`Invalid breakpoint ${name}`);
  return `${pixels}px`;
}
export function matchBreakpoint(name: Breakpoint, bound: 'min' | 'max' | 'below' = 'max') {
  return window.matchMedia(bound === 'below' ? `(width < ${breakpoint(name)})` : `(${bound}-width: ${breakpoint(name)})`);
}
