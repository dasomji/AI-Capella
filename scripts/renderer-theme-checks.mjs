import * as api from '/src/design-system/theme/index.ts';
import { subscribeRendererTheme } from '/src/rendererTheme.ts';

let mode, repaint = () => {}, stopVoice = () => {}, stopAnimation = () => {};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw Error(message); };
function seed() {
  let value = 1979;
  Math.random = () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
}
async function settle() {
  for (const job of window.textureJobs.splice(0)) job();
  await sleep(160); // title font/layout promises and its existing resize debounce
  seed(); p2.tick(0); await Promise.resolve();
  seed(); p2.tick(20000); await Promise.resolve();
  seed(); p2.tick(20016);
}
function canvas(h = 200) {
  const c = document.createElement('canvas'); c.width = 1200; c.height = h;
  c.style.cssText = `display:block;width:1200px;height:${h}px`;
  document.body.append(c); return c;
}
function voices() {
  const parts = p2.modules[13].parseMusicXML(p2.fixtures[12]).parts;
  for (const part of parts) {
    const el = document.createElement('div'); el.dataset.part = part.id; document.body.append(el);
  }
  for (let i = 0; i < 16; i++) {
    const el = document.createElement('div'); el.dataset.themeVoice = String(i); el.dataset.themeVoiceCount = '16'; document.body.append(el);
  }
  stopVoice();
  stopVoice = subscribeRendererTheme({ score: () => ({ parts }), repaint: () => {}, resize: () => {} });
}
export async function draw(next) {
  stopAnimation(); stopAnimation = () => {};
  stopVoice();
  mode = next; seed();
  const [theme, , , , , art, , , , , , , paper] = p2.modules;
  const custom = ['paper', 'gel', 'stage-fill', 'ribbons', 'backdrop'].includes(mode);
  await p2.draw(custom ? 'overview' : mode, 12);
  if (custom) document.body.replaceChildren();
  if (mode === 'paper') {
    const c = canvas();
    repaint = () => paper.paintSwatch(c, paper.paperKind(), 1200, 200);
  } else if (mode === 'gel') {
    const c = canvas(), ctx = c.getContext('2d');
    // The same voice value in both themes exercises cached shades independently of voice changes.
    repaint = () => {
      ctx.clearRect(0, 0, c.width, c.height);
      for (const [i, lit] of [false, true].entries()) theme.gelPill(ctx, 20 + i * 300, 40, 250, 50, 'hsl(47, 70%, 72%)', lit);
    };
  } else if (mode === 'stage-fill') {
    const c = canvas(), ctx = c.getContext('2d');
    repaint = () => { ctx.fillStyle = theme.stageFill(ctx, 200); ctx.fillRect(0, 0, 1200, 200); };
  } else if (mode === 'ribbons') {
    const c = canvas(400);
    const dispose = art.animateRibbons(c, (w, h) => ({ voices: 12, x0: 20, x1: w - 20, cy: h / 2, gap: 20, amp: 30 }));
    stopAnimation = dispose;
    repaint = () => {};
  } else if (mode === 'backdrop') {
    const { WaveBackdrop } = await import('/src/backdrop.ts');
    const backdrop = new WaveBackdrop();
    backdrop.setShown(true); repaint = () => { backdrop.setShown(true); };
  } else if (['roll', 'staff', 'overview'].includes(mode)) repaint = () => p2.repaint();
  else if (['stage', 'title-staff'].includes(mode)) repaint = () => {};
  else {
    // Covers and the light sample are stateless draw functions; repaint existing canvas data.
    repaint = async () => {
      const markers = [...document.querySelectorAll('[data-part], [data-theme-voice]')];
      seed(); await p2.draw(mode, 12); document.body.append(...markers);
    };
  }
  await settle(); await repaint(); await repaint(); voices();
}
export async function swap(to) {
  seed(); api.setThemePreference(to);
  await settle(); await repaint(); await repaint();
}
export async function changeInputs(overrides) {
  for (const [key, value] of Object.entries(overrides)) document.documentElement.style.setProperty('--ds-' + key, value);
  seed(); api.notifyThemeMaterialChange(); await settle(); await repaint(); await repaint();
}
export function images() { return [...document.querySelectorAll('canvas')].map(c => c.toDataURL()); }
export function verifyVoices() {
  const theme = api.readTheme(), palette = p2.modules[1];
  const nodes = [...document.querySelectorAll('[data-part], [data-theme-voice]')];
  return nodes.length === 28 && nodes.every(el => {
    const index = el.dataset.part ? Number(el.dataset.part.slice(1)) : Number(el.dataset.themeVoice);
    return el.style.getPropertyValue('--c') === palette.colorForPart(index, el.dataset.part ? 12 : 16, theme);
  });
}
export async function verifyLifecycle() {
  const [theme, , , , , , , , , , , , paper] = p2.modules;
  await theme.canvasFontsReady(); await document.fonts.ready; paper.initPaper();
  let paints = 0, resizes = 0, textureCompletions = 0;
  const dispose = subscribeRendererTheme({ score: () => null, repaint: () => paints++, resize: () => resizes++ });
  const completed = () => textureCompletions++;
  window.addEventListener('paperchange', completed);
  const revision = api.getThemeRevision();
  api.setThemePreference('parchment');
  assert(paints === 1 && resizes === 0, 'm2 one repaint with loaded fonts');
  assert(window.textureJobs.length > 0 && textureCompletions === 0, 'm2 paper regeneration deferred');
  assert(api.getThemeRevision() === revision + 1, 'm2 no synchronous nested material revision');
  const stale = window.textureJobs.splice(0);
  api.setThemePreference('night-paper');
  const currentRevision = api.getThemeRevision();
  for (const job of stale) job();
  assert(textureCompletions === 0, 'm2 late job cannot apply to newer theme');
  for (const job of window.textureJobs.splice(0)) job();
  assert(textureCompletions === 1 && paints === 2 && resizes === 0, 'm2 CSS texture output causes no listener cascade');
  assert(api.getThemeRevision() === currentRevision, 'm2 texture completion preserves semantic revision');
  await draw('gel'); const gel = images();
  await changeInputs({ 'print-paper': 'rgba(40, 80, 120, 0.2)' });
  assert(JSON.stringify(images()) === JSON.stringify(gel), 'm5 print paper cannot recolor screen gloss/masks');
  dispose(); window.removeEventListener('paperchange', completed);
  // Cached snapshots must not even touch data attributes on these drawing paths.
  for (const view of ['staff', 'roll']) {
    await draw(view);
    const getStyle = window.getComputedStyle;
    const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'dataset');
    let styleReads = 0, attributeReads = 0;
    window.getComputedStyle = (...args) => { styleReads++; return getStyle(...args); };
    Object.defineProperty(HTMLElement.prototype, 'dataset', { configurable: true, get() { attributeReads++; return descriptor.get.call(this); } });
    try { for (let i = 0; i < 20; i++) p2.repaint(); }
    finally { window.getComputedStyle = getStyle; Object.defineProperty(HTMLElement.prototype, 'dataset', descriptor); }
    assert(styleReads === 0 && attributeReads === 0, `m1 ${view}: no hot style/attribute reads (${styleReads} styles, ${attributeReads} attributes)`);
  }
  return { label: 'lifecycle', oneRepaint: true, deferredPaper: true, staleIdleRejected: true, noCascade: true, screenPrintIndependent: true, warmFrameReads: 0 };
}
export async function frozenPdf(swapped) {
  // Change all print colors after makePdf's synchronous job-start capture. White-on-white
  // mid-job inputs would erase the notation if the job read the current theme again.
  const pdf = p2.modules[14], xml = p2.modules[13];
  const score = xml.parseMusicXML(p2.fixtures[4]);
  const blob = await pdf.makePdf({ xml: p2.fixtures[4], title: score.title, semitones: 0, voices: score.parts.map(p => ({ ...p, include: true })) }, step => {
    if (swapped && step === 'engraver') {
      document.documentElement.style.setProperty('--ds-print-ink', 'rgb(255,255,255)');
      document.documentElement.style.setProperty('--ds-print-paper', 'rgb(120,160,180)');
      api.setThemePreference('parchment');
    }
  });
  return new Promise(resolve => { const r = new FileReader(); r.onload = () => resolve(r.result.split(',')[1]); r.readAsDataURL(blob); });
}

export function paperLayers() {
  const paper = p2.modules[12];
  const c = document.createElement('canvas'); c.width=1200; c.height=200;
  const ctx=c.getContext('2d'); const values={};
  for (const which of ['surface','light']) {
    ctx.clearRect(0,0,1200,200);
    paper.paintPaper(ctx,0,0,1200,200,paper.STILL,which,which==='surface'?paper.NIGHT_PAPER:null);
    values[which]=c.toDataURL();
  }
  return values;
}
