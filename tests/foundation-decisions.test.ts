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


// Execute the production navigation boundary without booting audio, sockets or the full workspace.
async function mainFunction(name: string, dependencies: Record<string, unknown>) {
  const ts = await import('typescript');
  const source = ts.createSourceFile('main.ts', readFileSync('src/main.ts','utf8'), ts.ScriptTarget.Latest, true);
  const fn = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (!fn) throw Error(`Missing production function ${name}`);
  const compiled = ts.transpileModule(fn.getText(source), {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  return new Function(...Object.keys(dependencies), compiled + `; return ${name};`)(...Object.values(dependencies));
}

it.each(['landing','library'])('D05 releases queued appearance when the player exits to %s', async mode => {
  const dom = new JSDOM('<div id="app" class="mode-player"></div>');
  const apply = vi.fn();
  let held = false;
  const setView = await mainFunction('setViewMode', {
    app:dom.window.document.querySelector('#app'), transcriptionPreviewMode:undefined,
    renderLanding:vi.fn(), setAppearanceRehearsing:(next:boolean)=>{held=next;if(!held)apply();},
    backdrop:{setShown:vi.fn()}, closeOverlay:vi.fn(), stopLandingRibbons:undefined,
    START_STAGE:false, START_STAFF:false, titleName:null, animateRibbons:()=>vi.fn(),
    document:dom.window.document, stopIntro:vi.fn(), offerIntro:vi.fn(), requestAnimationFrame:vi.fn(),
    drawAllCovers:vi.fn(), drawMarks:vi.fn(), resizeCanvases:vi.fn(), releaseWakeLock:vi.fn(),
  });
  setView('player');expect(held).toBe(true);
  setView(mode);expect(held).toBe(false);expect(apply).toHaveBeenCalledOnce();
  dom.window.close();
});

it('D26 describes shared playback and personal volume/mute/solo in both tour translations', async () => {
  const {sharedPlaybackTourMessages:copy} = await import('../src/i18n');
  expect(copy.player.en).toMatch(/playback controls apply on every device/i);
  expect(copy.player.en).toMatch(/volume, mute and solo stay personal/i);
  expect(copy.player.de).toMatch(/Wiedergabesteuerung gilt auf allen Geräten/);
  expect(copy.player.de).toMatch(/Lautstärke, Stummschaltung und Solo bleiben persönlich/);
  for (const language of ['de','en'] as const) {
    expect(copy.player[language]).not.toMatch(/take the lead|Führung übernehmen/i);
    expect(copy.library[language]).toMatch(/alle|everyone/);
  }
});

vi.mock('../src/admin-access', () => ({confirmAdmin:vi.fn()}));
vi.mock('../src/admin-ui', () => ({AdminPage:()=>null}));
it('rechecks sysadmin access on stay navigation and hides admin content after revocation', async () => {
  const {confirmAdmin}=await import('../src/admin-access');
  const {Route}=await import('../src/routes/admin.$');
  const beforeLoad = Route.options.beforeLoad!;
  vi.mocked(confirmAdmin).mockResolvedValue(true);
  await beforeLoad({cause:'enter'} as NonNullable<Parameters<typeof beforeLoad>[0]>);
  await beforeLoad({cause:'stay'} as NonNullable<Parameters<typeof beforeLoad>[0]>);
  expect(confirmAdmin).toHaveBeenCalledTimes(2);
  vi.mocked(confirmAdmin).mockResolvedValue(false);
  await expect(beforeLoad({cause:'stay'} as NonNullable<Parameters<typeof beforeLoad>[0]>)).rejects.toMatchObject({isNotFound:true});
});


it('restores song order after a failed save without showing a persistent toast immediately before reload', async () => {
  const ts=await import('typescript');
  const source=ts.createSourceFile('main.ts',readFileSync('src/main.ts','utf8'),ts.ScriptTarget.Latest,true);
  let callback: import('typescript').Node | undefined;
  const visit=(node:import('typescript').Node)=>{if(ts.isPropertyAssignment(node)&&node.name.getText(source)==='onDrop')callback=node.initializer;ts.forEachChild(node,visit);};
  visit(source);if(!callback)throw Error('Missing reorder onDrop');
  const compiled=ts.transpileModule('const onDrop='+callback.getText(source),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const reload=vi.fn(),notify=vi.fn();
  const save=vi.fn().mockRejectedValue(Error('network failure'));
  const onDrop=new Function('importedSongs','saveSongOrder','location','toast','t','errorText',compiled+';return onDrop;')([{id:'piece'}],save,{reload},notify,()=>'',String);
  onDrop(['piece']);await new Promise(resolve=>setTimeout(resolve,0));
  expect(save).toHaveBeenCalledWith([{id:'piece',sortKey:0}]);
  expect(reload).toHaveBeenCalledOnce();expect(notify).not.toHaveBeenCalled();
});

// Diagnostic OKLab/CVD contract from the approved D21/D42 proposal. This intentionally
// preserves close pairs in the first eight; numbered names supply the second identity cue.
describe('D42 approved extended voice palette', () => {
  const proposal = JSON.parse(readFileSync('tests/fixtures/voice-palette.json','utf8'));
  const decode = (v:number) => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4;
  const encode = (v:number) => v <= .0031308 ? v*12.92 : 1.055*v**(1/2.4)-.055;
  const multiply = (m:number[][],v:number[]) => m.map(row => row.reduce((sum,n,i)=>sum+n*v[i],0));
  const rgb = (v:string) => {const c=normalizeColor(v);return [c.r,c.g,c.b].map(n=>n/255);};
  const lab = (v:number[]) => multiply([[.2104542553,.7936177850,-.0040720468],[1.9779984951,-2.4285922050,.4505937099],[.0259040371,.7827717662,-.8086757660]],multiply([[.4122214708,.5363325363,.0514459929],[.2119034982,.6806995451,.1073969566],[.0883024619,.2817188376,.6299787005]],v.map(decode)).map(Math.cbrt));
  const distance = (a:number[],b:number[]) => Math.hypot(...a.map((n,i)=>n-b[i]))*100;
  it.each(['night-paper','parchment','velvet'])('%s retains the first eight and meets the approved contrast/CVD bounds', theme => {
    const value=tokens(theme),expected=proposal.themes[theme];
    const colors=Array.from({length:16},(_,i)=>value(`voice-${i+1}`));
    colors.forEach((c,i)=>expect(normalizeColor(c).css).toBe(normalizeColor(expected.tokens[`--ds-voice-${i+1}`]).css));
    for (const c of colors.slice(8)) for (const bg of ['page-background','surface-sunken','surface-raised','surface-overlay','material-paper-ground','canvas-surface','score-stage-top','score-stage-middle','score-stage-bottom']) expect(contrast(c,value(bg)),`${theme} ${c} against ${bg}`).toBeGreaterThanOrEqual(3);
    for (const c of colors.slice(8)) expect(distance(lab(rgb(c)),lab(rgb(value('score-paper'))))).toBeGreaterThanOrEqual(10.5);
    for (const mode of ['normal','protanopia','deuteranopia','tritanopia']) {
      const simulated=colors.map(c=>lab(mode==='normal'?rgb(c):multiply(proposal.matrices[mode],rgb(c).map(decode)).map(v=>encode(Math.max(0,Math.min(1,v))))));
      let minimum=Infinity,added=Infinity;
      for(let i=0;i<16;i++)for(let j=i+1;j<16;j++){const d=distance(simulated[i],simulated[j]);minimum=Math.min(minimum,d);if(j>=8)added=Math.min(added,d);}
      expect(minimum).toBeCloseTo(expected.cvd[mode].min_deltaE,2);
      expect(added).toBeGreaterThan(mode==='normal'?10.8:theme==='parchment'?2.65:4.4);
    }
    // D43 explicitly stays pending comparison approval.
    if(theme==='parchment')expect(normalizeColor(value('voice-4')).css).toBe(normalizeColor('#5A8A2A').css);
  });
  it('preserves identity through rename, reorder, removal, restoration and newly split parts', async () => {
    const {assignVoiceNumbers,voiceLabel}=await import('../src/voiceIdentity');
    const parts=[{id:'s',name:'Soprano'},{id:'b',name:'Bass'}];
    const stored=assignVoiceNumbers(parts);const renamed=[{id:'b',name:'Basso'},{id:'s',name:'Sopran'}];
    expect(assignVoiceNumbers(renamed,stored)).toEqual(stored);
    expect(voiceLabel(renamed[0])).toBe('2 · Basso');
    const next=assignVoiceNumbers([{id:'s',name:'Sopran'},{id:'s-staff1',name:'Left hand'}],stored);
    expect(next).toEqual({s:1,b:2,'s-staff1':3});
    expect(assignVoiceNumbers([{id:'b',name:'Bass'}],next)).toEqual(next);
  });
});
