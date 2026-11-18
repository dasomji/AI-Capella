/** Real player, stubbed API: Together legacy opening, optional writes and focused shortcuts. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {ownerFixture} from './owner-decisions-fixture.mjs';

const out = path.resolve(process.env.BROWSER_EVIDENCE ?? '.review-evidence/player-regressions');
await fs.mkdir(out, {recursive:true});
const hooks = `
window.playerRegression = {
  openLegacy: async () => {
    sessionMode = 'ensemble';
    await loadSongLocally({id:'legacy-piece',title:'Legacy Together piece',xml:window.ownerXML[16],format:'musicxml',imported:true});
    setViewMode('player');
  },
  state: () => ({id:loadedSongId,mode:sessionMode,voices:currentScore?.parts.length,beat:engineBeat(),loop:loopEnabled,metronome:metronomeOn,follow:followPref,playing:audioEngine?.isPlaying()}),
  titles: () => renderChipTitles(),
  export: () => openExportSheet(document.querySelector('[data-action=play]')),
  removeVoice: () => { currentScore.parts.splice(0,1); buildVoiceControls(currentScore); },
};`;
const {server,base} = await ownerFixture(out,hooks);
const browser = await chromium.launch({headless:true,args:['--no-sandbox','--disable-accelerated-2d-canvas']});
const errors = [], results = [];
async function pageFor(language='en') {
  const page = await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  page.setDefaultTimeout(10000);
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(language=>{
    localStorage.setItem('ai-capella-lang',language);
    window.regressionConflicts=0;
    window.addEventListener('piece:conflict',()=>window.regressionConflicts++);
  },language);
  await page.routeWebSocket('**',ws=>ws.close());
  await page.goto(base+'owner.html');
  await page.waitForFunction(()=>window.ownerReady);
  return page;
}
try {
  // Both editors traverse the shared local-open path in Together mode. Hold the
  // requests until both songs are open, proving persistence adds no round trip.
  for (const concurrentStatus of [200,409]) {
    const pages = await Promise.all([pageFor(),pageFor()]), pending = [];
    const writes = [];
    for (const page of pages) await page.route('**/api/ensembles/fixture/pieces/legacy-piece',route=>{
      assert.equal(route.request().method(),'PATCH');
      writes.push(route.request().postDataJSON());
      pending.push(route);
    });
    let timeout;
    try {
      await Promise.race([Promise.all(pages.map(page=>page.evaluate(()=>playerRegression.openLegacy()))),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Song opening waited for optional voice-number persistence')),10000);})]);
    } finally {clearTimeout(timeout);}
    for (const page of pages) {
      assert.deepEqual(await page.evaluate(()=>({id:playerRegression.state().id,mode:playerRegression.state().mode,voices:playerRegression.state().voices})),{id:'legacy-piece',mode:'ensemble',voices:16});
      assert.equal(await page.locator('[data-voice-key] button').count(),16);
    }
    assert.equal(pending.length,2);
    assert.deepEqual(writes[0],writes[1]);
    assert.equal(writes[0].expectedRevision,undefined);
    for (const [i,route] of pending.entries()) await route.fulfill({status:i===0?200:concurrentStatus,contentType:'application/json',body:JSON.stringify({id:'legacy-piece',revision:2,settings:{formatDefaults:{voiceNumbers:writes[0].value}}})});
    for (const page of pages) {
      await page.waitForTimeout(100);
      assert.equal(await page.evaluate(()=>regressionConflicts),0);
      assert.equal((await page.evaluate(()=>playerRegression.state())).id,'legacy-piece');
      await page.close();
    }
    results.push(`Two Together editors open before concurrent ${concurrentStatus} writes complete; no conflict`);
  }
  for (const failure of ['network',503]) {
    const page = await pageFor();
    let writes = 0;
    await page.route('**/api/ensembles/fixture/pieces/legacy-piece',route=>{
      writes++;
      return failure==='network'?route.abort('failed'):route.fulfill({status:failure,contentType:'application/json',body:'{"code":"service_unavailable"}'});
    });
    await page.evaluate(()=>playerRegression.openLegacy());
    await page.waitForFunction(()=>document.querySelectorAll('[data-voice-key] button').length===16);
    assert.equal((await page.evaluate(()=>playerRegression.state())).id,'legacy-piece');
    await page.evaluate(()=>playerRegression.openLegacy());
    assert.equal(writes,2,'a later opening retries the optional write');
    assert.equal(await page.evaluate(()=>regressionConflicts),0);
    await page.close();results.push(`${failure} optional write does not abort song opening; next open retries`);
  }
  for (const language of ['en','de']) {
    const page = await pageFor(language);
    await page.evaluate(()=>owner.player(16));
    await page.evaluate(()=>playerRegression.titles());
    const titles = await page.locator('.chip[data-part="P9"]').evaluateAll(nodes=>nodes.map(node=>node.title));
    assert.ok(titles.length>=2,'both player chip and numbered key have tooltips');
    for (const title of titles) assert.match(title,language==='en'?/^Only 9 · Soprano III /:/^Nur 9 · Soprano III /);
    await page.screenshot({path:path.join(out,`tooltips-${language}.png`)});
    await page.close();results.push(`${language} chip/key titles separate voice number and complete name`);
  }
  const page = await pageFor();
  await page.evaluate(()=>owner.player(16));
  // Click a real Play control and pause again, retaining native button focus.
  const play = page.locator('[data-action=play]:visible').first();
  await play.click();await page.waitForFunction(()=>playerRegression.state().playing);
  await play.click();await page.waitForFunction(()=>!playerRegression.state().playing);
  await page.evaluate(()=>{const link=document.createElement('a');link.id='keyboard-link';link.href='#keyboard-link';link.textContent='Keyboard fixture link';document.querySelector('#app').append(link);});
  for (const control of [play,page.locator('#voice-list [data-mix=muted]').first(),page.locator('#keyboard-link')]) {
    await control.click();
    // Keep transport paused while checking deterministic bar stepping.
    if ((await page.evaluate(()=>playerRegression.state())).playing) await control.click();
    await control.focus();
    const before = await page.evaluate(()=>playerRegression.state());
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(beat=>playerRegression.state().beat>beat,before.beat);
    const advanced = (await page.evaluate(()=>playerRegression.state())).beat;
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(beat=>playerRegression.state().beat<beat,advanced);
    for (const [key,property] of [['l','loop'],['m','metronome'],['f','follow']]) {
      const value = (await page.evaluate(()=>playerRegression.state()))[property];
      await page.keyboard.press(key);
      await page.waitForFunction(({property,value})=>playerRegression.state()[property]!==value,{property,value});
    }
  }
  const link = page.locator('#keyboard-link');
  await link.focus();
  await page.keyboard.press('Space');await page.keyboard.press('Enter');
  assert.equal((await page.evaluate(()=>playerRegression.state())).playing,false,'link activation does not play');
  const mute = page.locator('#voice-list [data-mix=muted]').first();
  await mute.focus();
  const muted = await mute.getAttribute('aria-pressed');
  await page.keyboard.press('Space');assert.notEqual(await mute.getAttribute('aria-pressed'),muted);
  await page.keyboard.press('Enter');assert.equal(await mute.getAttribute('aria-pressed'),muted);
  const voice = page.locator('[data-voice-key] button').last();
  await voice.focus();await page.keyboard.press('Space');assert.equal(await voice.getAttribute('aria-pressed'),'true');
  await page.keyboard.press('Space');assert.equal(await voice.getAttribute('aria-pressed'),'false');
  await page.evaluate(()=>{const range=document.createElement('input');range.id='keyboard-range';range.type='range';range.value='50';document.querySelector('#app').append(range);});
  const range = page.locator('#keyboard-range');
  await range.focus();
  const rangeBeat = (await page.evaluate(()=>playerRegression.state())).beat;
  await page.keyboard.press('ArrowRight');
  assert.equal(await range.inputValue(),'51','native range arrow remains available');
  assert.equal((await page.evaluate(()=>playerRegression.state())).beat,rangeBeat);
  // Removed voice shifts array indices; export dots must keep the same identity.
  await page.evaluate(()=>playerRegression.removeVoice());
  const voiceColor = await page.locator('#voice-list [data-part="P9"]').first().evaluate(node=>node.style.getPropertyValue('--c'));
  await page.evaluate(()=>playerRegression.export());
  assert.equal(await page.locator('.ds-panel-export-row[data-part="P9"]').evaluate(node=>node.style.getPropertyValue('--c')),voiceColor);
  await page.keyboard.press('Escape');
  await page.screenshot({path:path.join(out,'focused-player.png')});
  await page.close();results.push('ArrowLeft/Right and L/M/F after Play/Mute clicks; native Space/Enter and voice solo; export color after removal');
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(out,'results.json'),JSON.stringify({results,errors},null,2));
  console.log('PLAYER_REGRESSIONS_PASS',results);
} finally {await browser.close();await server.close();}
