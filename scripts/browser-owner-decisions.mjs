import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import {ownerFixture} from './owner-decisions-fixture.mjs';
const out=path.resolve(process.env.BROWSER_EVIDENCE||'/tmp/aicap-design/impl/d42-d47');
await fs.mkdir(out,{recursive:true});await fs.mkdir(path.join(out,'d43-comparison'),{recursive:true});
const {server,base}=await ownerFixture(out),browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-accelerated-2d-canvas']});
const results=[],errors=[],baseline=process.env.OWNER_BASELINE==='1';
try {
 for(const theme of ['night-paper','parchment'])for(const [width,height]of [[1440,900],[768,1024],[390,844]]){
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:2,reducedMotion:'reduce'});
  page.on('pageerror',e=>errors.push(e.message));await page.routeWebSocket('**',ws=>ws.close());
  await page.goto(base+'owner.html?design='+(theme==='parchment'?'pergament':'papier'));await page.waitForFunction(()=>window.ownerReady);
  await page.evaluate(()=>document.fonts.ready);await page.waitForFunction(()=>[...document.querySelectorAll('.song-card .song-meta')].every(e=>e.textContent.trim()));
  await page.mouse.move(0,0);
  const prefix=`${theme}-${width}x${height}-${baseline?'before':'after'}`;
  const shot=async name=>{await page.screenshot({path:path.join(out,`${prefix}-${name}.webp`),type:'webp'});};
  const cards=await page.locator('.song-card').evaluateAll(els=>els.map(e=>{const card=e.getBoundingClientRect(),meta=e.querySelector('.song-meta').getBoundingClientRect(),title=e.querySelector('.song-title');return {top:card.top,height:card.height,baseline:meta.bottom,title:title.textContent,clamp:getComputedStyle(title).webkitLineClamp};}));
  for(const card of cards)assert.equal(card.clamp,'none','full title is retained');
  let mismatch=false;
  for(const row of cards){const peers=cards.filter(c=>Math.abs(c.top-row.top)<1);if(peers.length>1){const aligned=peers.every(c=>Math.abs(c.baseline-row.baseline)<1&&Math.abs(c.height-row.height)<1);mismatch ||= !aligned;if(!baseline)assert.ok(aligned,JSON.stringify(peers));}}
  if(width===768&&!baseline)assert.ok(await page.locator('.song-card').first().evaluate(e=>Math.abs(e.getBoundingClientRect().width-280)<1),'D23 keeps the tablet card width');
  results.push({theme,width,height,cards,mismatch});await shot('library');
  await page.locator('#lib-menu-btn').click();await page.getByRole('dialog',{name:baseline?'Language':'Settings',exact:true}).waitFor();await shot('settings');await page.keyboard.press('Escape');
  // Live re-theme is checked in renderer-themes, where the rehearsal appearance hold is bypassed explicitly.
  await page.evaluate(()=>window.owner.player(16));if(!baseline)await page.locator('[data-voice-key] button').last().waitFor();
  if(!baseline)assert.equal(await page.locator('[data-voice-key] button').count(),16);
  if(!baseline)assert.equal(await page.locator('#voice-list [data-voice-number]').count(),16);
  if(!baseline)assert.match(await page.locator('[data-voice-key]').innerText(),/16/);
  await shot('16-roll');await page.evaluate(()=>window.owner.staff());await shot('16-staff');
  await page.evaluate(()=>window.owner.mixer());await page.locator('dialog[open]').waitFor();
  if(!baseline)assert.equal(await page.locator('dialog [data-voice-number]').count(),16);await shot('16-mixer');await page.keyboard.press('Escape');
  // Deliberate unison/short-note case: every ID stays keyboard-inspectable in the separate key.
  await page.evaluate(async()=>{const doc=new DOMParser().parseFromString(window.ownerXML[16],'text/xml');for(const p of doc.querySelectorAll('pitch'))p.innerHTML='<step>C</step><octave>4</octave>';for(const d of doc.querySelectorAll('note > duration'))d.textContent=String(Number(d.textContent)/16);window.ownerXML[16]=new XMLSerializer().serializeToString(doc);await window.owner.player(16);});
  if(!baseline)assert.equal(await page.locator('[data-voice-key] button').count(),16);
  await shot('16-unison-short');
  if(!baseline){
  const button=page.locator('[data-voice-key] button').last();await button.focus();await page.keyboard.press('Space');
  assert.equal(await button.getAttribute('aria-pressed'),'true');await page.keyboard.press('Space');
  }
  if(theme==='parchment'&&width!==768&&!baseline){
   for(const variant of ['current','proposed']){
    await page.evaluate(async variant=>{const api=await import('/src/design-system/theme/index.ts');api.setAppearanceRehearsing(false);document.documentElement.style.setProperty('--ds-voice-4',variant==='current'?'#5A8A2A':'#527E26');api.notifyThemeMaterialChange();await window.owner.player(8);window.owner.roll();},variant);
    for(const mode of ['roll','staff','mixer']){
     if(mode==='staff')await page.evaluate(()=>window.owner.staff());
     if(mode==='mixer')await page.evaluate(()=>window.owner.mixer());
     await page.evaluate(()=>document.fonts.ready);
     await page.screenshot({path:path.join(out,'d43-comparison',`parchment-8-${mode}-${width}x${height}-${variant}.webp`),type:'webp'});
     if(mode==='mixer')await page.keyboard.press('Escape');
    }
   }
  }
  await page.close();
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(out,baseline?'baseline.json':'browser-results.json'),JSON.stringify({sha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),results,errors},null,2));
 console.log('D42/D45/D47: numbered 16-voice score/key/mixer, keyboard solo, full titles and row baselines PASS');
}finally{await browser.close();await server.close();}
