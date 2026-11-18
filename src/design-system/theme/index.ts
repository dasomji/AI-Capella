import { bootstrapTheme, themeRegistry, themePreference } from './bootstrap';
import { themeRoleNames } from './roles.generated';
export { themeRegistry, themePreference } from './bootstrap';
import type { ThemeId, ThemePreference } from './bootstrap';
import { normalizeColor } from './color';
import type { Color } from './color';
export type { ThemeId, ThemePreference, Color };

export const colorRoles = [
  'gold-ink-deep', 'gold-ink', 'gold-ink-light',
  'canvas-mask', 'material-gel-gloss-color', 'score-overview-past',
  'material-paper-ground',
  'material-paper-swatch-glow', 'material-paper-swatch-line', 'title-name-ink', 'title-name-glow',
  'title-name-flare-core', 'title-name-flare-edge', 'title-name-nib', 'ribbon-flare-core',
  'ribbon-flare-edge', 'ribbon-highlight', 'ribbon-nib', 'ribbon-spark',
  'stage-mote-core', 'stage-mote-edge', 'stage-beam-core', 'stage-beam-middle',
  'stage-beam-outer', 'stage-beam-edge', 'stage-pool-core', 'stage-pool-edge',
  'stage-haze-core', 'stage-haze-edge', 'stage-grain-strand', 'stage-grain-fleck',
  'stage-halo-core', 'stage-halo-middle', 'stage-halo-edge', 'stage-staff-light',
  'stage-dust', 'stage-note-highlight', 'title-staff-lamp-core', 'title-staff-lamp-edge',
  'title-staff-reading-line', 'title-staff-note-highlight', 'title-staff-ink', 'title-staff-afterglow',
  'title-staff-nib', 'title-staff-flare-core', 'title-staff-flare-edge', 'artwork-nib',
  'material-gel-deep', 'material-wordmark-rim', 'score-lantern-cavity', 'score-row-shadow',
  'score-hole-edge', 'score-key-separator', 'score-key-shadow', 'material-lantern-occlusion',
  'material-lantern-glow', 'material-paper-strand-shadow', 'material-paper-strand-light', 'material-paper-warm-fleck',
  'artwork-cover-ground', 'brand-mark-tile', 'backdrop-wave-1', 'backdrop-wave-2',
  'backdrop-wave-3', 'backdrop-wave-4', 'backdrop-wave-5', 'backdrop-wave-6',
  'backdrop-ground-top', 'backdrop-ground-bottom', 'page-background', 'surface',
  'surface-sunken', 'surface-raised', 'surface-overlay', 'surface-hover',
  'ink', 'ink-secondary', 'ink-muted', 'rule',
  'rule-strong', 'accent', 'focus', 'danger',
  'success', 'warning', 'on-accent', 'on-danger',
  'backdrop', 'transcription-accent', 'transcription-warning', 'accent-offline',
  'accent-invitation', 'feedback-wish', 'feedback-idea', 'feedback-note',
  'feedback-survey', 'browser-chrome', 'score-query', 'score-paper',
  'score-past', 'score-key-light', 'score-key-dark', 'score-key-light-ink',
  'score-key-dark-ink', 'score-lyric', 'score-ruler', 'canvas-surface-sunken',
  'canvas-surface', 'canvas-surface-raised', 'canvas-surface-overlay', 'score-stage-top',
  'score-stage-middle', 'score-stage-bottom', 'material-gold-deep', 'material-gold-mid',
  'material-gold-light', 'material-wordmark-ink', 'material-wordmark-gold-deep', 'material-wordmark-gold-mid',
  'material-wordmark-gold-light', 'material-light-warm', 'material-light-hot', 'material-lamp',
  'material-paper-fibre-light', 'material-paper-fibre-ink', 'material-paper-lamp',
] as const;
export const fontRoles = ['body', 'control', 'mono', 'display', 'heading', 'song-title', 'mark', 'brand', 'script', 'music', 'auth-body', 'auth-display', 'auth-mono', 'canvas-text', 'canvas-mono', 'canvas-display'] as const;
// Strategy identity is authored by each theme, independently of browser color-scheme.
const materialStrategies = {
  light: { strategy: 'light', light: 'additive', composite: 'lighter', onLight: false, paperKind: 'device', lanternComposite: 'source-over', ribbonLineComposite: 'lighter' },
  ink: { strategy: 'ink', light: 'ink', composite: 'multiply', onLight: true, paperKind: 'pergament', lanternComposite: 'multiply', ribbonLineComposite: 'source-over' },
} as const;
type MaterialStrategy = typeof materialStrategies[keyof typeof materialStrategies];
function materialStrategy(value: string): MaterialStrategy {
  if (value !== 'light' && value !== 'ink') throw Error(`Invalid material-strategy: ${value}`);
  return materialStrategies[value];
}
export type ThemeSnapshot = Readonly<{
  revision: number; id: ThemeId; preference: ThemePreference; type: string; titleDraft: 'current' | 'earlier';
  color: (role: typeof colorRoles[number]) => Color;
  colors: Readonly<Record<typeof colorRoles[number], Color>>;
  fonts: Readonly<Record<typeof fontRoles[number], string>>;
  spectrum: readonly Color[];
  fallback: Readonly<{ hueStep: number; saturation: number; lightness: number }>;
  material: Readonly<{ surface: 'paper' | 'waves' } & MaterialStrategy>;
  print: Readonly<{ paper: Color; ink: Color; textFont: string; musicFont: string; notationScale: number }>;
  /** All semantic role values, including material/filter recipes and dimensional scales. */
  roles: Readonly<Record<string, string>>;
}>;
let snapshot: ThemeSnapshot | undefined;
let revision = 0;
let initialized = false;
const listeners = new Set<(theme: ThemeSnapshot) => void>();

