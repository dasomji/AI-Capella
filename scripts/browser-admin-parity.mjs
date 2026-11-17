/** Fixed presentation fixtures; real authorization/mutations are covered by browser-admin*. */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import { spawnSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
let base=process.env.BROWSER_BASE;
let baselineServer;
if(process.env.ADMIN_PARITY_BASELINE_ROOT){const reservation=createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));base='http://localhost:'+port;baselineServer=spawn(process.execPath,['--import','tsx','server/entry.ts'],{stdio:'inherit',env:{...process.env,PORT:String(port),BETTER_AUTH_URL:base,TRUSTED_ORIGINS:base,LIGHTSCORE_BUILD_ROOT:process.env.ADMIN_PARITY_BASELINE_ROOT}});for(let n=0;n<150;n++){try{if((await fetch(base+'/readyz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}}
if(process.env.NODE_ENV!=='test'||!base||!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Use isolated harness');
assert.equal(spawnSync(process.execPath,['--import','tsx','scripts/seed-dev.ts'],{env:process.env,stdio:'inherit'}).status,0);
const root=process.env.BROWSER_EVIDENCE;await fs.mkdir(root,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
const context=await browser.newContext({reducedMotion:'reduce'});
await context.addInitScript(()=>{localStorage.setItem('ai-capella-lang','en');localStorage.setItem('ai-capella-intro-off','1');});
assert.equal((await context.request.post(base+'/api/auth/sign-in/email',{headers:{origin:base},data:{email:'admin@test.com',password:'password'}})).status(),200);
const page=await context.newPage();
const instant='2026-11-01T12:00:00.000Z',u={id:'00000000-0000-4000-8000-000000000001',name:'Test Admin',email:'admin@test.com',email_verified:true,sysadmin:true,ensemble_count:1,created_at:instant,last_active:instant}, e={id:'00000000-0000-4000-8000-000000000002',name:'Testchor',kind:'choir',members:2,pieces:1,created_at:instant};
const member={id:u.id,user_id:u.id,ensemble_id:e.id,ensemble_name:e.name,name:u.name,email:u.email,is_lead:true,manage_members:true,edit_music_pieces:true,ai_transcription:true};
const audit={id:'00000000-0000-4000-8000-000000000003',created_at:instant,actor_id:u.id,actor_name:u.name,action:'admin.membership.update',target_type:'membership',target_id:u.id,outcome:'success',reason:'Support request: update permissions'};
await page.route('**/api/admin/**',async route=>{
 const url=new URL(route.request().url()),path=url.pathname.slice('/api/admin/'.length);let data;
 if(route.request().method()!=='GET')return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({code:'last_lead',message:'An ensemble must have at least one lead.'})});
 if(path==='session')return route.continue();
 if(path==='transcription/control')data={paused:false,last:{created_at:instant,actor_name:u.name,actor_id:u.id,reason:'Processing enabled'}};
 else if(path==='transcription/usage')data={groups:[{day:'2026-11-01',model:'fixture-model',calls:12,pages:24,input_tokens:12345,output_tokens:2345,estimated_cost_usd:.123,unpriced_calls:0,latency_p50_ms:1200,latency_p95_ms:2400}]};
 else if(path==='transcription/failures')data={items:[{reason:'provider_timeout',calls:2}]};
 else if(path===`users/${u.id}`)data={profile:u,roles:[{role:'sysadmin'}],sections:{audit:{items:[audit],nextCursor:null}}};
 else if(path===`ensembles/${e.id}`)data={profile:e,sections:{invitations:{items:[],nextCursor:null},pieces:{items:[],nextCursor:null},jobs:{items:[],nextCursor:null},audit:{items:[audit],nextCursor:null}}};
 else {let items=path==='users'?[u,...Array.from({length:11},(_,i)=>({...u,id:'singer-'+i,name:'Singer '+String(i).padStart(2,'0'),email:`singer${i}@test.com`,sysadmin:false}))]:path==='ensembles'?[e,...Array.from({length:11},(_,i)=>({...e,id:'choir-'+i,name:'Choir '+String(i).padStart(2,'0')}))]:path==='memberships'?[member,...Array.from({length:11},(_,i)=>({...member,id:'member-'+i,name:'Singer '+String(i).padStart(2,'0'),email:`singer${i}@test.com`,is_lead:false,manage_members:false,edit_music_pieces:false,ai_transcription:false}))]:path==='audit'?[audit]:path==='transcription/jobs'?[{id:'job-001',state:'completed',model:'fixture-model',created_at:instant}]:[];
 const q=url.searchParams.get('search');if(q)items=items.filter(r=>JSON.stringify(r).toLowerCase().includes(q.toLowerCase()));
 const sort=url.searchParams.get('sort');if(sort)items.sort((a,b)=>String(a[sort]??a.id).localeCompare(String(b[sort]??b.id))*(url.searchParams.get('direction')==='desc'?-1:1));
 const offset=Number(url.searchParams.get('cursor')||0),limit=Number(url.searchParams.get('limit')||30);data={items:items.slice(offset,offset+limit),nextCursor:items.length>offset+limit?String(offset+limit):null};}
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...data,timeZone:'UTC'})});
});
async function ready(){await page.waitForTimeout(650);await page.evaluate(()=>document.fonts.ready);}
const measurements={};let prefix;
async function shot(name){await ready();await page.mouse.move(0,0);if(process.env.ADMIN_PARITY_STYLES)await fs.writeFile(`${root}/${prefix}-${name}-styles.json`,JSON.stringify(await page.evaluate(()=>[...document.querySelectorAll('button,input,th,td,h2,h3,[role=group],select')].slice(0,250).map(el=>{const c=getComputedStyle(el),b=el.getBoundingClientRect();return {tag:el.tagName,text:el.textContent?.slice(0,100),x:b.x,y:b.y,width:b.width,height:b.height,style:Object.fromEntries(['font-family','font-size','font-weight','font-variant-numeric','font-kerning','font-feature-settings','font-variation-settings','font-optical-sizing','text-rendering','line-height','letter-spacing','display','vertical-align','padding','margin','min-height','border-width','box-sizing','text-align','flex-shrink'].map(p=>[p,c.getPropertyValue(p)]))};})),null,2));await page.screenshot({path:`${root}/${prefix}-${name}.png`});measurements[`${prefix}-${name}`]=await page.evaluate(()=>Object.fromEntries(['[data-admin=shell],.admin-shell','[data-admin=shell] header,.admin-shell header','h1','[data-admin=filters],.admin-filters','[data-admin=data-table],.admin-data-table','th','td','input','[data-admin=detail]','[data-admin=confirm]'].map(s=>{const el=document.querySelector(s);if(!el)return [s,null];const cs=getComputedStyle(el),b=el.getBoundingClientRect();return [s,{x:b.x,y:b.y,width:b.width,height:b.height,font:cs.font,color:cs.color,background:cs.backgroundColor,padding:cs.padding,lineHeight:cs.lineHeight}];})));}
async function goto(tab){await page.goto(`${base}/admin/${tab}?design=${prefix.startsWith('night')?'papier':'pergament'}`);await ready();}
async function close(){const confirm=page.locator('dialog[open][data-admin=confirm]');if(await confirm.count())await confirm.getByRole('button',{name:'Cancel',exact:true}).click();await ready();}
try{
 for(const theme of ['night','parchment'])for(const [width,height] of [[1440,900],[768,1024],[390,844]]){
 prefix=`${theme}-${width}`;if(process.env.ADMIN_PARITY_ONLY&&prefix!==process.env.ADMIN_PARITY_ONLY)continue;await page.setViewportSize({width,height});
 await goto('users');await shot('users');await page.getByLabel('Rows per page',{exact:true}).selectOption('10');await ready();await page.getByRole('button',{name:'Next',exact:true}).click();await shot('users-page2');await page.getByRole('columnheader',{name:/Name/}).getByRole('button').click();await shot('users-sort');await page.getByRole('searchbox').fill('admin@test.com');await shot('users-search');await page.getByRole('link',{name:'Test Admin',exact:true}).click();await page.getByRole('heading',{level:1,name:'Test Admin'}).waitFor();await shot('user-detail');
 await page.getByRole('button',{name:'Revoke sysadmin…',exact:true}).click();await shot('sysadmin-confirm');await close();
 await goto('ensembles');await shot('ensembles');await page.getByLabel('Rows per page',{exact:true}).selectOption('10');await ready();await page.getByRole('button',{name:'Next',exact:true}).click();await shot('ensembles-page2');await page.getByRole('columnheader',{name:/Name/}).getByRole('button').click();await shot('ensembles-sort');await page.getByRole('searchbox').fill('Testchor');await shot('ensembles-search');await page.getByRole('link',{name:'Testchor',exact:true}).click();await page.getByRole('heading',{level:1,name:'Testchor'}).waitFor();await shot('members');const management=page.locator('[data-admin=management]');const memberTable=management.getByRole('region',{name:'Members',exact:true});await memberTable.getByLabel('Rows per page',{exact:true}).selectOption('10');await ready();await memberTable.getByRole('button',{name:'Next',exact:true}).click();await shot('members-page2');await memberTable.getByRole('columnheader',{name:/Name/}).getByRole('button').click();await shot('members-sort');
 await memberTable.getByRole('button',{name:/^Edit permissions of /}).first().click();const c=page.locator('dialog[open][data-admin=confirm]');await c.getByLabel('Edit music pieces',{exact:true}).setChecked(false);await shot('membership-edit');await c.getByLabel('Reason',{exact:true}).fill('Support case: adjust permissions');await shot('reason-confirm');await close();
 await memberTable.getByRole('button',{name:/^Remove /}).first().click();await c.getByLabel('Reason',{exact:true}).fill('Support case: last lead');await c.getByRole('button',{name:'Remove member',exact:true}).click();await c.getByRole('alert').waitFor();await shot('last-lead');await close();
 await management.getByRole('button',{name:'Add member…',exact:true}).click();await shot('add-picker');await close();
 await goto('audit');await shot('audit');await goto('transcription');await shot('metrics');await page.getByRole('button',{name:'Stop processing…',exact:true}).click();await page.locator('dialog[open][data-admin=confirm]').getByLabel('Reason',{exact:true}).fill('Support case: stop processing');await shot('stop-confirm');await close();
 await page.evaluate(()=>localStorage.setItem('ai-capella-lang','de'));await goto('users');await shot('users-de');await goto('transcription');await shot('metrics-de');await page.evaluate(()=>localStorage.setItem('ai-capella-lang','en'));
 }
 await fs.writeFile(root+'/measurements.json',JSON.stringify(measurements,null,2));console.log('ADMIN_PARITY_CAPTURE_PASS',Object.keys(measurements).length);
}finally{await browser.close();if(baselineServer){baselineServer.kill('SIGTERM');await new Promise(r=>baselineServer.once('exit',r));}}
