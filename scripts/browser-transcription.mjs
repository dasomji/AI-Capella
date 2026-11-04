import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import pg from 'pg';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { S3Client,CreateBucketCommand,ListObjectsV2Command,DeleteObjectsCommand,DeleteBucketCommand } from '@aws-sdk/client-s3';
import { assertPlayerContrast } from './browser-themes.mjs';
const base=process.env.BROWSER_BASE,shots=process.env.BROWSER_EVIDENCE+'/shots';fs.mkdirSync(shots,{recursive:true});
const db=new pg.Pool({connectionString:process.env.DATABASE_URL}),s3=new S3Client({endpoint:process.env.S3_ENDPOINT,region:'us-east-1',forcePathStyle:true,requestChecksumCalculation:'WHEN_REQUIRED',credentials:{accessKeyId:'local-only',secretAccessKey:'local-only'}});
await s3.send(new CreateBucketCommand({Bucket:process.env.S3_BUCKET}));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']}),context=await browser.newContext({viewport:{width:1440,height:1000},locale:'en-US',colorScheme:'dark'}),page=await context.newPage();let worker;
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')console.error('browser:',m.text());});
await context.addInitScript(()=>{localStorage.setItem('ai-capella-intro-off','1');localStorage.setItem('ai-capella-lang','en');});
async function req(ctx,path,method='GET',body){const r=await ctx.request.fetch(base+'/api'+path,{method,headers:{Origin:base},...(body?{data:body}:{})});assert.ok(r.ok(),`${method} ${path}: ${r.status()} ${await r.text()}`);return r.json();}
async function account(ctx,name){const email=`${name}-${Date.now()}@example.test`,password='Transcription-fixture-password-42';await req(ctx,'/auth/sign-up/email','POST',{email,password,name});const user=(await db.query('select id from "user" where email=$1',[email])).rows[0];await db.query('update "user" set email_verified=true where id=$1',[user.id]);await req(ctx,'/auth/sign-in/email','POST',{email,password});return user.id;}
async function library(p){await p.goto(base+'/app');await p.waitForFunction(()=>{const a=document.querySelector('#app');return a?.classList.contains('mode-library')||a?.classList.contains('mode-landing');});if(await p.locator('#mode-solo-btn').isVisible())await p.locator('#mode-solo-btn').click();await p.locator('.ens-switch').waitFor();}
async function shot(name,p=page){await p.evaluate(()=>document.fonts.ready);await p.screenshot({path:`${shots}/${name}.png`,fullPage:true});}
async function review(){await page.getByRole('button',{name:'Review',exact:true}).first().click();await page.locator('.tx-score svg').first().waitFor();await page.locator('.tx-mark').first().waitFor();}
try{
 const lead=await account(context,'lead');const ensemble=await req(context,'/ensembles','POST',{name:'Transcription Choir'}),e=ensemble.id;
 await library(page);await page.locator('#transcription-entry').click();
 await page.locator('input[accept="image/jpeg,image/png,image/webp"]').setInputFiles({name:'photo.heic',mimeType:'image/heic',buffer:Buffer.from('heic')});await page.getByText('HEIC photos are not supported – please export as JPEG.').waitFor();await page.getByRole('button',{name:'Remove',exact:true}).click();
 const pdf=await PDFDocument.create();pdf.addPage([400,550]);pdf.addPage([400,550]);await page.locator('input[accept="application/pdf"]').setInputFiles({name:'Two pages.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});await shot('start-desktop-dark');
 worker=spawn(process.execPath,['--import','tsx','scripts/transcription-browser-worker.ts'],{env:process.env,stdio:'inherit'});
 await page.getByRole('button',{name:'Start reading',exact:true}).click();await page.locator('.tx-job').first().waitFor();await shot('jobs-running');
 await page.getByRole('button',{name:'Review',exact:true}).first().waitFor({timeout:30000});await review();assert.ok(await page.locator('.tx-mark').count()>=2);
 await page.locator('.tx-review-item').first().click();await page.locator('.tx-original img').waitFor({timeout:30000});
 await page.locator('dialog .tx-close').click();
 const hostile='<img src=x onerror="window.providerExecuted=1">';
 await page.route('**/report',async route=>{const response=await route.fetch();const body=await response.json();body.validation.uncertainties=[{measure:'1',part:hostile,reason:hostile,page:1}];await route.fulfill({json:body});});
 await page.getByRole('button',{name:'Review',exact:true}).first().click();await page.locator('.tx-score svg').first().waitFor();assert.ok((await page.locator('.tx-review-items').innerText()).includes(hostile));assert.equal(await page.locator('.tx-review-items img').count(),0);assert.equal(await page.evaluate(()=>window.providerExecuted),undefined);await page.unroute('**/report');
 // Visual fixtures reuse a real completed job/result; only job-list states are overridden.
 // No provider call is made for the failed/paused/cancelled matrix examples.
 const completed=(await req(context,`/ensembles/${e}/transcriptions`)).find(j=>j.state==='completed');
 const pngFixture=await sharp({create:{width:140,height:180,channels:3,background:'#eee3c7'}}).png().toBuffer();
 for(const theme of [{name:'dark',scheme:'dark'},{name:'light',scheme:'light'},{name:'papier',scheme:'light',design:'papier'}])for(const width of [1440,390])for(const language of ['de','en']){
  const c=await browser.newContext({storageState:await context.storageState(),colorScheme:theme.scheme,viewport:{width,height:1000}});
  await c.addInitScript(({language,design})=>{localStorage.setItem('ai-capella-lang',language);if(design)localStorage.setItem('ai-capella-design',design);else localStorage.removeItem('ai-capella-design');},{language,design:theme.design});
  const p=await c.newPage(),prefix=`${theme.name}-${width}-${language}`;
  const states=['running','completed','failed','paused','cancelled'];
  await p.route(`**/api/ensembles/${e}/transcriptions`,route=>route.request().method()==='GET'?route.fulfill({json:states.map((state,i)=>({...completed,id:state==='completed'?completed.id:`visual-${state}`,state:state==='paused'?'queued':state,stage:state==='paused'?'processing_paused':state,options:{title:language==='de'?'Abendlied':'Evening song'},failure_reason:state==='failed'?'provider_timeout':undefined,pages:completed.pages.map((page,n)=>({...page,state:state==='running'?(n===0?'completed':'running'):state==='paused'?'queued':state}))}))}):route.continue());
  await library(p);await p.locator('.tx-job').nth(4).waitFor();
  await shot(`jobs-all-${prefix}`,p);await assertPlayerContrast(p,['.tx-job h3','.tx-job .tx-pencil','.tx-job .primary']);
  assert.equal(await p.locator('.tx-job .primary').count(),1);assert.equal(await p.locator('.tx-job svg').count(),0);
  await p.locator('#transcription-entry').click();await shot(`start-empty-${prefix}`,p);
  await assertPlayerContrast(p,['.transcription-dialog h1','.tx-label','.tx-pencil','.tx-language-chip']);
  assert.equal(await p.locator('.tx-start').isDisabled(),true);
  await p.locator('.tx-language-chip[data-value="de"]').click();assert.equal(await p.locator('.tx-language-chip[data-value="de"]').getAttribute('aria-pressed'),'true');
  await p.locator('input[accept="image/jpeg,image/png,image/webp"]').setInputFiles([1,2].map(n=>({name:`Photo ${n}.png`,mimeType:'image/png',buffer:pngFixture})));
  await p.locator('#tx-title').fill(language==='de'?'Abendlied':'Evening song');await shot(`start-photos-${prefix}`,p);
  assert.equal(await p.locator('.tx-tile[aria-pressed=true]').count(),1);assert.equal(await p.locator('.tx-start').isEnabled(),true);
  await p.locator('input[accept="image/jpeg,image/png,image/webp"]').setInputFiles({name:'photo.heic',mimeType:'image/heic',buffer:Buffer.from('heic')});
  await shot(`start-error-${prefix}`,p);assert.equal(await p.locator('.tx-start').isDisabled(),true);await assertPlayerContrast(p,['.tx-error']);
  await p.locator('.transcription-dialog header button').click();await p.getByRole('button',{name:language==='de'?'Prüfen':'Review',exact:true}).click();await p.locator('.tx-mark').first().waitFor();
  await shot(`review-off-${prefix}`,p);await assertPlayerContrast(p,['.transcription-dialog h1','.tx-review-panel h2','.tx-pencil','.tx-review-item','.tx-glyph','.tx-score-page svg','.tx-link','.tx-review-actions .primary']);
  assert.equal(await p.locator('.tx-score-page .note').first().evaluate(el=>getComputedStyle(el).fill),await p.locator('.tx-score-page').first().evaluate(el=>getComputedStyle(el).color));
  assert.equal(await p.locator('.tx-glyph.warning').first().innerText(),'!');assert.equal(await p.locator('.tx-mark.warning').first().textContent(),'!');
  assert.match(await p.locator('.tx-review-panel > .tx-pencil').innerText(),language==='de'?/1 Warnung · 2 Unsicherheiten/:/1 warning · 2 uncertainties/);
  await p.getByRole('switch').check();await p.locator('.tx-original img').waitFor();await shot(`review-on-${prefix}`,p);
  assert.equal(await p.getByRole('switch').getAttribute('aria-checked'),'true');
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await c.close();
 }
 await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'Listen',exact:true}).click();await page.locator('.play-btn').waitFor();await page.locator('.play-btn').click();await page.waitForFunction(()=>document.querySelector('.play-btn')?.getAttribute('aria-label')?.toLowerCase().includes('pause'));await page.locator('.play-btn').click();assert.equal((await req(context,`/ensembles/${e}/pieces`)).length,0);
 await page.locator('#library-back-btn').click();await review();const imported=page.waitForResponse(r=>r.url().endsWith('/import')&&r.request().method()==='POST');await page.getByRole('button',{name:'Add to repertoire',exact:true}).evaluate(b=>{b.click();b.click();});await imported;await page.locator('.play-btn').waitFor();assert.equal((await req(context,`/ensembles/${e}/pieces`)).length,1);
 await page.locator('#library-back-btn').click();
 await db.query('insert into transcription_control(id,paused) values(1,true) on conflict(id) do update set paused=true');
 await page.locator('#transcription-entry').click();const png=await sharp({create:{width:100,height:120,channels:3,background:'white'}}).png().toBuffer();await page.locator('input[accept="image/jpeg,image/png,image/webp"]').setInputFiles(await Promise.all([1,2,3].map(async n=>({name:`Photo ${n}.png`,mimeType:'image/png',buffer:await sharp(png).resize(100+n).png().toBuffer()}))));
 await page.getByRole('button',{name:'Move page right',exact:true}).first().click();assert.match(await page.locator('.tx-photo').first().innerText(),/Photo 2/);await shot('photos-reordered');await page.getByRole('button',{name:'Start reading',exact:true}).click();await page.getByText('Paused – processing is temporarily suspended',{exact:true}).first().waitFor({timeout:15000});await shot('jobs-paused');const photoJob=(await req(context,`/ensembles/${e}/transcriptions`)).find(j=>j.pages.length===3);assert.deepEqual(photoJob.pages.map(p=>p.original_filename),['Photo 2.png','Photo 1.png','Photo 3.png']);
 await page.locator('.tx-job details summary').first().click();await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.getByText('Cancelled',{exact:true}).waitFor();await shot('jobs-cancelled');await page.locator('.tx-job details summary').first().click();await page.getByRole('button',{name:'Retry',exact:true}).click();await page.getByText('Paused – processing is temporarily suspended',{exact:true}).first().waitFor();
 await db.query('update transcription_control set paused=false');await page.getByRole('button',{name:'Review',exact:true}).first().waitFor({timeout:30000});
 const memberContext=await browser.newContext({viewport:{width:390,height:900},locale:'en-US'});await memberContext.addInitScript(()=>{localStorage.setItem('ai-capella-intro-off','1');localStorage.setItem('ai-capella-lang','en');});const member=await account(memberContext,'member');await db.query('insert into memberships(ensemble_id,user_id,ai_transcription) values($1,$2,true)',[e,member]);const memberPage=await memberContext.newPage();await library(memberPage);await memberPage.locator('#transcription-entry').waitFor();await memberPage.getByRole('button',{name:'Review',exact:true}).first().click();await memberPage.locator('.tx-score svg').first().waitFor();assert.ok(await memberPage.getByRole('button',{name:'Add to repertoire',exact:true}).isDisabled());await memberPage.getByText('Adding to repertoire requires someone with “Edit pieces” permission.').waitFor();
 const membership=(await req(context,`/ensembles/${e}/members`)).find(m=>m.userId===member||m.email.startsWith('member-'));
 await req(context,`/ensembles/${e}/members/${membership.id}`,'PATCH',{editPieces:true});await memberPage.waitForFunction(()=>document.querySelector('.tx-review-actions .primary')?.disabled===false);
 await req(context,`/ensembles/${e}/members/${membership.id}`,'PATCH',{editPieces:false});await memberPage.waitForFunction(()=>document.querySelector('.tx-review-actions .primary')?.disabled===true);
 await req(context,`/ensembles/${e}/members/${membership.id}`,'PATCH',{transcribe:false});await memberPage.locator('dialog.transcription-review').waitFor({state:'detached'});assert.ok(await memberPage.locator('#transcription-entry').isHidden());assert.ok(await memberPage.locator('#transcription-jobs').isHidden());assert.equal((await memberContext.request.get(base+`/api/ensembles/${e}/transcriptions`)).status(),403);await memberContext.close();
 const next=await req(context,'/ensembles','POST',{name:'Destination Choir'});
 await page.addInitScript(({user,ensemble})=>{localStorage.removeItem('ai-capella-mode-v2');sessionStorage.removeItem('ai-capella-mode-switch');localStorage.removeItem('ai-capella-seen');localStorage.removeItem(`lightscore-place:${user}`);localStorage.setItem(`lightscore-ensemble:${user}`,ensemble);},{user:lead,ensemble:e});await page.reload();await page.locator('.ded-other').filter({hasText:'Destination Choir'}).click();await page.locator('#mode-solo-btn').click();
 await page.route('**/api/transcription/config',route=>route.fulfill({json:{pdf:50*1024*1024,photo:20*1024*1024,pages:1}}));
 await page.locator('#transcription-entry').click();assert.match(await page.locator('dialog h1').innerText(),/Destination Choir/);
 await page.locator('input[accept="image/jpeg,image/png,image/webp"]').setInputFiles([{name:'destination.png',mimeType:'image/png',buffer:png},{name:'extra.png',mimeType:'image/png',buffer:png}]);
 assert.ok(await page.getByRole('button',{name:'Start reading',exact:true}).isDisabled());assert.ok(await page.locator('dialog .tx-error[role=alert]').innerText());await page.getByRole('button',{name:'Remove',exact:true}).last().click();
 const created=page.waitForResponse(r=>r.url().endsWith(`/ensembles/${next.id}/transcriptions`)&&r.request().method()==='POST');
 await page.getByRole('button',{name:'Start reading',exact:true}).click();assert.equal((await created).status(),201);
 assert.equal((await req(context,`/ensembles/${next.id}/transcriptions`)).length,1);
 assert.deepEqual(errors,[]);console.log('Phase 4c browser acceptance passed');
}catch(error){console.error('Browser failure',error,await page.locator('body').innerText());await shot('failure');throw error;}finally{
 if(worker){worker.kill('SIGTERM');await new Promise(r=>worker.once('exit',r));}await browser.close();await db.end();const objects=await s3.send(new ListObjectsV2Command({Bucket:process.env.S3_BUCKET}));if(objects.Contents?.length)await s3.send(new DeleteObjectsCommand({Bucket:process.env.S3_BUCKET,Delete:{Objects:objects.Contents.map(o=>({Key:o.Key}))}}));await s3.send(new DeleteBucketCommand({Bucket:process.env.S3_BUCKET}));s3.destroy();
 if(fs.existsSync(shots+'/failure.png'))fs.unlinkSync(shots+'/failure.png');
 const files=fs.readdirSync(shots).filter(n=>n.endsWith('.png'));fs.mkdirSync(shots+'/thumbs',{recursive:true});await Promise.all(files.map(n=>sharp(`${shots}/${n}`).resize({width:380,withoutEnlargement:true}).webp({quality:75}).toFile(`${shots}/thumbs/${n.replace('.png','.webp')}`)));fs.writeFileSync(shots+'/index.html',`<!doctype html><meta charset="utf-8"><title>Phase 4c design pass</title><style>body{font:14px var(--font-sans,sans-serif);color:var(--foreground,inherit);margin:0}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}figure{min-width:0;margin:0}img{width:100%;height:280px;object-fit:contain;border-radius:8px}figcaption{overflow-wrap:anywhere;padding:8px 0;color:var(--muted-foreground,inherit)}</style><h1>Phase 4c design pass</h1><p>DE/EN · 390/1440 · dark/light/explicit Papier. Job-list visual fixtures reuse the real FakeProvider result.</p><main>${files.map(n=>`<figure><a href="${n}"><img loading="lazy" src="thumbs/${n.replace('.png','.webp')}"></a><figcaption>${n}</figcaption></figure>`).join('')}</main>`);
}
