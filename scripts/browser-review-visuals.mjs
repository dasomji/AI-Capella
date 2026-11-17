/** Reproduce AICAP-28 review states through the real player, tour and appearance boundary. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import {chromium} from 'playwright';
const out=process.env.BROWSER_EVIDENCE;
const baseline=process.env.REVIEW_BASELINE_REF;
await fs.mkdir(out,{recursive:true});
const root=process.cwd();
const hooks=`\nwindow.review={player:async()=>{currentEnsemble='fixture';sessionMode='ensemble';await loadSongLocally({id:'review-piece',title:'Abendmusik',xml:window.reviewXML,format:'musicxml',imported:true});currentEnsemble='fixture';renderModeControls();setViewMode('player');renderNow();},landing:()=>setViewMode('landing'),tour:()=>startIntro('player'),prompt:()=>libraryPrompt({title:t('removeAllSectionsTitle'),body:t('removeAllSectionsBody'),confirmLabel:t('removeAllSections'),danger:true})};`;
const xml='<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Soprano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note></measure></part></score-partwise>';
const server=await createServer({root,configFile:false,cacheDir:path.join(out,'vite-cache'),resolve:{dedupe:['react','react-dom']},optimizeDeps:{include:['react','react-dom','react-dom/client','react/jsx-runtime','react/jsx-dev-runtime','@tanstack/react-router','@tanstack/react-table','fflate','socket.io-client','verovio/esm','verovio/wasm','zod','jspdf','svg2pdf.js']},plugins:[
 {name:'review-baseline',enforce:'pre',transform(code,id){
  const file=id.split('?')[0];
  if(baseline&&file.startsWith(root+'/src/')&&!id.includes('?url')) {const source=execFileSync('git',['show',`${baseline}:${path.relative(root,file)}`],{encoding:'utf8'});return id.includes('?raw')?'export default '+JSON.stringify(source):source;}
 }},react(),tailwind(),{name:'review-fixture',configureServer(server){server.middlewares.use((req,res,next)=>{if(!req.url.startsWith('/review.html'))return next();res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><link rel="stylesheet" href="/src/design-system/app.css"></head><body><div id="app"></div></body></html>');});},transform(code,id){if(id.endsWith('/src/main.ts'))return code+hooks;}}
 ],server:{host:'127.0.0.1',port:0,hmr:false,watch:null}});
let browser;const records=[];
try {
 await server.listen();const base=server.resolvedUrls.local[0];
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 for(const theme of ['night-paper','parchment','velvet'])for(const [width,height]of [[1440,900],[768,1024],[390,844],[360,800],[844,390]]) {
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
  const page=await context.newPage();
  await page.routeWebSocket('**',ws=>ws.close());
  await page.route('**/api/**',route=>{
   const p=new URL(route.request().url()).pathname;
   const data=p==='/api/me'?{user:{id:'lead',name:'Test lead',email:'admin@test.com',sysadmin:true}}:p==='/api/ensembles'?[{id:'fixture',name:'Testchor',kind:'choir',isLead:true,membershipId:'lead-membership',capabilities:{manageMembers:true,editPieces:true,transcribe:true}}]:p.endsWith('/members')?[]:p==='/api/transcription/config'?{pdf:50e6,photo:20e6,pages:20}:[];
   return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await context.addInitScript(()=>{localStorage.setItem('ai-capella-lang','de');localStorage.setItem('ai-capella-intro-off','1');});
  await page.goto(`${base}review.html?design=${theme}`);
  await page.evaluate(async xml=>{window.reviewXML=xml;await(await import('/src/ensembles.ts')).initializeEnsembles();await import('/src/main.ts');},xml);
  const shot=async state=>{await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(350);const file=`${theme}-${width}x${height}-${state}.png`;await page.screenshot({path:path.join(out,file),animations:'disabled'});records.push({theme,width,height,state,file});};
  if(theme==='velvet') {
   const start=await page.locator('html').getAttribute('data-start');
   if(!baseline)assert.equal(start,null,'Velvet retains its earlier title');
   await shot('title');await context.close();continue;
  }
  await page.evaluate(()=>review.player());
  await page.evaluate(async()=>{window.B=await import('/src/design-system/behavior/index.ts');});
  await page.evaluate(()=>B.toast('Die Änderungen konnten nicht gespeichert werden. Bitte überprüfe deine Verbindung und versuche es erneut.','error',{action:{label:'Erneut versuchen',onSelect(){}}}));
  await shot('action-toast');
  await page.evaluate(()=>{do{B.dismissToast()}while(B.getToast());});
  // The real tour filters targets by viewport: advance until the shared-playback step is active.
  await page.evaluate(()=>review.tour());
  await page.waitForFunction(()=>document.querySelector('#intro-title')?.textContent);
  for(let n=0;n<12;n++) {
   if(await page.locator('#intro-title').textContent()==='Gemeinsam steuern')break;
   await page.keyboard.press('ArrowRight');
   await page.waitForTimeout(200); // Wait for the production tour's 170ms copy swap.
  }
  assert.equal(await page.locator('#intro-title').textContent(),'Gemeinsam steuern');
  if(!baseline)assert.match(await page.locator('.intro').innerText(),/Lautstärke, Stummschaltung und Solo bleiben persönlich/);
  await shot('tour-shared-playback');
  await page.keyboard.press('Escape');
  // Queued appearance must apply on the same landing boundary used by membership loss.
  const target=theme==='night-paper'?'parchment':'night-paper';
  await page.evaluate(async target=>(await import('/src/design-system/theme/index.ts')).setThemePreference(target),target);
  assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
  await page.evaluate(()=>review.landing());
  if(!baseline)assert.equal(await page.locator('html').getAttribute('data-theme'),target);
  await context.close();
  console.log('Review visuals',baseline??'current',theme,width,height,'PASS');
 }
 await fs.writeFile(path.join(out,'states.json'),JSON.stringify(records,null,2));
} finally {await browser?.close();await server.close();}
