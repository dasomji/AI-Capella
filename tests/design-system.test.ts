// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { themeRegistry, themeBootstrapScript } from '../src/design-system/theme/bootstrap';
import { normalizeColor } from '../src/design-system/theme/color';
import { withAlpha, towardPaper, towardInk } from '../src/theme';

const tokenSchemes = (await import('node:fs')).readFileSync('src/design-system/tokens.css','utf8').match(/:root\[data-theme="[^"]+"\][^{]*\{[^}]+\}/g)?.join('\n') ?? '';

function boot(query = '', stored: string | null = null, light = false, denied = false) {
  const dom = new JSDOM('<!doctype html><html><head><style>' + tokenSchemes + '</style></head><body></body></html>', { url: `http://localhost/${query}`, runScripts: 'outside-only' });
  if (stored) dom.window.localStorage.setItem('ai-capella-design', stored);
  Object.defineProperty(dom.window, 'matchMedia', { value: () => ({ matches: light }) });
  if (denied) Object.defineProperty(dom.window, 'localStorage', { get() { throw Error('storage denied'); } });
  dom.window.eval(themeBootstrapScript);
  return dom;
}

describe('one early appearance resolver', () => {
  it.each([false,true])('resolves system preference for light %s', light => {
    const dom = boot('',null,light);
    expect(dom.window.document.documentElement.dataset.theme).toBe(themeRegistry.find(theme => theme.system === (light ? 'light' : 'dark'))?.id);
    dom.window.close();
  });
  it.each(themeRegistry)('preserves explicit $id over system appearance', theme => {
    const dom=boot('',theme.storage,theme.system !== 'light');
    expect(dom.window.document.documentElement.dataset.theme).toBe(theme.id);
    expect(dom.window.document.documentElement.style.colorScheme).toBe(dom.window.getComputedStyle(dom.window.document.documentElement).getPropertyValue('--ds-color-scheme').trim());
    dom.window.close();
    const reset=boot('?design=auto',theme.storage,false);
    expect(reset.window.document.documentElement.dataset.theme).toBe(themeRegistry.find(theme=>theme.system==='dark')?.id);
    reset.window.close();
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
    expect(withAlpha(color, .3)).toMatch(/^rgba\(.+, 0.3\)$/);
    expect(towardPaper(color, 1, normalizeColor('#efe7da'))).toBe('rgb(239,231,218)');
    expect(towardInk(color, 1, normalizeColor('#140c1e'))).toBe('rgb(20,12,30)');
  });
});

// Review regressions: authored structure is independent of the rendering engine.
describe('theme source contracts M1/M2/M6/M7 and m1/m3/m4/m6/N2', () => {
  it('hoists shared roles, keeps identical theme key sets and generates the exact manifest', async () => {
    const fs = await import('node:fs');
    const { default: postcss } = await import('postcss');
    const { roleManifest } = await import('../scripts/design-token-manifest.mjs');
    const { themeRoleNames } = await import('../src/design-system/theme/roles.generated');
    const { themeRegistry } = await import('../src/design-system/theme/bootstrap');
    const source = fs.readFileSync('src/design-system/tokens.css', 'utf8');
    const css = postcss.parse(source);
    const blocks = css.nodes.filter(n => n.type === 'rule' && n.selector.includes('data-theme='));
    const keys = blocks.map(block => block.type === 'rule' ? block.nodes.filter(n => n.type === 'decl').map(n => n.type === 'decl' ? n.prop : '').sort() : []);
    expect(keys).toHaveLength(themeRegistry.length);
    for (const key of keys) expect(key).toEqual(keys[0]);
    expect(keys[0].length).toBeGreaterThanOrEqual(75);
    const shared = new Set<string>();
    css.walkRules(rule => { if (rule.selector === ':root') rule.walkDecls(d => { if (d.prop.startsWith('--ds-')) shared.add(d.prop); }); });
    for (const key of keys[0]) expect(shared.has(key)).toBe(false);
    expect(shared.has('--ds-radius-control')).toBe(true);
    expect([...themeRoleNames]).toEqual(roleManifest(source));
    expect(source).not.toMatch(/--pigment-\d+\b/);
    expect(source).not.toMatch(/\.fb-item|\.landing-dedication|--breakpoint-(?:panel-max|short-landscape)/);
    const adapters = css.nodes.filter(n => n.type === 'atrule' && n.name === 'theme' && n.params === 'inline');
    const mappings = new Map<string, string>();
    for (const adapter of adapters) if (adapter.type === 'atrule') adapter.walkDecls(d => { mappings.set(d.prop, d.value); });
    const authored = new Set<string>(); css.walkDecls(d => { authored.add(d.prop); });
    // Backing roles used by canvas/native CSS need no unused Tailwind alias. Every
    // exported adapter reference must still name an authored semantic role.
    for (const [name,value] of mappings) for (const match of value.matchAll(/var\((--ds-[\w-]+)/g))
      expect(authored.has(match[1]), name+' references '+match[1]).toBe(true);
    for (const block of blocks) if (block.type === 'rule') block.walkDecls('--ds-material-fibre', d => {
      expect(d.value === 'none' || d.value.startsWith('var(--ds-material-fibre-live,')).toBe(true);
    });
    const paper = fs.readFileSync('src/paper.ts','utf8');
    expect(paper).toContain("setProperty('--ds-material-fibre-live'");
    expect(paper).not.toContain('notifyThemeMaterialChange();');
    expect(fs.existsSync('src/design-system/legacy-components.css')).toBe(false);
  });
  it('M2 derives every alias/storage/compatibility mapping from the registry', async () => {
    const { themeRegistry } = await import('../src/design-system/theme/bootstrap');
    for (const theme of themeRegistry) for (const alias of [theme.id, ...theme.aliases]) {
      const dom = boot('?design='+alias);
      const data = dom.window.document.documentElement.dataset;
      expect(data.theme).toBe(theme.id);
      expect(data.design).toBeUndefined();
      expect(data.ground).toBeUndefined();
      if (theme.defaultStart) expect(data.start).toBeUndefined();
      dom.window.close();
    }
  });
  it('M6 compiles named spacing/layer scales and strict panel variants', async () => {
    const fs = await import('node:fs');
    const { compile } = await import('tailwindcss');
    const source = fs.readFileSync('src/design-system/tokens.css','utf8').replace('@theme static {','@theme static prefix(tw) {');
    const compiler = await compile(source+'\n@tailwind utilities;');
    const css = compiler.build(['tw:p-micro','tw:z-dialog','tw:max-panel:w-section']);
    expect(css).toContain('padding: var(--ds-space-micro)');
    expect(css).toContain('z-index: var(--ds-layer-dialog)');
    expect(css).toContain('@media (width < 900px)');
    expect(css).not.toContain('--breakpoint-panel-max');
  });
  it('M2 keeps compatibility appearance independent of a theme storage identifier', async () => {
    const { legacyDesign } = await import('../src/design');
    const entry = themeRegistry[0], storage = entry.storage;
    try {
      Object.assign(entry, { storage: 'future-theme-storage' });
      expect(legacyDesign(entry.id)).toBe(entry.aliases[0]);
    } finally { Object.assign(entry, { storage }); }
  });
  it('m5 imports staffView without a DOM or loaded stylesheet', async () => {
    const staff = await import('../src/staffView');
    expect(staff.BASE_PIXELS_PER_BEAT).toBe(120);
  });
});

describe('client theme lifecycle API', () => {
  it('reads non-enumerable styles, revisions, immediate subscriptions, alpha and memoized resources', async () => {
    const { vi } = await import('vitest');
    vi.resetModules();
    const dom = new JSDOM('<html data-theme="night-paper" data-theme-preference="night-paper"><head><meta name="theme-color"></head><body></body></html>', {url:'http://localhost/'});
    const mediaListeners = new Set<() => void>();
    const media = { matches:false, addEventListener: (_: string, fn: () => void) => mediaListeners.add(fn) };
    for (const [key, value] of Object.entries({window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,location:dom.window.location,MutationObserver:dom.window.MutationObserver,Event:dom.window.Event,matchMedia:()=>media})) vi.stubGlobal(key,value);
    const api = await import('../src/design-system/theme');
    const { themeRoleNames } = await import('../src/design-system/theme/roles.generated');
    const values: Record<string,string> = Object.fromEntries(themeRoleNames.map(role=>['--ds-'+role,'1']));
    for (const role of api.colorRoles) values['--ds-'+role]='#123456';
    for (const role of api.fontRoles) values['--ds-font-'+role]='Snapshot Font';
    for (let i=1;i<=8;i++) values['--ds-voice-'+i]='#123456';
    Object.assign(values, {'--ds-material-strategy':'light','--ds-print-paper':'#ffffff','--ds-print-ink':'#000000','--ds-print-font-text':'Print Font','--ds-print-font-music':'Music Font','--tw-breakpoint-panel':'56.25rem'});
    // Deliberately not iterable: Safari's custom-property enumeration is not a contract.
    const computed = vi.fn(()=>({getPropertyValue:(key:string)=>values[key]??'',fontSize:'16px'}));
    vi.stubGlobal('getComputedStyle',computed);
    try {
      const initialRevision=api.getThemeRevision();
      expect(computed).toHaveBeenCalledTimes(1); // browser chrome only; revision allocates no snapshot
      const a=api.readTheme();
      expect(a.revision).toBe(initialRevision);
      expect(a.roles).toHaveProperty('font-body','Snapshot Font');
      expect(api.readTheme()).toBe(a);
      expect(Object.isFrozen(a.roles)).toBe(true);
      expect(a.color('accent').rgba(.5)).toBe('rgba(18, 52, 86, 0.5)');
      expect(a.color('accent').withAlpha(.5).a).toBe(.5);
      const derive=vi.fn(theme=>theme.color('accent').css);
      const resource=api.memoizeByTheme(derive);
      resource();resource();expect(derive).toHaveBeenCalledTimes(1);
      const listener=vi.fn(); const stop=api.subscribeTheme(listener,{immediate:true});
      expect(listener).toHaveBeenCalledTimes(1);expect(listener).toHaveBeenLastCalledWith(a);
      values['--ds-material-fibre']='runtime texture';api.notifyThemeMaterialChange();
      expect(api.getThemeRevision()).toBe(initialRevision+1);
      expect(listener).toHaveBeenCalledTimes(2);
      expect(api.readTheme().roles['material-fibre']).toBe('runtime texture');
      resource();expect(derive).toHaveBeenCalledTimes(2);
      stop();api.notifyThemeMaterialChange();expect(listener).toHaveBeenCalledTimes(2);
      expect(api.breakpoint('panel')).toBe('900px');
      const query=vi.fn(()=>media);vi.stubGlobal('matchMedia',query);Object.defineProperty(dom.window,'matchMedia',{value:query,configurable:true});
      api.matchBreakpoint('panel','below');expect(query).toHaveBeenCalledWith('(width < 900px)');
      dom.window.history.replaceState(null,'','/?design=papier&schrift=bodoni');
      dom.window.dispatchEvent(new dom.window.StorageEvent('storage',{key:'ai-capella-design',newValue:'pergament'}));
      expect(new URL(dom.window.location.href).searchParams.has('design')).toBe(false);
      expect(new URL(dom.window.location.href).searchParams.get('schrift')).toBe('bodoni');
      expect(api.readTheme().id).toBe('parchment');
      api.setThemePreference('night-paper');
      expect(api.readTheme().id).toBe('night-paper');
      expect(dom.window.localStorage.getItem('ai-capella-design')).toBe('papier');
      dom.window.document.documentElement.dataset.themePreference='system';
      for(const notify of mediaListeners)notify();
      expect(api.readTheme().id).toBe('night-paper');
      dom.window.dispatchEvent(new dom.window.StorageEvent('storage',{key:'ai-capella-design',newValue:'pergament'}));
      expect(api.readTheme().id).toBe('parchment');
      const revision=api.getThemeRevision();
      await new Promise(resolve=>setTimeout(resolve,0));
      expect(api.getThemeRevision()).toBe(revision); // observer must not double-notify
    } finally {dom.window.close();vi.unstubAllGlobals();vi.resetModules();}
  });
  it('SSR hook returns an empty snapshot without reading a document', async () => {
    const { createElement }=await import('react');
    const { renderToString }=await import('react-dom/server');
    const { useTheme }=await import('../src/design-system/theme/react');
    const { getThemeRevision, subscribeTheme }=await import('../src/design-system/theme');
    const Component=()=>createElement('span',null,useTheme()?.id??'server');
    expect(renderToString(createElement(Component))).toBe('<span>server</span>');
    expect(getThemeRevision()).toBe(0);
    expect(()=>subscribeTheme(()=>{}, {immediate:true})()).not.toThrow();
  });
});

it('derives the bootstrap scheme solely from the token block', () => {
  for (const theme of themeRegistry) {
    expect(theme).not.toHaveProperty('colorScheme');
    const dom = boot('', theme.storage);
    const root = dom.window.document.documentElement;
    root.style.setProperty('--ds-color-scheme', 'only light');
    dom.window.eval(themeBootstrapScript);
    expect(root.style.colorScheme).toBe('only light');
    dom.window.close();
  }
});
it('leaves theme-color ownership to the idempotent bootstrap', async () => {
  const { readFileSync } = await import('node:fs');
  expect(readFileSync('src/routes/__root.tsx', 'utf8')).not.toMatch(/name:\s*['"]theme-color/);
  const dom = boot();
  dom.window.eval(themeBootstrapScript);
  expect(dom.window.document.querySelectorAll('meta[name="theme-color"]')).toHaveLength(1);
  dom.window.close();
});
it('restores inherited typography on reset elements and their pseudo-elements', async () => {
  const { readFileSync } = await import('node:fs');
  const { default: postcss } = await import('postcss');
  const css = postcss.parse(readFileSync('src/design-system/components.css', 'utf8'));
  for (const selector of ['.ds-reset', '.ds-reset::before', '.ds-reset::after']) {
    const values = new Map<string, string>();
    css.walkRules(rule => { if (rule.selectors.includes(selector)) rule.walkDecls(d => { values.set(d.prop, d.value); }); });
    for (const prop of ['text-align', 'letter-spacing', 'text-transform', 'white-space', 'text-indent', 'word-spacing', 'line-height', 'font-variant', 'direction'])
      expect(values.get(prop), `${selector}: ${prop}`).toBe('inherit');
  }
});
it('keeps the eager toast import graph limited to overlay recipes', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync('src/design-system/behavior/toast.ts', 'utf8');
  expect(source).toContain('from "../recipes/overlays"');
  expect(source).not.toMatch(/from ["']\.\.\/recipes["']/);
});

it('builds a loud fourth theme from every resolved paint alias', async () => {
  const { readFileSync } = await import('node:fs');
  const { loudThemeBlock } = await import('./theme-extension-fixture.mjs');
  const block = loudThemeBlock(readFileSync('src/design-system/tokens.css','utf8'));
  if(block.type !== 'rule')throw Error('Expected a theme block');
  const paint = new Map<string,string>(); block.walkDecls(d=>{paint.set(d.prop,d.value);});
  expect(paint.get('--ds-accent')).not.toMatch(/var\(--pigment-/);
  expect(paint.get('--ds-ink')).toMatch(/rgba\(/);
  expect(paint.get('--ds-artwork-cover-ground')).toMatch(/rgba\(/);
  expect(paint.get('--ds-voice-fallback-saturation')).toBe('92');
  expect(paint.get('--ds-voice-fallback-lightness')).toBe('50');
  expect(paint.size).toBeGreaterThan(200);
});

it('keeps ongoing guides and reusable scripts independent of phase evidence and archived revisions', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const guides = [...readdirSync('docs/agents').map(n=>'docs/agents/'+n), ...readdirSync('docs/adr').map(n=>'docs/adr/'+n), 'GLOSSARY.md'];
  for (const file of guides.filter(f=>f.endsWith('.md'))) {
    const source=readFileSync(file,'utf8');
    expect(source,file).not.toContain('/tmp/aicap-design/');
    expect(source,file).not.toMatch(/\bP[1-9](?:[/.][0-9]|\b)(?!_)/);
  }
  for (const file of ['browser-design-system-runner','browser-p4c-parity','browser-p4c-tour-parity']) {
    const source=readFileSync(`scripts/${file}.mjs`,'utf8');
    expect(source,file).not.toMatch(/\/tmp\/aicap-design\/|tailf5ea68|\b[a-f0-9]{40}\b/);
  }
});
it('runs acceptance and adapter parity with reusable keyboard, auth and admin checks in CI', async () => {
  const { readFileSync } = await import('node:fs');
  const workflow=readFileSync('.github/workflows/deploy.yml','utf8');
  for(const command of ['test:browser:theme-extension','test:browser:design-system','test:browser:keyboard','test:browser:admin-parity','test:browser:auth-flows','check:design-utilities'])expect(workflow).toContain(`npm run ${command}`);
});
it('uses named toast, title intensity and print viewport roles at their consumers', async () => {
  const { readFileSync } = await import('node:fs');
  for(const [file,roles] of Object.entries({lightName:['light-name-letter-spacing','title-name-flare-core-alpha','title-name-flare-edge-alpha'],titleStage:['stage-beam-core-alpha','stage-grain-strand-alpha-min','stage-staff-dark-alpha'],exportPdf:['print-export-viewport-width']})){
    const source=readFileSync(`src/${file}.ts`,'utf8');
    for(const role of roles)expect(source,`${file}: ${role}`).toContain(`roles['${role}']`);
  }
  const main=readFileSync('src/main.ts','utf8');
  for(const role of ['space-content','space-panel','space-action','space-tight'])
    expect(main,role).toContain(`var(--ds-${role})`);
  expect(main).not.toContain('calc(16px + (100% - 32px)');
});

it('keeps native unbounded size utilities independent of the zero-spacing scale', async () => {
  const { readFileSync } = await import('node:fs');
  const { compile } = await import('tailwindcss');
  const source=readFileSync('src/design-system/tokens.css','utf8').replace('@theme static {','@theme static prefix(tw) {');
  const compiler=await compile(source+'\n@tailwind utilities;');
  const generated=compiler.build(['tw:max-w-none','tw:max-h-none']);
  const css=generated.slice(generated.indexOf('.tw\\:max-h-none'));
  for(const prop of ['max-width','max-height']) {
    expect(css).toContain(`${prop}: none`);
    expect(css,`${prop} must not collapse to the zero-spacing token`).not.toMatch(new RegExp(`${prop}:\\s*var\\(--ds-space-`));
  }
});


it('retains the earlier title for the experimental Velvet look', () => {
  const dom = boot('?design=samt');
  const root = dom.window.document.documentElement;
  expect(themeRegistry.find(theme => theme.id === 'velvet')?.defaultStart).toBe('heute');
  expect(root.dataset.start).toBeUndefined();
  expect(root.dataset.experimental).toContain('earlier-title');
  dom.window.close();
});
