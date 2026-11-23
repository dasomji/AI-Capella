/**
 * Real player, stubbed API: the piano roll's pre-rendered buffers while the music moves. Plain
 * playback must never repaint what is in view at once -- the next stretch is painted ahead and
 * swapped in --, Play and Pause must repaint nothing, and only a real change may (pianoRoll.ts).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { ownerFixture } from './owner-decisions-fixture.mjs';
import { denseScore } from './perf-dense-score.mjs';

const out = path.resolve(process.env.BROWSER_EVIDENCE ?? '.review-evidence/roll-buffers');
await fs.mkdir(out, { recursive: true });
const hooks = `
window.rollCheck = {
  load: async () => { sessionMode = 'solo'; await loadSongLocally({ id: 'roll-check', title: 'Roll check', xml: window.ownerXML.dense, format: 'musicxml' }); setActiveView('roll'); renderNow(); },
  // The view moved on as playback moves it: frame after frame, a little further.
  step: (fromBar, beats, by) => { const start = currentScore.measures[fromBar - 1].startBeat; for (let b = start; b <= start + beats + 1e-9; b += by) { audioEngine.setPausedBeat(b); viewOffsetBeats = 0; viewGlide = null; renderNow(); } },
  settle: () => { renderNow(); return !pianoRoll.isAnimating(); },
  toggle: () => togglePlay(),
  playing: () => audioEngine.isPlaying(),
  only: (index) => toggleTrueSolo(currentScore.parts[index].id),
  sameMix: () => applyMixToViews(),
  info: () => pianoRoll.debugInfo(),
  repaint: () => { pianoRoll.repaint(); renderNow(); },
};`;
const { server, base } = await ownerFixture(out, hooks);
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const results = [];
try {
  for (const [name, device, roll] of [['phone, lantern', { viewport: { width: 360, height: 740 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, 'lantern'], ['phone, gel', { viewport: { width: 360, height: 740 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, 'gel'], ['laptop, lantern', { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }, 'lantern']]) {
    const context = await browser.newContext({ ...device, colorScheme: 'dark', reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript((roll) => { localStorage.setItem('ai-capella-lang', 'en'); localStorage.setItem('ai-capella-follow', '0'); if (roll === 'gel') localStorage.setItem('ai-capella-roll', 'gel'); }, roll);
    await page.routeWebSocket('**', (ws) => ws.close());
    await page.goto(`${base}owner.html`);
    await page.waitForFunction(() => window.ownerReady, null, { timeout: 120_000 });
    await page.evaluate((dense) => { window.ownerXML.dense = dense; }, denseScore({ measures: 80 }));
    await page.evaluate(() => window.rollCheck.load());
    const settle = async () => { for (let i = 0; i < 60; i++) { if (await page.evaluate(() => window.rollCheck.settle())) return; await page.waitForTimeout(30); } assert.fail(`${name}: the roll never finished painting`); };
    const info = () => page.evaluate(() => window.rollCheck.info());
    await page.evaluate(() => window.rollCheck.step(5, 0, 1));
    await settle();

    // Sixty beats of music go by: stretches painted ahead and swapped in, nothing repainted at once.
    let before = await info();
    await page.evaluate(() => window.rollCheck.step(5, 60, 0.02));
    let after = await info();
    assert.equal(after.rebuilds, before.rebuilds, `${name}: playing on repaints nothing at once`);
    assert.equal(after.drops, before.drops, `${name}: no stretch painted ahead is thrown away`);
    assert.ok(after.swaps - before.swaps >= 2, `${name}: stretches painted ahead are swapped in (${after.swaps - before.swaps})`);
    const swaps = after.swaps - before.swaps;

    // What that painted ahead and swapped in is the music: the same picture as painting it afresh
    // (but for the paper's grain and edges' smoothing, which fall a touch differently).
    await settle();
    const stepped = await page.screenshot();
    await page.evaluate(() => window.rollCheck.repaint());
    await settle();
    const fresh = await page.screenshot();
    const [a, b] = await Promise.all([stepped, fresh].map((png) => sharp(png).ensureAlpha().raw().toBuffer()));
    let off = 0;
    let lit = 0;
    for (let i = 0; i < a.length; i += 4) {
      if (Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])) > 40) off++;
      if (a[i] + a[i + 1] + a[i + 2] > 300) lit++;
    }
    assert.ok(off / (a.length / 4) < 0.001, `${name}: painted ahead equals painted afresh (${off} pixels differ)`);
    assert.ok(lit / (a.length / 4) > 0.01, `${name}: the roll shows notes`);

    // The same at a few frames a second (half a beat further every frame): the painting ahead keeps pace.
    before = await info();
    await page.evaluate(() => window.rollCheck.step(20, 40, 0.5));
    after = await info();
    assert.equal(after.rebuilds, before.rebuilds, `${name}: at a low frame rate, still nothing repainted at once`);
    assert.ok(after.swaps > before.swaps, `${name}: at a low frame rate, stretches are still swapped in`);

    // Play and Pause apply the whole playback state: the same key, loop and mix repaint nothing.
    await settle();
    before = await info();
    await page.evaluate(() => window.rollCheck.toggle());
    await page.waitForFunction(() => window.rollCheck.playing());
    await page.waitForTimeout(400);
    await page.evaluate(() => window.rollCheck.toggle());
    await page.waitForFunction(() => !window.rollCheck.playing());
    await page.evaluate(() => window.rollCheck.sameMix());
    await settle();
    after = await info();
    assert.equal(after.rebuilds, before.rebuilds, `${name}: Play, Pause and the same mix repaint nothing`);

    // A voice switched is a real change: one repaint, of what is in view first.
    await page.evaluate(() => window.rollCheck.only(1));
    await settle();
    assert.equal((await info()).rebuilds, after.rebuilds + 1, `${name}: a voice switched repaints once`);
    await page.screenshot({ path: path.join(out, `${name.replace(/\W+/g, '-')}.png`) });
    assert.deepEqual(errors, [], `${name}: page errors`);
    results.push(`${name}: 60 beats with ${swaps} swaps and no repaint; Play/Pause repaint nothing; a voice switched repaints once`);
    await context.close();
  }
  await fs.writeFile(path.join(out, 'results.json'), JSON.stringify(results, null, 1));
  console.log(results.join('\n'));
  console.log('roll buffers: ok');
} finally {
  await browser.close();
  await server.close();
}
