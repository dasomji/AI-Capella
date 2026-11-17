// @vitest-environment node
import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import { describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { normalizeColor } from '../src/design-system/theme/color';

function tokens(theme: string) {
  const css = postcss.parse(readFileSync(process.env.FOUNDATION_TOKEN_SOURCE ?? 'src/design-system/tokens.css', 'utf8'));
  const values = new Map<string, string>();
  for (const selector of [':root', `:root[data-theme="${theme}"]`]) css.walkRules(rule => {
    if (rule.selectors.includes(selector)) rule.walkDecls(d => { values.set(d.prop, d.value); });
  });
  const resolve = (key: string): string => {
    const value = values.get(key);
    if (!value) throw Error(`Missing ${key}`);
    return value.replace(/var\((--[\w-]+)\)/g, (_, name: string) => resolve(name));
  };
  return (role: string) => resolve('--ds-' + role);
}
function luminance(value: string) {
  const c = normalizeColor(value);
  const [r,g,b] = [c.r,c.g,c.b].map(x => { x /= 255; return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; });
  return .2126*r + .7152*g + .0722*b;
}
function contrast(a: string,b: string) {
  const [hi,lo] = [luminance(a),luminance(b)].sort((x,y)=>y-x);
  return (hi+.05)/(lo+.05);
}

describe('owner foundation decisions', () => {
  it.each(['night-paper','parchment','velvet'])('%s has one accent, paper and gold family with readable text', theme => {
    const value = tokens(theme);
    for (const role of ['transcription-accent','accent-offline','accent-invitation','material-domain-gold-color','score-query']) expect(value(role)).toBe(value('accent'));
    for (const [alias,role] of [['canvas-surface','surface'],['canvas-surface-raised','surface-raised'],['canvas-surface-overlay','surface-overlay']]) expect(value(alias)).toBe(value(role));
    expect(value('material-wordmark-gold-mid')).toBe(value('material-gold-mid'));
    expect(value('material-wordmark-gold-deep')).toBe(value('material-gold-deep'));
    expect(value('material-wordmark-gold-light')).not.toBe(value('material-gold-light'));
    for (const surface of ['surface-sunken','surface','surface-raised','surface-overlay','surface-hover']) {
      for (const role of ['ink','ink-secondary','ink-muted','accent','success','danger','warning']) expect(contrast(value(role),value(surface)), `${theme} ${role} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(value('focus'),value(surface))).toBeGreaterThanOrEqual(3);
    }
    expect(contrast(value('on-danger'),value('danger')), `${theme} destructive button lettering`).toBeGreaterThanOrEqual(4.5);
    expect(contrast(value('on-accent'),value('accent')), `${theme} primary button lettering`).toBeGreaterThanOrEqual(4.5);
    expect(value('print-paper')).toBe('#ffffff'); expect(value('print-ink')).toBe('#000000');
    expect(value('control-target-touch')).toBe('44px'); expect(value('control-height-compact')).toBe('32px');
  });
  it('canonicalizes A01 and A02 and keeps modern instructional lettering', () => {
    const value=tokens('parchment');
    expect(value('accent')).toBe('#795315');expect(value('browser-chrome')).toBe('#e8d8b6');
    const source=readFileSync(process.env.FOUNDATION_TOKEN_SOURCE ?? 'src/design-system/tokens.css','utf8');
    const revival=postcss.parse(source).nodes.find(n=>n.type==='rule'&&n.selector===':root[data-type="revival"]');
    expect(revival?.toString()).not.toMatch(/--ds-font-(body|control|mono):/);
    expect(revival?.toString()).toContain("'Modern Antique 1889'");
    expect(revival?.toString()).toContain('Baltimore Black Slope 1832');
  });
  it('holds explicit, OS, cross-tab, type/title and material requests until repertoire, including reselection', async () => {
    vi.resetModules();
    const dom=new JSDOM('<html data-theme="night-paper" data-theme-preference="system"><head></head><body></body></html>',{url:'http://localhost/'});
    const listeners: (()=>void)[]=[];
    const media={matches:false,addEventListener:(_:string,fn:()=>void)=>listeners.push(fn)};
    for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,location:dom.window.location,MutationObserver:dom.window.MutationObserver,Event:dom.window.Event,matchMedia:()=>media,getComputedStyle:()=>({getPropertyValue:()=>''})}))vi.stubGlobal(key,value);
    try {
      const api=await import('../src/design-system/theme');api.initializeTheme();
      const root=document.documentElement;
      api.setAppearanceRehearsing(true);
      media.matches=true;listeners.forEach(fn=>fn());
      expect(root.dataset.theme).toBe('night-paper');
      api.setThemePreference('night-paper');listeners.forEach(fn=>fn());
      const paper=vi.fn(),oldPaper=vi.fn();
      api.requestAppearanceChange('paper',oldPaper);api.requestAppearanceChange('paper',paper);
      api.setAppearanceRehearsing(true); // pause/stop is still in the player
      expect(paper).not.toHaveBeenCalled();
      api.setAppearanceRehearsing(false);
      expect(root.dataset.theme).toBe('night-paper');expect(paper).toHaveBeenCalledOnce();expect(oldPaper).not.toHaveBeenCalled();
      api.setAppearanceRehearsing(true);
      window.localStorage.setItem('ai-capella-schrift','bodoni');
      window.dispatchEvent(new dom.window.StorageEvent('storage',{key:'ai-capella-schrift',newValue:'bodoni'}));
      window.localStorage.setItem('ai-capella-start','zeile');
      window.dispatchEvent(new dom.window.StorageEvent('storage',{key:'ai-capella-start',newValue:'zeile'}));
      window.dispatchEvent(new dom.window.StorageEvent('storage',{key:'ai-capella-design',newValue:'pergament'}));
      expect(root.dataset.theme).toBe('night-paper');expect(root.dataset.title).toBeUndefined();
      api.setAppearanceRehearsing(false);
      expect(root.dataset.theme).toBe('parchment');expect(root.dataset.type).toBeUndefined();expect(root.dataset.title).toBe('zeile');
      expect(root.dataset.experimental).toContain('bodoni-type');
      api.setAppearanceRehearsing(true);api.setThemePreference('night-paper');api.setThemePreference('parchment');
      api.setAppearanceRehearsing(false);expect(root.dataset.theme).toBe('parchment');
      api.setThemePreference('system');api.setAppearanceRehearsing(true);media.matches=false;listeners.forEach(fn=>fn());
      expect(root.dataset.theme).toBe('parchment');api.setAppearanceRehearsing(false);expect(root.dataset.theme).toBe('night-paper');
    } finally {dom.window.close();vi.unstubAllGlobals();vi.resetModules();}
  });
});
