// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { themeRoleNames } from '../src/design-system/theme/roles.generated';
import { colorRoles, fontRoles } from '../src/design-system/theme';

let dom: JSDOM | undefined;
afterEach(() => { dom?.window.close(); vi.unstubAllGlobals(); vi.resetModules(); });

async function clientTheme() {
  vi.resetModules();
  dom = new JSDOM('<html data-theme="night-paper" data-theme-preference="night-paper"><body></body></html>', { url: 'http://localhost/' });
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage,
    location: dom.window.location, MutationObserver: dom.window.MutationObserver, Event: dom.window.Event })) vi.stubGlobal(key, value);
  const values: Record<string, string> = Object.fromEntries(themeRoleNames.map(role => ['--ds-' + role, '1']));
  for (const role of colorRoles) values['--ds-' + role] = '#123456';
  for (const role of fontRoles) values['--ds-font-' + role] = 'Snapshot Font';
  for (let i = 1; i <= 8; i++) values['--ds-voice-' + i] = `rgb(${i * 20}, 40, 60)`;
  Object.assign(values, { '--ds-print-paper': '#ffffff', '--ds-print-ink': '#000000', '--ds-print-font-text': 'Print Font',
    '--ds-print-font-music': 'Music Font', '--ds-color-scheme': 'dark', '--ds-material-fibre': 'none',
    '--ds-voice-fallback-hue-step': '47', '--ds-voice-fallback-saturation': '70', '--ds-voice-fallback-lightness': '72' });
  const computed = vi.fn(() => ({ getPropertyValue: (key: string) => values[key] ?? '' }));
  vi.stubGlobal('getComputedStyle', computed);
  return { api: await import('../src/design-system/theme'), values, computed };
}

it('does not deliver an older snapshot after a material writer publishes a nested revision', async () => {
  const { api, values } = await clientTheme();
  let published = false;
  api.subscribeTheme(() => {
    if (published) return;
    published = true;
    values['--ds-material-fibre'] = 'generated texture';
    api.notifyThemeMaterialChange();
  });
  const seen: number[] = [];
  api.subscribeTheme(theme => seen.push(theme.revision));
  api.notifyThemeMaterialChange();
  expect(seen).toEqual([api.getThemeRevision()]);
  expect(api.readTheme().material.surface).toBe('paper');
});

it('uses supplied spectrum/fallback inputs for all voice counts and keeps frozen job inputs', async () => {
  const { api, values, computed } = await clientTheme();
  const { colorForPart } = await import('../src/palette');
  const theme = api.readTheme(), print = theme.print;
  const reads = computed.mock.calls.length;
  expect(colorForPart(0, 1, theme)).toBe(theme.spectrum[0].css);
  expect(colorForPart(1, 4, theme)).toBe(theme.spectrum[2].css);
  expect(colorForPart(7, 8, theme)).toBe(theme.spectrum[7].css);
  expect(colorForPart(2, 12, theme)).toBe('hsl(94, 70%, 72%)');
  expect(computed).toHaveBeenCalledTimes(reads);
  values['--ds-color-scheme'] = 'light';
  values['--ds-material-fibre'] = 'paper texture';
  values['--ds-print-ink'] = '#987654';
  api.notifyThemeMaterialChange();
  expect(api.readTheme().material).toEqual({ surface: 'paper', light: 'ink', composite: 'multiply', onLight: true });
  expect(Object.isFrozen(print)).toBe(true);
  expect(print.ink.css).toBe('rgb(0, 0, 0)');
  expect(api.readTheme().print.ink.css).toBe('rgb(152, 118, 84)');
});

it('normalizes minified named CSS pigments on the snapshot cold path and rejects invalid names', async () => {
  const { api, values } = await clientTheme();
  const normalized = '#ffe4c4';
  // The browser canvas is the external boundary: it serializes valid named sRGB colors as hex.
  const probe = { get fillStyle() { return normalized; }, set fillStyle(_value: string) {} };
  const createElement = document.createElement.bind(document);
  const create = vi.spyOn(document, 'createElement').mockImplementation((name: string) =>
    name === 'canvas' ? { getContext: () => probe } as unknown as HTMLCanvasElement : createElement(name));
  vi.stubGlobal('CSS', { supports: (_property: string, color: string) => color === 'bisque' });
  values['--ds-material-light-warm'] = 'bisque';
  try {
    const theme = api.readTheme();
    expect(theme.color('material-light-warm').css).toBe('rgb(255, 228, 196)');
    expect(create).toHaveBeenCalledTimes(1);
    api.readTheme();
    expect(create).toHaveBeenCalledTimes(1);
    values['--ds-material-light-warm'] = 'notacolor';
    expect(() => api.notifyThemeMaterialChange()).not.toThrow();
    expect(() => api.readTheme()).toThrow('Unsupported concrete theme color');
  } finally { create.mockRestore(); }
});