// D05: keep all appearance requests at the repertoire boundary, including OS/storage.
let rehearsing = false;
let requestedTheme: ThemePreference | undefined;
const pendingAppearance = new Map<string, () => void>();
/** Last request per appearance category wins; callers may persist the preference immediately. */
export function requestAppearanceChange(category: string, apply: () => void): boolean {
  if (rehearsing) { pendingAppearance.set(category, apply); return true; }
  apply();
  return false;
}
/** Player entry holds appearance even while stopped/paused; only repertoire entry releases it. */
export function setAppearanceRehearsing(next: boolean) {
  rehearsing = next;
  if (next) return;
  const changes = [...pendingAppearance.values()];
  pendingAppearance.clear();
  for (const apply of changes) apply();
}

let observedKey = '';
const attributeKey = () => ['theme', 'type', 'themePreference', 'start', 'title', 'experimental'].map(key => document.documentElement.dataset[key]).join('|');
let dispatching = false;
function deliver(listener: (theme: ThemeSnapshot) => void, theme: ThemeSnapshot) {
  try { listener(theme); }
  catch (error) {
    if (typeof globalThis.reportError === 'function') globalThis.reportError(error);
    else console.error(error);
  }
}
function refresh() {
  observedKey = attributeKey();
  snapshot = undefined;
  revision++;
  // A material writer may invalidate during delivery. Continue with the latest snapshot for
  // remaining listeners, without recursively re-running listeners already visited in this pass.
  if (dispatching || !listeners.size) return;
  dispatching = true;
  try { for (const listener of listeners) deliver(listener, readTheme()); }
  finally { dispatching = false; }
}
function updateChrome() {
  const color = getComputedStyle(document.documentElement).getPropertyValue('--ds-browser-chrome').trim();
  if (color) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
}
/** Menu-time support status for the currently applied appearance. */
export function hasExperimentalAppearance(): boolean {
  return typeof document !== 'undefined' && !!document.documentElement.dataset.experimental;
}
export function systemTheme(): ThemeId {
  const scheme = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  return (themeRegistry.find(theme => theme.system === scheme) ?? themeRegistry[0]).id;
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
    if ((requestedTheme ?? document.documentElement.dataset.themePreference) !== 'system') return;
    applyThemePreference('system');
  });
  window.addEventListener('storage', event => {
    if (event.key !== 'ai-capella-design' && event.key !== 'ai-capella-schrift' && event.key !== 'ai-capella-start' && event.key !== null) return;
    forgetInitialThemeQuery();
    // Cross-tab choices use stored values, not this tab's initial URL override.
    const preference = event.key === 'ai-capella-design' || event.key === null ? themePreference(event.newValue) : requestedTheme ?? themePreference(document.documentElement.dataset.themePreference ?? null);
    if (event.key !== 'ai-capella-design') {
      const url = new URL(window.location.href);
      if (event.key === 'ai-capella-schrift' || event.key === null) url.searchParams.delete('schrift');
      if (event.key === 'ai-capella-start' || event.key === null) url.searchParams.delete('start');
      window.history.replaceState(window.history.state, '', url);
    }
    applyThemePreference(preference);
  });
  observedKey = attributeKey();
  revision++;
  window.addEventListener('design-material-change', refresh);
  new MutationObserver(() => { if (observedKey === attributeKey()) return; updateChrome(); refresh(); }).observe(document.documentElement, {
    attributes: true, attributeFilter: ['data-theme', 'data-type', 'data-theme-preference', 'data-start', 'data-title', 'data-experimental'],
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
  return applyThemePreference(preference);
}
function applyThemePreference(preference: ThemePreference) {
  requestedTheme = preference;
  return requestAppearanceChange('theme', () => {
    requestedTheme = undefined;
    bootstrapTheme(preference); updateChrome(); refresh();
  });
}

// Production CSS minification may shorten authored sRGB hex to a named color (e.g. bisque).
// Resolve those through the browser once on the snapshot's cold path, never during drawing.
// Invalid colors and contextual CSS keywords must still fail instead of becoming canvas black.
let colorProbe: CanvasRenderingContext2D | undefined;
function concreteColor(value: string): Color {
  try { return normalizeColor(value); }
  catch (error) {
    if (!/^[a-z]+$/i.test(value) || /^(?:currentcolor|inherit|initial|unset|revert|revertlayer)$/i.test(value)
      || typeof CSS === 'undefined' || !CSS.supports('color', value)) throw error;
    colorProbe ??= document.createElement('canvas').getContext('2d') ?? undefined;
    if (!colorProbe) throw error;
    colorProbe.fillStyle = value;
    return normalizeColor(colorProbe.fillStyle);
  }
}

/** Immutable, concrete snapshot. One getComputedStyle per revision, never per frame. */
export function readTheme(): ThemeSnapshot {
  if (typeof document === 'undefined') throw Error('readTheme() needs a styled client document; call it in a client effect');
  initializeTheme();
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
  const colors = Object.freeze(Object.fromEntries(colorRoles.map(role => [role, concreteColor(value(role))]))) as ThemeSnapshot['colors'];
  const fonts = Object.freeze(Object.fromEntries(fontRoles.map(role => [role, value('font-' + role)]))) as ThemeSnapshot['fonts'];
  snapshot = Object.freeze({
    revision, id: root.dataset.theme as ThemeId, preference: root.dataset.themePreference as ThemePreference, type: root.dataset.type ?? 'bodoni', titleDraft: root.dataset.start === 'neu' ? 'current' : 'earlier',
    color: (role: typeof colorRoles[number]) => colors[role],
    material: Object.freeze({ surface: value('material-fibre') === 'none' ? 'waves' : 'paper', ...materialStrategy(value('material-strategy')) }),
    colors, fonts, spectrum: Object.freeze(Array.from({ length: 8 }, (_, i) => concreteColor(value(`voice-${i + 1}`)))),
    fallback: Object.freeze({ hueStep: number('voice-fallback-hue-step'), saturation: number('voice-fallback-saturation'), lightness: number('voice-fallback-lightness') }),
    print: Object.freeze({ paper: concreteColor(value('print-paper')), ink: concreteColor(value('print-ink')), textFont: value('print-font-text'), musicFont: value('print-font-music'), notationScale: number('print-notation-scale') }),
    roles: Object.freeze(roles),
  });
  return snapshot;
}
export function subscribeTheme(fn: (theme: ThemeSnapshot) => void, { immediate = false }: { immediate?: boolean } = {}) {
  if (typeof document === 'undefined') return () => {};
  initializeTheme(); listeners.add(fn);
  if (immediate) deliver(fn, readTheme());
  return () => { listeners.delete(fn); };
}

/** Cheap revision key: no snapshot allocation or style read. */
export function getThemeRevision() {
  if (typeof document === 'undefined') return 0;
  initializeTheme();
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
export type Breakpoint = 'phone' | 'phone-wide' | 'account' | 'compact' | 'wordmark' | 'score' | 'panel' | 'transport';
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
