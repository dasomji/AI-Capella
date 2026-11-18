/** AICAP-28: browser-computed button states and effective touch targets on real screens.
 * API fixtures never write product data. RESPONSIVE_BASELINE=1 records failures before fixes.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import {chromium} from 'playwright';
import {auditTouchTargets} from './touch-target-audit.mjs';
const evidence=path.resolve(process.env.BROWSER_EVIDENCE??'.review-evidence/responsive');
await fs.mkdir(evidence,{recursive:true});
const baseline=process.env.RESPONSIVE_BASELINE==='1', records=[], failures=[];
const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const xml='<score-partwise version="4.0"><part-list><score-part id="S"><part-name>Soprano</part-name></score-part></part-list><part id="S"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note></measure></part></score-partwise>';
const hooks=`\nwindow.qa={export:()=>openExportSheet(document.querySelector('#lib-menu-btn')),account:()=>openAccountArea(document.querySelector('#lib-menu-btn')),controls:()=>openControlsSheet(document.querySelector('[data-action=open-controls]')),mixer:()=>openMixerSheet(document.querySelector('[data-action=open-mixer]')),library:()=>{libraryState='ready';currentEnsemble='fixture';renderLibraryHead();renderSongList();setViewMode('library');},landing:()=>{setViewMode('landing');renderLanding();},player:async()=>{sessionMode='solo';await loadSongLocally({id:'qa-piece',title:'Evening song',xml:window.qaXML,format:'musicxml',imported:true});setViewMode('player');setActiveView('roll');renderNow();}};`;
const server=await createServer({root:process.cwd(),configFile:false,cacheDir:path.join(evidence,'vite-cache'),resolve:{dedupe:['react','react-dom']},optimizeDeps:{include:['react','react-dom','react-dom/client','react/jsx-runtime','react/jsx-dev-runtime','fflate','socket.io-client','verovio/esm','verovio/wasm','zod','jspdf','svg2pdf.js']},plugins:[react(),tailwind(),{name:'responsive-fixture',configureServer(s){s.middlewares.use((req,res,next)=>{if(!req.url.startsWith('/qa.html'))return next();res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/design-system/app.css"></head><body><div id="app"></div></body></html>');});},resolveId(id){if(id==='/qa-auth.tsx')return '\0qa-auth';},load(id){if(id==='\0qa-auth')return `import React from 'react';import {createRoot} from 'react-dom/client';import {AuthPage} from '/src/auth-ui.tsx';export function mountAuth(){createRoot(document.getElementById('app')).render(React.createElement(AuthPage));}`;},transform(code,id){if(id.endsWith('/src/main.ts'))return code+hooks;}}],server:{host:'127.0.0.1',port:0,hmr:false,watch:null}});
let browser;
try {
 await server.listen(); const base=server.resolvedUrls.local[0];
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-accelerated-2d-canvas']});
 // Fine-pointer Chromium plus CDP forced states proves hover styles even without pointer movement.
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 await page.goto(base+'qa.html');
 await page.evaluate(async()=>{
  const {createButton}=await import('/src/design-system/dom/index.ts');
  document.body.replaceChildren();
  for(const variant of ['standard','landing-create','library-action','scan-mark-go','scan-mark-ok'])for(const intent of ['primary','secondary','quiet','danger']){
   const el=createButton({variant,intent,text:variant+' '+intent});el.id=variant+'-'+intent;document.body.append(el);
  }
 });
 const cdp=await page.context().newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');
 for(const theme of ['night-paper','parchment','velvet']){
  await page.evaluate(async theme=>(await import('/src/design-system/theme/index.ts')).setThemePreference(theme),theme);
  for(const id of await page.locator('button').evaluateAll(els=>els.map(e=>e.id)))for(const state of [[],['hover'],['active'],['focus'],['focus','focus-visible'],['hover','active'],['hover','focus','focus-visible']]){
   const {root}=await cdp.send('DOM.getDocument');const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'#'+id});await cdp.send('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:state});
   const paint=await page.locator('#'+id).evaluate(el=>{
    const rgba=v=>{const c=document.createElement('canvas').getContext('2d');c.fillStyle=v;c.fillRect(0,0,1,1);return [...c.getImageData(0,0,1,1).data].map((v,i)=>i===3?v/255:v);};
    const over=(a,b)=>a.slice(0,3).map((c,i)=>c*a[3]+b[i]*(1-a[3])).concat(1);
    let bg=[255,255,255,1];const chain=[];for(let p=el;p;p=p.parentElement)chain.unshift(p);for(const p of chain)bg=over(rgba(getComputedStyle(p).backgroundColor),bg);
    const fg=over(rgba(getComputedStyle(el).color),bg),lum=c=>c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
    const a=lum(fg),b=lum(bg);return {color:getComputedStyle(el).color,background:getComputedStyle(el).backgroundColor,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
   });
   const record={kind:'contrast',theme,id,state,...paint};records.push(record);if(paint.ratio<4.5)failures.push(record);
   await cdp.send('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:[]});
  }
  // Capture the actual forced-hover paint, including the Parchment regression.
  const {root}=await cdp.send('DOM.getDocument');const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'#standard-primary'});await cdp.send('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:['hover']});
  await page.screenshot({path:`${evidence}/${theme}-button-hover.png`});await cdp.send('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:[]});
 }
 await page.close();
 for(const theme of ['night-paper','parchment','velvet'])for(const lang of ['en','de'])for(const [width,height,hasTouch] of [[1440,900,false],[900,1024,false],[768,1024,true],[390,844,true],[844,390,true],[1440,900,true]]){
  if(process.env.RESPONSIVE_CASE&&process.env.RESPONSIVE_CASE!==`${theme}-${lang}-${width}-${hasTouch}`)continue;
  const context=await browser.newContext({viewport:{width,height},hasTouch,reducedMotion:'reduce'}),page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.routeWebSocket('**',ws=>ws.close());
  await page.addInitScript(lang=>{localStorage.setItem('ai-capella-lang',lang);localStorage.setItem('ai-capella-intro-off','1');window.requestIdleCallback=()=>1;},lang);
  await page.route('**/api/**',route=>{
   const p=new URL(route.request().url()).pathname;let data={};
   if(p==='/api/me')data={user:{id:'lead',name:'Test lead',email:'admin@test.com',sysadmin:true}};
   else if(p==='/api/ensembles')data=['fixture','other'].map((id,i)=>({id,name:i?'Another ensemble':'Testchor',kind:'choir',isLead:true,membershipId:'membership',capabilities:{manageMembers:true,editPieces:true,transcribe:true}}));
   else if(p==='/api/transcription/config')data={pdf:50e6,photo:20e6,pages:20};
   else if(p.endsWith('/transcriptions'))data=[{id:'fixture-job',state:'failed',stage:'failed',options:{title:'Evening song'},pages:[]}];
   else if(p.endsWith('/members'))data=[{id:'member',userId:'member',name:'Test singer',email:'user@test.com',isLead:false,capabilities:{}}];
   else if(p.endsWith('/pieces')||p.endsWith('/invitations')||p==='/api/auth/list-sessions')data=[];
   return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto(base+'qa.html');await page.evaluate(async({theme,xml})=>{window.qaXML=xml;(await import('/src/design-system/theme/index.ts')).setThemePreference(theme);await(await import('/src/ensembles.ts')).initializeEnsembles();await import('/src/main.ts');},{theme,xml});
  async function audit(screen){
   await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(180);
   const touch=await page.evaluate(()=>matchMedia('(max-width:900px), (pointer:coarse)').matches);
   const targets=touch?await page.evaluate(auditTouchTargets):{targets:[],failures:[]};
   const geometry=await page.evaluate(()=>({switches:[...document.querySelectorAll('dialog[open] .ds-player-switch')].map(el=>({label:el.getAttribute('aria-label'),width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})),canvases:[...document.querySelectorAll('#app canvas')].filter(el=>el.checkVisibility()).map(el=>({id:el.id,width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height}))}));
   if(touch)assert.ok(targets.targets.length,screen+' enumerates actual controls');
   if(screen==='controls')assert.equal(geometry.switches.length,2,'Both rehearsal preferences are audited');
   if(screen==='controls')for(const track of geometry.switches){assert.equal(track.width,52,'Specialized switch track width preserved');assert.equal(track.height,32,'Specialized switch track height preserved');}
   const record={geometry,kind:'touch',screen,theme,lang,width,height,hasTouch,...targets,errors};records.push(record);failures.push(...targets.failures.map(f=>({...record,targets:undefined,failures:undefined,target:f})));
   if([1440,768,390,844].includes(width)&&lang==='en'&&!(width===1440&&hasTouch))await page.screenshot({path:`${evidence}/${theme}-${lang}-${width}x${height}-${screen}.png`});
  }
  await page.evaluate(()=>qa.landing());await audit('title');
  await page.evaluate(()=>qa.library());await page.locator('.tx-job').waitFor();await audit('library');
  await page.locator('.tx-job summary').click();await audit('job-menu');await page.locator('.tx-job summary').click();
  await page.evaluate(async()=>{await(await import('/src/ensemble-ui.ts')).membersSheet('fixture');});await audit('members');await page.keyboard.press('Escape');
  await page.evaluate(()=>qa.player());await audit('player');
  await page.locator('[data-action=open-tempo]').evaluate(el=>el.click());await audit('tempo');await page.keyboard.press('Escape');
  await page.evaluate(()=>qa.mixer());await audit('mixer');await page.keyboard.press('Escape');
  await page.evaluate(()=>qa.controls());await audit('controls');
  if(width<=900||hasTouch){
   const metro=page.locator('dialog[open] [data-action=metronome]');
   await metro.evaluate(el=>el.scrollIntoView({block:'center'}));
   const box=await metro.boundingBox(),before=await metro.getAttribute('aria-checked');
   if(!baseline){
    const mutation=await metro.evaluate(el=>{const saved=el.className;el.className=saved.split(' ').filter(c=>!c.startsWith('tw:touch:before:')).join(' ');return saved;});
    const missingExtension=await page.evaluate(auditTouchTargets);
    const metroLabel=await metro.getAttribute('aria-label');
    assert.ok(missingExtension.failures.some(f=>f.label===metroLabel),'Audit rejects a removed music-control hit extension');
    await metro.evaluate((el,saved)=>el.className=saved,mutation);
    for(const [i,y] of [box.y-4,box.y+box.height+4].entries()){if(hasTouch)await page.touchscreen.tap(box.x+box.width/2,y);else await page.mouse.click(box.x+box.width/2,y);assert.equal(await metro.getAttribute('aria-checked'),i===0?String(before!=='true'):before,'Extended edge toggles the preference');}
    assert.equal(await metro.getAttribute('aria-checked'),before,'Both outer hit-area edges toggle the rehearsal preference');
    if(lang==='en'&&[768,390,844].includes(width))await page.screenshot({path:`${evidence}/${theme}-${lang}-${width}x${height}-controls-hit-area.png`});
   }
  }
  await page.keyboard.press('Escape');
  await page.evaluate(()=>qa.export());await audit('export');await page.locator('dialog[open] summary').click();await audit('export-voices');await page.keyboard.press('Escape');
  await page.evaluate(async()=>{await(await import('/src/design-system/theme/index.ts')).setAppearanceRehearsing(false);qa.library();document.querySelector('#lib-menu-btn').click();});await page.locator('dialog[open]').waitFor();await audit('main-menu');await page.keyboard.press('Escape');
  await page.locator('#transcription-entry').click();await audit('upload');await page.keyboard.press('Escape');
  await page.evaluate(()=>qa.account());await audit('account');await page.keyboard.press('Escape');
  await page.goto(base+'qa.html');await page.evaluate(async theme=>{(await import('/src/design-system/theme/index.ts')).setThemePreference(theme);await(await import('/qa-auth.tsx')).mountAuth();},theme);await page.locator('form').waitFor();await audit('signin');
  if(width===1440&&!hasTouch){await page.locator('button[type=submit]').hover();await page.screenshot({path:`${evidence}/${theme}-${lang}-signin-hover.png`});}
  console.log('TOUCH',theme,lang,width,height,hasTouch);
  assert.deepEqual(errors,[]);await context.close();
 }
} finally {
 await fs.writeFile(path.join(evidence,'responsive.json'),JSON.stringify({revision,baseline,records,failures},null,2));
 await browser?.close();await server.close();
}
console.log('RESPONSIVE',records.length,'records;',failures.length,'failures');
if(!baseline)assert.deepEqual(failures,[]);
