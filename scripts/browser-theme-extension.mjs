import fs from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { chromium } from 'playwright';
import { probeThemePaints } from './theme-paint-probe.mjs';
import { themeExtensionPlugin, testTheme } from '../tests/theme-extension-fixture.mjs';
const evidence=path.resolve(process.env.BROWSER_EVIDENCE??'.review-evidence/theme-extension');
await fs.mkdir(evidence,{recursive:true});
const fixture=await fs.readFile(new URL('./renderer-theme-fixture.js',import.meta.url),'utf8');
const xml='<score-partwise version="4.0"><part-list><score-part id="S"><part-name>Soprano</part-name></score-part></part-list><part id="S"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note></measure></part></score-partwise>';
const mainHooks=`\nwindow.proofMain={appearance:()=>appearanceItems(),library:()=>{libraryState='ready';currentEnsemble='fixture';renderLibraryHead();renderSongList();setViewMode('library');},player:async()=>{sessionMode='solo';await loadSongLocally({id:'test-piece',title:'Theme proof',xml:window.proofXML,format:'musicxml',imported:true});setViewMode('player');setActiveView('roll');renderNow();},account:()=>openAccountArea(document.querySelector('#lib-menu-btn')),landing:()=>{setViewMode('landing');renderLanding();}};`;
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {AuthPage} from '/src/auth-ui.tsx';import {AccountStage} from '/src/account-stage.tsx';import {Route} from '/src/routes/invite.$token.tsx';import {AdminPage} from '/src/admin-ui.tsx';import {DesignSystemShowcase} from '/src/design-system/showcase.tsx';import {setThemePreference} from '/src/design-system/theme/index.ts';import '/src/design-system/app.css';let root;Route.useParams=()=>({token:'test-fixture'});window.unmountProof=()=>root?.unmount();window.renderProofScreen=(name)=>{root?.unmount();root=createRoot(document.getElementById('root'));const element=name==='account'?React.createElement(AccountStage,{language:'en',onLanguage:()=>{}},React.createElement('h2',null,'Account')):name==='invite'?React.createElement(Route.options.component):name==='admin'?React.createElement(AdminPage):name==='showcase'?React.createElement(DesignSystemShowcase):React.createElement(AuthPage);root.render(element);};setThemePreference('${testTheme.id}');window.proofReady=true;`;
const server=await createServer({root:process.cwd(),configFile:false,cacheDir:path.join(evidence,'vite-cache'),resolve:{dedupe:['react','react-dom']},optimizeDeps:{include:['react','react-dom','react-dom/client','react/jsx-runtime','react/jsx-dev-runtime','@tanstack/react-router','@tanstack/react-table','fflate','socket.io-client','verovio/esm','verovio/wasm','zod','jspdf','svg2pdf.js']},plugins:[themeExtensionPlugin(),react(),tailwind(),{name:'extension-fixture',
 configureServer(server){server.middlewares.use((req,res,next)=>{if(!req.url.startsWith('/proof.html'))return next();res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><link rel="stylesheet" href="/src/design-system/app.css"></head><body><div id="root"></div></body></html>');});},
 resolveId(id){if(id==='/proof-entry.tsx')return '\0proof-entry';},load(id){if(id==='\0proof-entry')return entry;},
 transform(code,id){if(id.endsWith('/src/main.ts'))return code+mainHooks;},
}],server:{host:'127.0.0.1',port:0,watch:null,hmr:false}});
const records=[];let browser;let noEnsembles=false;
try{
 await server.listen();const base=server.resolvedUrls.local[0];browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-accelerated-2d-canvas']});
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',route=>{const url=new URL(route.request().url());let data={};if(url.pathname==='/api/auth/list-sessions')data=[];else if(url.pathname==='/api/me')data={user:{id:'lead',name:'Test lead',email:'admin@test.com',sysadmin:true}};else if(url.pathname==='/api/ensembles')data=noEnsembles?[]:[{id:'fixture',name:'Testchor',kind:'choir',isLead:true,membershipId:'membership',capabilities:{manageMembers:true,editPieces:true,transcribe:true}}];else if(url.pathname.includes('/invitations/'))data={ensembleName:'Testchor',inviter:'Test lead',email:'admin@test.com',state:'pending'};else if(url.pathname.startsWith('/api/admin/'))data={items:[],nextCursor:null,timeZone:'UTC',paused:false,groups:[]};else if(url.pathname.endsWith('/members')||url.pathname.endsWith('/invitations')||url.pathname.endsWith('/pieces')||url.pathname.endsWith('/transcriptions'))data=[];else if(url.pathname==='/api/transcription/config')data={pdf:50e6,photo:20e6,pages:20};return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});});
 await page.routeWebSocket('**',ws=>ws.close());
 async function roles(screen){await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(150);const result=await page.evaluate(async()=>{const m=await import('/src/design-system/theme/index.ts');const t=m.readTheme();const missing=Object.entries(t.roles).filter(([,v])=>!v||/var\(/.test(v));return{id:t.id,roles:Object.keys(t.roles).length,missing,legacy:document.documentElement.hasAttribute('data-design')||document.documentElement.hasAttribute('data-ground'),color:t.colors.accent.css,rects:[...document.querySelectorAll('button,input,canvas,h1,h2')].filter(e=>e.getBoundingClientRect().width>0).length};});assert.equal(result.id,testTheme.id);assert.equal(result.legacy,false);assert.deepEqual(result.missing,[]);// Acceptance check: compare actual rendered paint on every screen, not just token values.
 await page.addStyleTag({content:'*,*::before,*::after{transition:none!important;animation:none!important}'});
 const {paints,unchanged,defaults,elements,pseudos,properties,paintCount} = await page.evaluate(probeThemePaints, {baseline:'night-paper',theme:testTheme.id});
 const matrixFile=screen+'-paints.json.gz';
 await fs.writeFile(path.join(evidence,matrixFile),Buffer.from(paints,'base64'));
 records.push({screen,...result,elements,pseudos,properties,paintCount,matrixFile,defaults,unchanged});
 if(!screen.startsWith('renderer-'))assert.ok(paints.length,screen+' has rendered themed paint');
 // Save the complete all-element/pseudo/property matrix before asserting.
 await fs.writeFile(path.join(evidence,'proof.json'),JSON.stringify({theme:testTheme,records,errors},null,2));
 assert.deepEqual(unchanged,[], screen+' loud-theme acceptance: every visible key paint must differ from night-paper');}
 await page.goto(base+'proof.html');await page.evaluate(async()=>{localStorage.setItem('ai-capella-lang','en');await import('/proof-entry.tsx');});await page.waitForFunction(()=>window.proofReady);
 for(const screen of ['signin','signup','reset','verify','account','invite','admin','showcase']){await page.evaluate(screen=>{history.replaceState(null,'',screen==='signup'?'/?mode=signup':screen==='reset'?'/?token=fixture':screen==='verify'?'/?verify=fixture':screen==='admin'?'/admin/users':'/proof.html');renderProofScreen(screen);},screen);await page.waitForTimeout(200);await roles(screen);assert.ok(await page.locator('#root').innerText(),screen+' rendered');}
 await page.evaluate(()=>{unmountProof();document.body.innerHTML='<div id="app"></div>';localStorage.setItem('ai-capella-intro-off','1');window.textureJobs=[];window.requestIdleCallback=fn=>{textureJobs.push(fn);return textureJobs.length;};});
 await page.evaluate(async xml=>{window.proofXML=xml;await(await import('/src/ensembles.ts')).initializeEnsembles();await import('/src/main.ts');proofMain.library();},xml);
 await roles('library');assert.ok(await page.evaluate(()=>proofMain.appearance()[0].options.some(option=>option.label==='Test aurora')), 'New registry entry appears in the appearance menu');await page.evaluate(()=>proofMain.account());await roles('account-sheet');await page.evaluate(async()=>{(await import('/src/design-system/behavior/index.ts')).closeOverlay();});
 await page.evaluate(async()=>{(await import('/src/ensemble-ui.ts')).createEnsembleSheet(()=>{});});await roles('ensemble-sheet');await page.evaluate(async()=>{(await import('/src/design-system/behavior/index.ts')).closeOverlay();});
 await page.evaluate(async()=>{proofMain.library();document.querySelector('#transcription-entry').click();});await roles('transcription');await page.evaluate(async()=>{(await import('/src/design-system/behavior/index.ts')).closeOverlay();});
 noEnsembles=true;await page.evaluate(async()=>{await(await import('/src/ensembles.ts')).initializeEnsembles();proofMain.landing();});await roles('landing');assert.equal(await page.locator('#landing-empty .ctl-note').evaluate(el=>getComputedStyle(el).textAlign),'center','First-run landing invitation copy inherits centering');assert.equal(await page.locator('#landing-empty .ctl-note').evaluate(el=>getComputedStyle(el).userSelect),'none','Landing invitation copy preserves unselectable text');noEnsembles=false;await page.evaluate(()=>proofMain.player());await roles('player-roll');
 await page.locator('[data-action=open-tempo]').click();const tempo=page.locator('dialog[open]');assert.equal(await tempo.locator('h2').innerText(),'Tempo','D12 centered Tempo dialog has a descriptive heading');const tempoTitle=await tempo.getAttribute('aria-labelledby');assert.ok(tempoTitle,'Tempo dialog associates its heading');assert.equal(await page.locator(`[id="${tempoTitle}"]`).innerText(),'Tempo');await page.keyboard.press('Escape');await tempo.waitFor({state:'detached'});
 await page.evaluate(async()=>{(await import('/src/intro.ts')).startIntro('player');});await roles('tour');await page.evaluate(async()=>{(await import('/src/intro.ts')).stopIntro();(await import('/src/powerHint.ts')).showPowerHint();});await roles('power-hint');
 // Renderer-only live-swap checks run outside a rehearsal (D05 has its own boundary contract).
 await page.evaluate(async()=>{(await import('/src/design-system/theme/index.ts')).setAppearanceRehearsing(false);});
 // Every renderer uses the same extended roles and real canvas/font resources.
 await page.evaluate(fixture);await page.evaluate(async()=>{window.checks=await import('/scripts/renderer-theme-checks.mjs');});
 for(const mode of ['roll','staff','overview','cover','light','stage','title-staff','paper','gel','stage-fill','ribbons','backdrop']) {
  const pixels=await page.evaluate(async({mode,id})=>{
   const api=await import('/src/design-system/theme/index.ts');
   api.setThemePreference('night-paper');await checks.draw(mode);
   const before=[...document.querySelectorAll('canvas')].map(c=>c.toDataURL());
   api.setThemePreference(id);await checks.draw(mode);
   const after=[...document.querySelectorAll('canvas')].map(c=>c.toDataURL());
   return {before,after};
  },{mode,id:testTheme.id});
  assert.ok(pixels.before.length,mode+' has real canvas paint');
  assert.notDeepEqual(pixels.before,pixels.after,mode+' canvas pixels must differ under the loud theme');
  records.push({screen:'renderer-'+mode,canvases:pixels.after.length,pixelsDiffer:true});
 }
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(evidence,'proof.json'),JSON.stringify({theme:testTheme,records,errors},null,2));console.log('Fourth-theme proof passed:',records.length,'screens/renderers, complete roles, no legacy attributes.');
}finally{await browser?.close();await server.close();}
