import {chromium} from 'playwright';
import pg from 'pg';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.BROWSER_BASE,shots='/tmp/aicap-p5b/shots';await fs.mkdir(shots,{recursive:true});
const db=new pg.Client({connectionString:process.env.DATABASE_URL});await db.connect();
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
const context=await browser.newContext();const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
const files=[];const shot=async name=>{files.push(name+'.png');await page.screenshot({path:shots+'/'+name+'.png',fullPage:true});};
try{
 const email=`admin-browser-${Date.now()}@example.test`,password='Local-browser-password-42';let r=await context.request.post(base+'/api/auth/sign-up/email',{headers:{origin:base},data:{email,password,name:'Oversight Operator'}});assert.equal(r.status(),200);const user=(await db.query('select id from "user" where email=$1',[email])).rows[0];await db.query('update "user" set email_verified=true where id=$1',[user.id]);r=await context.request.post(base+'/api/auth/sign-in/email',{headers:{origin:base},data:{email,password}});assert.equal(r.status(),200);
 r=await page.goto(base+'/admin');assert.equal(r.status(),404);await shot('ordinary-404');
 await db.query("insert into platform_roles(user_id) values($1)",[user.id]);
 await db.query('begin');
 const ensemble=(await db.query("insert into ensembles(name) values('Kammerchor Morgenlicht') returning id")).rows[0].id;
 await db.query('insert into memberships(ensemble_id,user_id,is_lead,edit_music_pieces) values($1,$2,true,true)',[ensemble,user.id]);await db.query('commit');
 const piece=(await db.query("insert into music_pieces(ensemble_id,title,sort_key,format) values($1,'Abendlied','1','musicxml') returning id",[ensemble])).rows[0].id;
 const version=(await db.query("insert into score_versions(ensemble_id,piece_id,version_no,created_by,format,musicxml,content_hash,size) values($1,$2,1,$3,'musicxml','<score-partwise>Private browser fixture</score-partwise>','fixture-content-hash',60) returning id",[ensemble,piece,user.id])).rows[0].id;await db.query('update music_pieces set current_version_id=$2 where id=$1',[piece,version]);
 await page.goto(base+'/admin');await page.getByRole('heading',{name:'Administration',exact:true}).waitFor();await page.getByRole('cell',{name:email,exact:true}).waitFor();
 await page.getByRole('searchbox').fill(email);await page.getByRole('button',{name:'Apply filters'}).click();await page.getByRole('cell',{name:email,exact:true}).click();await page.getByRole('dialog').waitFor();await shot('user-detail');await page.getByRole('button',{name:'Close',exact:true}).click();
 for(const tab of ['Ensembles','Pieces','Audit log','Transcription']){await page.getByRole('link',{name:tab,exact:true}).click();await page.getByRole('button',{name:'Apply filters'}).waitFor();await shot('tab-'+tab.replaceAll(' ','-'));}
 await page.getByLabel('Reason',{exact:true}).fill('Browser verification stop');await page.getByRole('switch').click();await page.getByRole('button',{name:'Confirm',exact:true}).click();await page.getByRole('status').filter({hasText:'Processing paused'}).waitFor();
 await page.getByLabel('Reason',{exact:true}).fill('Browser verification resume');await page.getByRole('switch').click();await page.getByRole('button',{name:'Confirm',exact:true}).click();await page.getByRole('status').filter({hasText:'Processing enabled'}).waitFor();
 await page.getByRole('link',{name:'Pieces',exact:true}).click();await page.getByRole('cell',{name:'Abendlied',exact:true}).click();await page.getByRole('button',{name:'View content'}).click();await page.getByText('This access will be recorded in the audit log.',{exact:true}).waitFor();await shot('content-confirm');await page.getByRole('button',{name:'Confirm',exact:true}).click();await page.locator('.admin-content').filter({hasText:'Private browser fixture'}).waitFor();await shot('content-view');await page.getByRole('button',{name:'Close',exact:true}).click();
 const lum=s=>{const x=s.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return x[0]*.2126+x[1]*.7152+x[2]*.0722;};
 for(const theme of ['dark','light','papier'])for(const width of [1440,390]){
 await page.setViewportSize({width,height:width===390?844:1000});await page.emulateMedia({colorScheme:theme==='light'?'light':'dark'});await page.goto(base+'/admin/users'+(theme==='papier'?'?design=papier':'?design=auto'));await page.getByRole('cell',{name:email,exact:true}).waitFor();
 const colors=await page.locator('.admin-shell').evaluate(el=>{const s=getComputedStyle(el);const test=document.createElement('span');el.append(test);const result={bg:s.backgroundColor,ink:s.color};for(const [key,v] of [['secondary','--admin-secondary'],['gold','--admin-gold']]){test.style.color=s.getPropertyValue(v);result[key]=getComputedStyle(test).color;}test.remove();return result;});
 for(const key of ['ink','secondary','gold']){const a=lum(colors.bg),b=lum(colors[key]);assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,JSON.stringify({theme,key,colors}));}
 await shot(theme+'-'+width);if(width===390){await page.getByRole('cell',{name:email,exact:true}).click();await page.getByRole('dialog').waitFor();await shot(theme+'-'+width+'-detail');await page.getByRole('button',{name:'Close',exact:true}).click();}await page.getByRole('button',{name:'DE',exact:true}).click();await page.getByRole('heading',{name:'Verwaltung',exact:true}).waitFor();await shot(theme+'-'+width+'-de');await page.getByRole('button',{name:'EN',exact:true}).click();
 }
 assert.equal(Number((await db.query("select count(*) from audit_events where actor_id=$1 and action='admin.piece.content'",[user.id])).rows[0].count),1);assert.deepEqual(errors,[]);console.log('ADMIN_BROWSER_PASS',files.length,'screenshots; AA text contrast >=4.5');
}catch(e){await shot('failure');console.error(await page.locator('body').innerText());throw e;}
finally{await fs.writeFile(shots+'/index.html','<!doctype html><meta name="viewport" content="width=device-width"><title>Phase 5b evidence</title><style>body{font:16px sans-serif}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}img{width:100%}</style><h1>Phase 5b browser evidence</h1><main>'+files.map(f=>`<figure><a href="${f}"><img src="${f}" alt="${f}"></a><figcaption>${f}</figcaption></figure>`).join('')+'</main>');await browser.close();await db.end();}