// Historical renderer inputs from immutable 46831e3. Keep these expected values independent
// of the authored palette: a near-color substitution or inherited alpha is a regression.
it('preserves every pre-P2 renderer pigment across all three themes', async () => {
  const { readFileSync } = await import('node:fs');
  const { default: postcss } = await import('postcss');
  const css = postcss.parse(readFileSync('src/design-system/tokens.css', 'utf8'));
  const expected: Record<string, readonly string[]> = {
    'material-paper-ground': ['#1b1621', '#e8d8b6', '#1b1621'],
    'title-name-ink': ['rgb(255,252,244)', 'rgb(46,32,22)', 'rgb(255,252,244)'],
    'title-name-glow': ['rgb(255,190,112)', 'rgb(226,150,52)', 'rgb(255,190,112)'],
    'title-name-flare-core': ['rgb(255,236,200)', 'rgb(255,236,200)', 'rgb(255,236,200)'],
    'title-name-flare-edge': ['rgb(255,200,140)', 'rgb(255,200,140)', 'rgb(255,200,140)'],
    'title-name-nib': ['rgb(255,253,246)', 'rgb(255,253,246)', 'rgb(255,253,246)'],
    'ribbon-flare-core': ['rgb(255,226,186)', 'rgb(255,226,186)', 'rgb(255,226,186)'],
    'ribbon-flare-edge': ['rgb(255,200,150)', 'rgb(255,200,150)', 'rgb(255,200,150)'],
    'ribbon-highlight': ['rgb(255,250,242)', 'rgb(255,236,190)', 'rgb(255,250,242)'],
    'ribbon-nib': ['rgb(255,250,242)', 'rgb(255,228,160)', 'rgb(255,250,242)'],
    'ribbon-spark': ['rgb(255,250,242)', 'rgb(255,250,242)', 'rgb(255,250,242)'],
    'stage-mote-core': ['rgb(255,246,228)', 'rgb(255,246,228)', 'rgb(255,246,228)'],
    'stage-mote-edge': ['rgb(255,222,170)', 'rgb(255,222,170)', 'rgb(255,222,170)'],
    'stage-beam-core': ['rgb(255,236,200)', 'rgb(255,236,200)', 'rgb(255,236,200)'],
    'stage-beam-middle': ['rgb(255,214,150)', 'rgb(255,214,150)', 'rgb(255,214,150)'],
    'stage-beam-outer': ['rgb(250,196,120)', 'rgb(250,196,120)', 'rgb(250,196,120)'],
    'stage-beam-edge': ['rgb(255,200,140)', 'rgb(255,200,140)', 'rgb(255,200,140)'],
    'stage-pool-core': ['rgb(255,214,160)', 'rgb(255,214,160)', 'rgb(255,214,160)'],
    'stage-pool-edge': ['rgb(255,200,140)', 'rgb(255,200,140)', 'rgb(255,200,140)'],
    'stage-haze-core': ['rgb(255,240,214)', 'rgb(255,240,214)', 'rgb(255,240,214)'],
    'stage-haze-edge': ['rgb(255,220,170)', 'rgb(255,220,170)', 'rgb(255,220,170)'],
    'stage-grain-strand': ['rgb(255,232,200)', 'rgb(255,232,200)', 'rgb(255,232,200)'],
    'stage-grain-fleck': ['rgb(255,236,210)', 'rgb(255,236,210)', 'rgb(255,236,210)'],
    'stage-halo-core': ['rgb(255,244,222)', 'rgb(255,244,222)', 'rgb(255,244,222)'],
    'stage-halo-middle': ['rgb(255,226,180)', 'rgb(255,226,180)', 'rgb(255,226,180)'],
    'stage-halo-edge': ['rgb(255,220,170)', 'rgb(255,220,170)', 'rgb(255,220,170)'],
    'stage-staff-light': ['rgb(239,228,210)', 'rgb(239,228,210)', 'rgb(239,228,210)'],
    'stage-dust': ['rgb(255,248,232)', 'rgb(255,248,232)', 'rgb(255,248,232)'],
    'stage-note-highlight': ['rgb(255,250,240)', 'rgb(255,250,240)', 'rgb(255,250,240)'],
    'title-staff-lamp-core': ['rgb(255,214,166)', 'rgb(255,214,166)', 'rgb(255,214,166)'],
    'title-staff-lamp-edge': ['rgb(255,200,150)', 'rgb(255,200,150)', 'rgb(255,200,150)'],
    'title-staff-reading-line': ['rgb(255,240,214)', 'rgb(255,240,214)', 'rgb(255,240,214)'],
    'title-staff-note-highlight': ['rgb(255,250,240)', 'rgb(255,250,240)', 'rgb(255,250,240)'],
    'title-staff-ink': ['rgb(239,231,218)', 'rgb(239,231,218)', 'rgb(239,231,218)'],
    'title-staff-afterglow': ['rgb(255,232,200)', 'rgb(255,232,200)', 'rgb(255,232,200)'],
    'title-staff-nib': ['rgb(255,246,230)', 'rgb(255,246,230)', 'rgb(255,246,230)'],
    'title-staff-flare-core': ['rgb(255,244,224)', 'rgb(255,244,224)', 'rgb(255,244,224)'],
    'title-staff-flare-edge': ['rgb(255,230,190)', 'rgb(255,230,190)', 'rgb(255,230,190)'],
    'artwork-nib': ['rgb(255,250,242)', 'rgb(255,250,242)', 'rgb(255,250,242)'],
    'material-gel-deep': ['rgb(20,12,30)', 'rgb(20,12,30)', 'rgb(20,12,30)'],
    'material-wordmark-rim': ['rgb(255,252,246)', 'rgb(255,252,246)', 'rgb(255,252,246)'],
    'score-lantern-cavity': ['#08060c', '#6b5236', '#08060c'],
    'score-row-shadow': ['rgb(0,0,0)', 'rgb(90,60,25)', 'rgb(0,0,0)'],
    'score-hole-edge': ['rgb(6,4,10)', 'rgb(70,45,20)', 'rgb(6,4,10)'],
    'score-key-separator': ['rgb(13,12,22)', 'rgb(13,12,22)', 'rgb(13,12,22)'],
    'score-key-shadow': ['rgb(0,0,0)', 'rgb(0,0,0)', 'rgb(0,0,0)'],
    'material-lantern-occlusion': ['rgb(6,4,12)', 'rgb(232,216,182)', 'rgb(6,4,12)'],
    'material-lantern-glow': ['rgb(255,208,156)', 'rgb(236,150,52)', 'rgb(255,208,156)'],
    'material-paper-strand-shadow': ['rgb(4,2,8)', 'rgb(96,62,28)', 'rgb(4,2,8)'],
    'material-paper-strand-light': ['rgb(255,244,228)', 'rgb(255,244,228)', 'rgb(255,244,228)'],
    'material-paper-warm-fleck': ['rgb(70,40,20)', 'rgb(70,40,20)', 'rgb(70,40,20)'],
    'artwork-cover-ground': ['#15131f', '#15131f', '#15131f'],
    'brand-mark-tile': ['#17151f', '#17151f', '#17151f'],
    'backdrop-wave-1': ['#110d1b', '#110d1b', '#110d1b'],
    'backdrop-wave-2': ['#141020', '#141020', '#141020'],
    'backdrop-wave-3': ['#181326', '#181326', '#181326'],
    'backdrop-wave-4': ['#1c162d', '#1c162d', '#1c162d'],
    'backdrop-wave-5': ['#211934', '#211934', '#211934'],
    'backdrop-wave-6': ['#261c3a', '#261c3a', '#261c3a'],
    'backdrop-ground-top': ['#0c0a14', '#0c0a14', '#0c0a14'],
    'backdrop-ground-bottom': ['#120e1c', '#120e1c', '#120e1c'],
    'material-paper-swatch-glow': ['rgb(255,208,156)', 'rgb(255,208,156)', 'rgb(255,208,156)'],
    'material-paper-swatch-line': ['rgb(239,231,218)', 'rgb(239,231,218)', 'rgb(239,231,218)'],
  };
  const shared = new Map<string, string>();
  css.walkRules(rule => { if (rule.selector === ':root') rule.walkDecls(d => { shared.set(d.prop, d.value); }); });
  const { normalizeColor } = await import('../src/design-system/theme/color');
  for (const [index, theme] of ['night-paper', 'parchment', 'velvet'].entries()) {
    const values = new Map(shared);
    css.walkRules(rule => { if (rule.selectors.includes(`:root[data-theme="${theme}"]`)) rule.walkDecls(d => { values.set(d.prop, d.value); }); });
    const resolve = (key: string): string => {
      const value = values.get(key);
      if (!value) throw Error(`Missing ${key} in ${theme}`);
      return value.replace(/var\((--[\w-]+)\)/g, (_match, name: string) => resolve(name));
    };
    for (const [role, colors] of Object.entries(expected)) {
      expect(colorRoles, `${role} must be available in a concrete snapshot`).toContain(role);
      expect(themeRoleNames).toContain(role);
      expect(normalizeColor(resolve('--ds-' + role)).css, `${theme}: ${role}`).toBe(normalizeColor(colors[index]).css);
      if (new Set(colors).size === 1) expect(shared.has('--ds-' + role)).toBe(true);
      else expect(shared.has('--ds-' + role)).toBe(false);
    }
  }
});
