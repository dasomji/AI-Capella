/** AICAP-28 foundation evidence and repertoire-boundary regression. Read-only API fixtures. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { chromium } from 'playwright';
const root=await fs.realpath(path.resolve(process.env.FOUNDATION_FIXTURE_ROOT??process.cwd()));
const baseline=!!process.env.FOUNDATION_FIXTURE_ROOT;
const evidence=path.resolve(process.env.BROWSER_EVIDENCE??'.review-evidence/foundation');
await fs.mkdir(evidence,{recursive:true});
const xml='<score-partwise version="4.0"><part-list>'+Array.from({length:4},(_,i)=>`<score-part id="P${i}"><part-name>${['Soprano','Alto','Tenor','Bass'][i]}</part-name></score-part>`).join('')+'</part-list>'+Array.from({length:4},(_,i)=>`<part id="P${i}"><measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><direction><direction-type><words>Andante</words></direction-type></direction><note><pitch><step>${['C','E','G','C'][i]}</step><octave>${i===3?3:4}</octave></pitch><duration>4</duration><type>whole</type><lyric><text>Abend</text></lyric></note></measure></part>`).join('')+'</score-partwise>';
const mainHooks=`\nwindow.foundation={library:()=>{importedSongs=[{id:'foundation-piece',title:'Abendmusik',xml:window.foundationXML,format:'musicxml',imported:true}];libraryState='ready';currentEnsemble='fixture';renderLibraryHead();renderSongList();setViewMode('library');},player:async()=>{sessionMode='solo';await loadSongLocally({id:'foundation-piece',title:'Abendmusik',xml:window.foundationXML,format:'musicxml',imported:true});setViewMode('player');setActiveView('roll');renderNow();},staff:()=>{setActiveView('staff');renderNow();},controls:()=>openControlsSheet(document.querySelector('.info-row')),account:()=>openAccountArea(document.querySelector('#lib-menu-btn')),landing:()=>{setViewMode('landing');renderLanding();}};`;
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {AuthPage} from '/src/auth-ui.tsx';import {initializeTheme} from '/src/design-system/theme/index.ts';initializeTheme();let r;window.auth=()=>{r=createRoot(document.getElementById('root'));r.render(React.createElement(AuthPage));};window.unmountAuth=()=>r.unmount();`;
const server=await createServer({root,configFile:false,cacheDir:path.join(evidence,'vite-cache'),resolve:{dedupe:['react','react-dom']},optimizeDeps:{include:['react','react-dom','react-dom/client','react/jsx-runtime','react/jsx-dev-runtime','@tanstack/react-router','@tanstack/react-table','fflate','socket.io-client','verovio/esm','verovio/wasm','zod','jspdf','svg2pdf.js']},plugins:[react(),tailwind(),{name:'foundation-fixture',configureServer(server){server.middlewares.use((req,res,next)=>{if(!req.url.startsWith('/foundation.html'))return next();res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><link rel="stylesheet" href="/src/design-system/app.css"></head><body><div id="root"></div></body></html>');});},resolveId(id){if(id==='/foundation-entry.tsx')return '\0foundation-entry';},load(id){if(id==='\0foundation-entry')return entry;},transform(code,id){if(id.endsWith('/src/main.ts'))return code+mainHooks;}}],server:{host:'127.0.0.1',port:0,hmr:false,watch:null,fs:{allow:[root,process.cwd()]}}});
let browser;const results=[];
try {
 await server.listen();const base=server.resolvedUrls.local[0];browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-accelerated-2d-canvas']});
 for(const theme of ['night-paper','parchment','velvet'])for(const [width,height] of [[1440,900],[768,1024],[390,844]]) {
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce',colorScheme:'dark'});const page=await context.newPage();const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Page error:',e.message);});
  await page.routeWebSocket('**',ws=>ws.close());
  await page.route('**/api/**',route=>{const url=new URL(route.request().url());let data={};if(url.pathname.includes('/api/auth/sign-in'))return route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({code:'INVALID_EMAIL_OR_PASSWORD'})});if(url.pathname==='/api/me')data={user:{id:'lead',name:'Test lead',email:'admin@test.com',sysadmin:true}};else if(url.pathname==='/api/ensembles')data=[{id:'fixture',name:'Testchor',kind:'choir',isLead:true,membershipId:'membership',capabilities:{manageMembers:true,editPieces:true,transcribe:true}}];else if(url.pathname.endsWith('/members'))data=[{id:'membership',userId:'lead',name:'Test lead',email:'admin@test.com',isLead:true,capabilities:{}},{id:'member',userId:'member',name:'Test singer',email:'user@test.com',isLead:false,capabilities:{}}];else if(url.pathname==='/api/auth/list-sessions'||url.pathname.endsWith('/invitations')||url.pathname.endsWith('/pieces')||url.pathname.endsWith('/transcriptions'))data=[];else if(url.pathname==='/api/transcription/config')data={pdf:50e6,photo:20e6,pages:20};return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});});
  await page.addInitScript(()=>{localStorage.setItem('ai-capella-lang','en');localStorage.setItem('ai-capella-intro-off','1');});
  await page.goto(base+`foundation.html?design=${theme}`);await page.evaluate(async()=>{await import('/foundation-entry.tsx');window.auth();});await page.locator('input[type=email]').waitFor().catch(async error=>{await page.screenshot({path:path.join(evidence,'failure.png')});console.error(await page.locator('body').innerText());throw error;});
  async function shot(state) {await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(220);const name=`${theme}-${width}x${height}-${state}.png`;await page.screenshot({path:path.join(evidence,name),animations:'disabled'});results.push({theme,width,height,state,file:name});}
  await page.locator('input[type=email]').fill('user@test.com');await page.locator('input[name=password]').fill('incorrect-password');await page.locator('button[type=submit]').click();await page.waitForTimeout(200);await shot('auth-error');
  await page.evaluate(async xml=>{window.unmountAuth();document.body.innerHTML='<div id="app"></div>';window.foundationXML=xml;await(await import('/src/ensembles.ts')).initializeEnsembles();await import('/src/main.ts');window.foundation.library();},xml);
  await shot('library');await page.evaluate(()=>foundation.landing());await shot('title');
  await page.evaluate(()=>foundation.library());await page.evaluate(()=>foundation.player());await shot('player-roll');
  if(!baseline) {
    const before=await page.evaluate(async()=>{const api=await import('/src/design-system/theme/index.ts');return {theme:api.readTheme().id,revision:api.getThemeRevision(),paper:(await import('/src/paper.ts')).paperKind()};});
    await page.evaluate(async()=>{const api=await import('/src/design-system/theme/index.ts');api.setThemePreference('parchment');api.setThemePreference('night-paper');(await import('/src/paper.ts')).setPaperKind('washi');});
    const held=await page.evaluate(async()=>{const api=await import('/src/design-system/theme/index.ts');return {theme:api.readTheme().id,revision:api.getThemeRevision(),paper:(await import('/src/paper.ts')).paperKind()};});
    assert.deepEqual(held,before,'D05 player must hold all appearance, even while stopped');
    await page.evaluate(()=>foundation.library());
    assert.equal(await page.evaluate(async()=>(await import('/src/design-system/theme/index.ts')).readTheme().id),'night-paper');
    // Restore this matrix case from the repertoire, then re-enter the score.
    await page.evaluate(async theme=>{(await import('/src/paper.ts')).setPaperKind('verge');(await import('/src/design-system/theme/index.ts')).setThemePreference(theme);},theme);
    await page.evaluate(()=>foundation.player());
  }
  if(width<=900)await page.evaluate(()=>foundation.controls());else await page.locator('[data-action=open-tempo]').first().click();await shot('controls');await page.keyboard.press('Escape');await page.waitForTimeout(400);
  await page.evaluate(()=>foundation.staff());await shot('player-staff');await page.evaluate(()=>foundation.library());
  await page.evaluate(async()=>{await(await import('/src/ensemble-ui.ts')).membersSheet('fixture');});await shot('members');await page.keyboard.press('Escape');await page.waitForTimeout(400);
  await page.evaluate(()=>document.querySelector('#transcription-entry').click());await shot('transcription');await page.keyboard.press('Escape');await page.waitForTimeout(400);
  await page.evaluate(()=>foundation.account());await shot('account');await page.keyboard.press('Escape');await page.waitForTimeout(400);
  await page.evaluate(async()=>{const ui=await import('/src/design-system/dom/index.ts');const button=ui.createButton({text:'Permanently delete',intent:'danger',onClick:()=>{}});button.id='foundation-danger';ui.createConfirmDialog({title:'Permanently delete this piece?',body:'This action cannot be undone.',destructive:true,actions:button}).open();});await shot('danger-confirm');
  const danger=await page.locator('#foundation-danger').evaluate(el=>{const style=getComputedStyle(el);const rgb=s=>s.match(/[\d.]+/g).slice(0,3).map(Number);const lum=s=>rgb(s).map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);const a=lum(style.color),b=lum(style.backgroundColor);return{foreground:style.color,background:style.backgroundColor,contrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};});results.push({theme,width,height,state:'danger-contrast',...danger});if(!baseline)assert.ok(danger.contrast>=4.5,`${theme} destructive button contrast ${danger.contrast}`);

  assert.deepEqual(errors,[],`${theme} ${width} page errors`);await context.close();
 }
 await fs.writeFile(path.join(evidence,'results.json'),JSON.stringify({baseline,root,results},null,2));console.log(`Foundation captures: ${results.length}; repertoire boundary ${baseline?'baseline (not asserted)':'passed'}.`);
} finally {await browser?.close();await server.close();}
