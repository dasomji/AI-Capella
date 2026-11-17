/** Deterministic screen parity against a git revision, using the final built CSS on the new side. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import {chromium} from 'playwright';
import sharp from 'sharp';
import assert from 'node:assert/strict';
import {gzipSync,gunzipSync} from 'node:zlib';
const root=process.cwd(),out=path.resolve(process.env.BROWSER_EVIDENCE??'.review-evidence/design-parity');
const revision=process.env.PARITY_BASE??'9b983cc',build=path.resolve(process.env.PARITY_BUILD??'dist');
await fs.mkdir(out,{recursive:true});
assert.ok(process.env.PARITY_BASE_BUILD,'Set PARITY_BASE_BUILD to the baseline production build');
const baselineBuild=path.resolve(process.env.PARITY_BASE_BUILD);
const baselineHtml=await fs.readFile(path.join(baselineBuild,'client/offline.html'),'utf8');
const baselineCssFiles=[...baselineHtml.matchAll(/href="\/assets\/([^"]+\.css)"/g)].map(m=>m[1]);
const baseline=path.join(out,'baseline-source');await fs.mkdir(baseline,{recursive:true});
const archive=execFileSync('git',['archive',revision],{cwd:root,maxBuffer:64*1024*1024});execFileSync('tar',['-x','-C',baseline],{input:archive});
await fs.symlink(path.join(root,'node_modules'),path.join(baseline,'node_modules')).catch(error=>{if(error.code!=='EEXIST')throw error;});
const offlineHtml=await fs.readFile(path.join(build,'client/offline.html'),'utf8');
const cssFiles=[...offlineHtml.matchAll(/href="\/assets\/([^"]+\.css)"/g)].map(m=>m[1]);
assert.equal(cssFiles.length,2,'Build the split production CSS first');
const xml='<score-partwise version="4.0"><part-list><score-part id="S"><part-name>Soprano</part-name></score-part></part-list><part id="S"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><key><fifths>0</fifths></key><clef><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type><lyric><text>Sing</text></lyric></note></measure></part></score-partwise>';
const hooks=`\nwindow.parityMain={library:()=>{libraryState='ready';currentEnsemble='fixture';importedSongs=[{id:'piece',title:'Evening song',xml:window.parityXML,format:'musicxml',imported:true}];renderLibraryHead();renderSongList();setViewMode('library');},landing:()=>{setViewMode('landing');renderLanding();},player:async(view='roll')=>{sessionMode='solo';await loadSongLocally({id:'test-piece',title:'Evening song',xml:window.parityXML,format:'musicxml',imported:true});setViewMode('player');setActiveView(view);stopRenderLoop();renderNow();},account:()=>openAccountArea(document.querySelector('#lib-menu-btn')),controls:()=>openControlsSheet(document.querySelector('.info-row')),mixer:()=>openMixerSheet(document.querySelector('.mixer-chip')),export:()=>openExportSheet(document.querySelector('#player-menu-btn'))};`;
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {AuthPage} from '/src/auth-ui.tsx';import {AccountStage} from '/src/account-stage.tsx';import {Route} from '/src/routes/invite.$token.tsx';import {AdminPage} from '/src/admin-ui.tsx';import {setThemePreference} from '/src/design-system/theme/index.ts';let root;Route.useParams=()=>({token:'fixture'});window.unmountParity=()=>root?.unmount();window.renderParity=(name)=>{root?.unmount();root=createRoot(document.getElementById('root'));root.render(name==='account'?React.createElement(AccountStage,{language:'en',onLanguage:()=>{}},React.createElement('h2',null,'Account')):name==='invite'?React.createElement(Route.options.component):name==='admin'?React.createElement(AdminPage):React.createElement(AuthPage));};window.parityReady=true;`;
const servers=[];
async function host(side) {
 const sourceRoot=side==='before'?baseline:root;
 const server=await createServer({root:sourceRoot,configFile:false,cacheDir:path.join(out,side+'-vite-cache'),resolve:{dedupe:['react','react-dom']},optimizeDeps:{include:['react','react-dom','react-dom/client','react/jsx-runtime','react/jsx-dev-runtime','@tanstack/react-router','@tanstack/react-table','fflate','socket.io-client','verovio/esm','verovio/wasm','zod','jspdf','svg2pdf.js']},plugins:[react(),tailwind(),{name:'parity-fixture',
  configureServer(server){server.middlewares.use(async(req,res,next)=>{
   if(req.url?.startsWith('/assets/')){try{const file=path.join(side==='before'?baselineBuild:build,'client',new URL(req.url,'http://fixture').pathname);res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'font/woff2');res.end(await fs.readFile(file));return;}catch{return next();}}
   if(!req.url?.startsWith('/parity.html'))return next();res.setHeader('Content-Type','text/html');const links=(side==='before'?baselineCssFiles:cssFiles).map(f=>`<link rel="stylesheet" href="/assets/${f}">`).join('');res.end('<!doctype html><html><head>'+links+'</head><body><div id="root"></div></body></html>');
  });},resolveId(id){if(id==='/parity-entry.tsx')return '\0parity-entry';},load(id){if(id==='\0parity-entry')return entry;},transform(code,id){if(id.endsWith('/src/main.ts'))return code+hooks;}
 }],server:{host:'127.0.0.1',port:0,hmr:false,watch:null,fs:{allow:[sourceRoot,root,await fs.realpath(sourceRoot),await fs.realpath(root)]}}});
 await server.listen();servers.push(server);return server.resolvedUrls.local[0];
}
const browser=await chromium.launch({args:['--no-sandbox','--disable-accelerated-2d-canvas','--disable-gpu']});const records=[];
const png=await sharp({create:{width:180,height:240,channels:3,background:'#e5dece'}}).png().toBuffer();
async function capture(side,base,theme,width,height) {
 const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce',colorScheme:'dark',deviceScaleFactor:1}),page=await context.newPage(),errors=[];let noEnsembles=false;
 page.on('pageerror',error=>errors.push(error.message));await page.routeWebSocket('**',ws=>ws.close());
 await page.addInitScript(()=>{localStorage.setItem('ai-capella-lang','en');localStorage.setItem('ai-capella-intro-off','1');localStorage.setItem('lightscore-ensemble:lead','fixture');window.requestIdleCallback=()=>0;let seed=42;Math.random=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};Object.defineProperty(performance,'now',{value:()=>1000});const raf=requestAnimationFrame;window.requestAnimationFrame=callback=>raf(()=>callback(1000));});
 await page.route('**/api/**',route=>{
  const url=new URL(route.request().url());let data={};
  if(url.pathname==='/api/auth/list-sessions')data=[];
  else if(url.pathname==='/api/me')data={user:{id:'lead',name:'Test lead',email:'admin@test.com',sysadmin:true}};
  else if(url.pathname==='/api/ensembles')data=noEnsembles?[]:[{id:'fixture',name:'Testchor',kind:'choir',isLead:true,membershipId:'membership',capabilities:{manageMembers:true,editPieces:true,transcribe:true}}];
  else if(url.pathname.includes('/invitations/'))data={ensembleName:'Testchor',inviter:'Test lead',email:'admin@test.com',state:'pending'};
  else if(url.pathname.startsWith('/api/admin/'))data={items:[],nextCursor:null,timeZone:'UTC',paused:false,groups:[]};
  else if(url.pathname.endsWith('/result'))return route.fulfill({contentType:'application/xml',body:xml});
  else if(url.pathname.endsWith('/report'))data={measures:[{measure:1,part:'S',page:1,localMeasure:'1'}],validation:{structurallyValid:true,warnings:[{code:'measure_duration',measure:1,part:'S'}],uncertainties:[],errors:[]}};
  else if(url.pathname.includes('/originals/'))return route.fulfill({contentType:'image/png',body:png});
  else if(url.pathname.endsWith('/transcriptions'))data=[{id:'job',state:'completed',stage:'completed',options:{title:'Evening song'},pages:[{page_number:0,source_page:1,state:'completed',object_id:'source',content_type:'image/png'}]}];
  else if(url.pathname.endsWith('/members')||url.pathname.endsWith('/invitations')||url.pathname.endsWith('/pieces'))data=[];
  else if(url.pathname==='/api/transcription/config')data={pdf:50e6,photo:20e6,pages:20};
  return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto(base+'parity.html');await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'});
 await page.evaluate(async theme=>{await import('/parity-entry.tsx');(await import('/src/design-system/theme/index.ts')).setThemePreference(theme);},theme);await page.waitForFunction(()=>window.parityReady);
 const result=[];
 async function shot(screen) {
  if(process.env.PARITY_SCREENS&&!process.env.PARITY_SCREENS.split(',').includes(screen))return;
  await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(150);await page.mouse.move(0,0);
  const name=`${theme}-${width}-${screen}`;const file=path.join(out,side,name+'.png');await fs.mkdir(path.dirname(file),{recursive:true});await page.screenshot({path:file,animations:'disabled'});
  const styles=await page.evaluate(async()=>{
   const large=new Set();
   const rows=[...document.querySelectorAll('*')].filter(el=>{const r=el.getBoundingClientRect();return !el.closest('defs')&&r.width&&r.height&&getComputedStyle(el).visibility!=='hidden';}).flatMap(el=>[null,'::before','::after'].map(pseudo=>{const s=getComputedStyle(el,pseudo),r=el.getBoundingClientRect();return {tag:el.tagName,id:el.id,text:el.children.length?'':el.textContent,box:[r.x,r.y,r.width,r.height],pseudo,styles:Object.fromEntries([...s].filter(p=>!p.startsWith('--')).map(p=>{const value=s.getPropertyValue(p);if(value.length>1000)large.add(value);return[p,value];}))};}));
   const dictionary={},ids=new Map();
   for(const value of large){const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('');const id='sha256:'+hash;ids.set(value,id);dictionary[id]=value;}
   for(const row of rows)for(const property of Object.keys(row.styles))if(ids.has(row.styles[property]))row.styles[property]=ids.get(row.styles[property]);
   return {rows,dictionary};
  });
  const stylesFile=path.join(out,side,name+'.json.gz');
  await fs.writeFile(stylesFile,gzipSync(JSON.stringify(styles)));
  result.push({name,screen,file,stylesFile});
 }
 for(const screen of ['signin','signup','reset','verify','account','invite','admin']){
  await page.evaluate(screen=>{history.replaceState(null,'',screen==='signup'?'/?mode=signup':screen==='reset'?'/?token=fixture':screen==='verify'?'/?verify=fixture':screen==='admin'?'/admin/users':'/parity.html');renderParity(screen);},screen);await page.waitForTimeout(250);await shot(screen);
 }
 await page.evaluate(()=>{unmountParity();document.body.innerHTML='<div id="app"></div>';});
 await page.evaluate(async xml=>{window.parityXML=xml;await(await import('/src/ensembles.ts')).initializeEnsembles();await import('/src/main.ts');},xml);await page.waitForTimeout(500);await page.evaluate(()=>parityMain.library());await shot('library');
 const close=async()=>{await page.evaluate(async()=>{(await import('/src/design-system/behavior/index.ts')).closeOverlay();});await page.waitForTimeout(100);};
 await page.locator('#lib-menu-btn').click();await shot('library-menu');await close();
 await page.evaluate(()=>parityMain.account());await shot('account-sheet');await close();
 await page.evaluate(async()=>{(await import('/src/ensemble-ui.ts')).createEnsembleSheet(()=>{});});await shot('ensemble-create');await close();
 await page.locator('#transcription-entry').click();await shot('transcription-upload');await close();
 await page.getByRole('button',{name:'Review',exact:true}).first().click();await page.locator('.tx-score svg').first().waitFor();await shot('transcription-review');await page.getByRole('switch').focus();await page.keyboard.press('Space');await page.locator('.tx-original img').waitFor();await shot('transcription-original');await close();
 noEnsembles=true;await page.evaluate(async()=>{await(await import('/src/ensembles.ts')).initializeEnsembles();parityMain.landing();});await shot('landing');noEnsembles=false;
 await page.evaluate(()=>parityMain.player());await shot('player-roll');
 await page.evaluate(()=>parityMain.mixer());await shot('player-mixer');await close();
 await page.evaluate(()=>parityMain.controls());await shot('player-controls');await close();
 await page.locator('[data-action=open-tempo]').evaluate(button=>button.click());await shot('tempo');await close();
 await page.evaluate(()=>parityMain.export());await shot('export');await close();
 await page.evaluate(()=>parityMain.player('staff'));await shot('player-staff');
 assert.deepEqual(errors,[],`${side} page errors`);await context.close();return result;
}
try {
 const before=await host('before'),after=await host('after');
 for(const theme of ['night-paper','parchment','velvet'])for(const [width,height]of [[1440,900],[768,1024],[390,844]]){
  if(process.env.PARITY_WIDTH&&Number(process.env.PARITY_WIDTH)!==width)continue;if(process.env.PARITY_THEME&&process.env.PARITY_THEME!==theme)continue;
  const a=await capture('before',before,theme,width,height),b=await capture('after',after,theme,width,height);assert.equal(a.length,b.length);
  for(let i=0;i<a.length;i++){
   const old={...a[i],styles:JSON.parse(gunzipSync(await fs.readFile(a[i].stylesFile))).rows},next={...b[i],styles:JSON.parse(gunzipSync(await fs.readFile(b[i].stylesFile))).rows},pixelA=await sharp(old.file).ensureAlpha().raw().toBuffer(),pixelB=await sharp(next.file).ensureAlpha().raw().toBuffer();let pixels=0;for(let j=0;j<pixelA.length;j+=4)if(pixelA[j]!==pixelB[j]||pixelA[j+1]!==pixelB[j+1]||pixelA[j+2]!==pixelB[j+2]||pixelA[j+3]!==pixelB[j+3])pixels++;
   const diffs=[];if(old.styles.length!==next.styles.length)diffs.push({kind:'element-count',before:old.styles.length,after:next.styles.length});
   for(let j=0;j<Math.min(old.styles.length,next.styles.length);j++){
    const x=old.styles[j],y=next.styles[j];for(const key of ['tag','text','box','pseudo'])if(JSON.stringify(x[key])!==JSON.stringify(y[key]))diffs.push({index:j,id:x.id,tag:x.tag,key,before:x[key],after:y[key]});
    for(const prop of Object.keys(x.styles))if(x.styles[prop]!==y.styles[prop])diffs.push({index:j,id:x.id,tag:x.tag,text:x.text,pseudo:x.pseudo,property:prop,before:x.styles[prop],after:y.styles[prop]});
   }
   const adminChange=theme==='parchment'&&old.screen==='account-sheet';
   const colorProperties=new Set(['color','border-top-color','border-right-color','border-bottom-color','border-left-color','outline-color','column-rule-color','caret-color','text-decoration-color','-webkit-text-fill-color','-webkit-text-stroke-color']);
   const allowed=diffs.filter(d=>adminChange&&d.tag==='A'&&d.text==='Administration'&&colorProperties.has(d.property));
   const unexpected=diffs.filter(d=>!allowed.includes(d));
   const link=adminChange?old.styles.find(d=>d.tag==='A'&&d.text==='Administration'&&d.pseudo===null):undefined;
   let unexpectedPixels=0;
   if(pixels) {
    const imageInfo=await sharp(old.file).metadata();
    for(let j=0;j<pixelA.length;j+=4)if(pixelA[j]!==pixelB[j]||pixelA[j+1]!==pixelB[j+1]||pixelA[j+2]!==pixelB[j+2]||pixelA[j+3]!==pixelB[j+3]){
     const x=(j/4)%imageInfo.width,y=Math.floor(j/4/imageInfo.width),box=link?.box;
     if(!box||x<Math.floor(box[0])-1||x>Math.ceil(box[0]+box[2])+1||y<Math.floor(box[1])-1||y>Math.ceil(box[1]+box[3])+1)unexpectedPixels++;
    }
   }
   const row={theme,width,screen:old.screen,pixels,allowedAdministrationChanges:allowed,unexpectedPixels,differences:unexpected};records.push(row);
   await fs.writeFile(path.join(out,'comparison.json'),JSON.stringify({revision,head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),records},null,2));
   console.log(theme,width,old.screen,pixels,'pixels',unexpected.length,'unexpected styles',unexpectedPixels,'unexpected pixels');
   assert.equal(unexpected.length,0,`${theme}/${width}/${old.screen}: computed-style parity`);
   assert.equal(unexpectedPixels,0,`${theme}/${width}/${old.screen}: pixel parity`);
  }
 }
}finally{await browser.close();await Promise.all(servers.map(server=>server.close()));}
