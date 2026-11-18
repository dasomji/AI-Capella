/** Read-only application fixture for D42–D47. All API responses are local stubs. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
export async function ownerFixture(evidence) {
 const xml16=await fs.readFile('tests/fixtures/voices-16.musicxml','utf8');
 const xml8=xml16.replace(/<score-part id="P(?:9|1[0-6])">[\s\S]*?<\/score-part>/g,'').replace(/<part id="P(?:9|1[0-6])">[\s\S]*?<\/part>/g,'');
 const hooks=`\nwindow.owner={library:()=>{if(typeof setAppearanceRehearsing==='function')setAppearanceRehearsing(false);libraryState='ready';currentEnsemble='fixture';importedSongs=window.ownerSongs;renderLibraryHead();renderSongList();setViewMode('library');},player:async(n=16)=>{sessionMode='solo';await loadSongLocally({id:'owner-score-'+n,title:(n===8?'Eight':'Sixteen')+' voices · LightScore',xml:window.ownerXML[n],format:'musicxml',voiceNumbers:Object.fromEntries(Array.from({length:n},(_,i)=>['P'+(i+1),i+1]))});setActiveView('roll');renderNow();},staff:()=>{setActiveView('staff');if(currentScore?.parts.length===8)staffView?.scrollByPixels(240);renderNow();},roll:()=>{setActiveView('roll');renderNow();},mixer:()=>openMixerSheet(document.querySelector('#lib-menu-btn')),menu:()=>document.querySelector('#lib-menu-btn').click(),render:()=>renderNow()};`;
 const title=['Short title','A much longer complete title for the singers in our choir, with every word retained','Evening Rise','Another full title that wraps over several lines beside a short piece','Round','Dona nobis pacem'];
 const songs=title.map((title,i)=>({id:'owner-'+i,title,xml:xml8,format:'musicxml',imported:true}));
 const baseline=process.env.OWNER_BASELINE==='1';
 const root=baseline?path.join(evidence,'source'):process.cwd();
 if(baseline){await fs.mkdir(root,{recursive:true});execFileSync('tar',['-xf','-','-C',root],{input:execFileSync('git',['archive','d96bae9'],{maxBuffer:128*1024*1024})});await fs.symlink(path.join(process.cwd(),'node_modules'),path.join(root,'node_modules')).catch(e=>{if(e.code!=='EEXIST')throw e;});}
 const entry=`import {initializeEnsembles} from '/src/ensembles.ts';import {initializeTheme} from '/src/design-system/theme/index.ts';localStorage.setItem('ai-capella-lang','en');localStorage.setItem('ai-capella-intro-off','1');window.ownerXML=${JSON.stringify({8:xml8,16:xml16})};window.ownerSongs=${JSON.stringify(songs)};initializeTheme();await initializeEnsembles();await import('/src/main.ts');window.owner.library();window.ownerReady=true;`;
 const server=await createServer({root,configFile:false,cacheDir:path.join(evidence,'vite-cache'),resolve:{dedupe:['react','react-dom']},optimizeDeps:{include:['react','react-dom','react-dom/client','react/jsx-runtime','react/jsx-dev-runtime','fflate','socket.io-client','verovio/esm','verovio/wasm','zod','jspdf','svg2pdf.js']},plugins:[react(),tailwind(),{name:'owner-decisions',enforce:'pre',configureServer(s){s.middlewares.use((req,res,next)=>{
  if(req.url.startsWith('/api/')){let data={};const p=req.url.split('?')[0];if(p==='/api/me')data={user:{id:'lead',name:'Test lead',email:'admin@test.com',sysadmin:true}};else if(p==='/api/ensembles')data=[{id:'fixture',name:'Owner review choir',kind:'choir',isLead:true,membershipId:'lead',capabilities:{editPieces:true,manageMembers:true}}];else if(p.endsWith('/pieces')||p.endsWith('/invitations')||p.endsWith('/transcriptions')||p.endsWith('/list-sessions'))data=[];res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));return;}
  if(req.url.startsWith('/owner.html')){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/design-system/app.css"></head><body><div id="app"></div><script type="module" src="/owner-entry.ts"></script></body></html>');return;}next();
 });},resolveId(id){if(id==='/owner-entry.ts')return '\0owner-entry';},load(id){if(id==='\0owner-entry')return entry;},transform(code,id){if(id.endsWith('/src/main.ts'))return code+hooks;}}],server:{host:'0.0.0.0',port:Number(process.env.OWNER_PORT)||0,hmr:false,watch:null,allowedHosts:true,fs:{allow:[root,process.cwd(),await fs.realpath(path.join(process.cwd(),'node_modules'))]}}});
 await server.listen();return {server,base:server.resolvedUrls.local[0],xml8,xml16};
}
if(process.argv[1]===new URL(import.meta.url).pathname){const evidence=process.env.BROWSER_EVIDENCE||'/tmp/aicap-design/impl/d42-d47';await fs.mkdir(evidence,{recursive:true});const {base}=await ownerFixture(evidence);console.log(base+'owner.html');}
