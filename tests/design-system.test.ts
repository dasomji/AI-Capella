// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { themeBootstrapScript } from '../src/design-system/theme/bootstrap';
import { normalizeColor } from '../src/design-system/theme/color';
import { withAlpha, towardPaper, towardInk } from '../src/theme';

function boot(query = '', stored: string | null = null, light = false, denied = false) {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: `http://localhost/${query}`, runScripts: 'outside-only' });
  if (stored) dom.window.localStorage.setItem('ai-capella-design', stored);
  Object.defineProperty(dom.window, 'matchMedia', { value: () => ({ matches: light }) });
  if (denied) Object.defineProperty(dom.window, 'localStorage', { get() { throw Error('storage denied'); } });
  dom.window.eval(themeBootstrapScript);
  return dom;
}

describe('one early appearance resolver', () => {
  it.each([
    ['', null, false, 'night-paper'], ['', null, true, 'parchment'],
    ['', 'papier', true, 'night-paper'], ['', 'pergament', false, 'parchment'],
    ['?design=samt', null, true, 'velvet'], ['?design=parchment', 'papier', false, 'parchment'],
    ['?design=auto', 'pergament', false, 'night-paper'],
  ] as const)('resolves %s / %s / light %s to %s', (query, stored, light, expected) => {
    const dom = boot(query, stored, light);
    expect(dom.window.document.documentElement.dataset.theme).toBe(expected);
    expect(dom.window.document.documentElement.dataset.ground).toBe(expected === 'parchment' ? 'pergament' : undefined);
    dom.window.close();
  });
  it('supports URL choices and safe defaults when storage is unavailable', () => {
    const forced = boot('?design=papier', null, true, true);
    expect(forced.window.document.documentElement.dataset.theme).toBe('night-paper');
    forced.window.close();
    const system = boot('', null, true, true);
    expect(system.window.document.documentElement.dataset.theme).toBe('parchment');
    system.window.close();
  });
  it('resolves the retained type and title presets before hydration', () => {
    const dom = boot('?schrift=bodoni&start=zeile');
    expect(dom.window.document.documentElement.dataset.type).toBeUndefined();
    expect(dom.window.document.documentElement.dataset.title).toBe('zeile');
    dom.window.close();
    const revival = boot();
    expect(revival.window.document.documentElement.dataset.type).toBe('revival');
    revival.window.close();
  });
  it('has no document access at module import on the server', async () => {
    const api = await import('../src/design-system/theme');
    expect(() => api.readTheme()).toThrow('styled client document');
    expect(() => api.initializeTheme()).not.toThrow();
  });
});

describe('concrete theme colors and >8 voice helpers', () => {
  it('normalizes hex forms, alpha, RGB percentages and generated HSL', () => {
    expect(normalizeColor('#abc').css).toBe('rgb(170, 187, 204)');
    expect(normalizeColor('#f008').a).toBeCloseTo(136 / 255);
    expect(normalizeColor('#11223380').a).toBeCloseTo(128 / 255);
    expect(normalizeColor('rgb(100% 0% 0% / 25%)').css).toBe('rgba(255, 0, 0, 0.25)');
    expect(normalizeColor('hsl(94, 70%, 72%)').css).toBe('rgb(177, 234, 134)');
    expect(Object.isFrozen(normalizeColor('#ffffff'))).toBe(true);
    expect(() => normalizeColor('var(--missing)')).toThrow('Unsupported');
  });
  it.each([1, 4, 8, 9, 12])('applies alpha and mixing to a %i-voice spectrum', count => {
    const color = count > 8 ? 'hsl(94, 70%, 72%)' : '#F4879B';
    expect(withAlpha(color, .3)).toMatch(/^rgba\(.+,0.3\)$/);
    expect(towardPaper(color, 1)).toBe('rgb(239,231,218)');
    expect(towardInk(color, 1)).toBe('rgb(20,12,30)');
  });
});
