/** AICAP-28: localized recovery and live sysadmin revocation on reused route matches. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import pg from 'pg';
const base=process.env.BROWSER_BASE;
if(process.env.NODE_ENV!=='test'||!base||!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Use the isolated browser harness');
const out=process.env.BROWSER_EVIDENCE;
await fs.mkdir(out,{recursive:true});
await new Promise((resolve,reject)=>{
 const child=spawn(process.execPath,['--import','tsx','scripts/seed-dev.ts'],{env:process.env,stdio:'inherit'});
 child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(`Seed failed: ${code}`)));
});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const db=new pg.Client({connectionString:process.env.DATABASE_URL});
await db.connect();
let revokedId;
try {
 for(const theme of ['night-paper','parchment'])for(const [width,height]of [[390,844],[1440,900]])for(const language of ['de','en']) {
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
  await context.addInitScript(({language})=>{localStorage.setItem('ai-capella-lang',language);localStorage.setItem('ai-capella-intro-off','1');},{language});
  const page=await context.newPage();
  const response=await page.goto(`${base}/missing-aicap-28-page?design=${theme}`);
  assert.equal(response.status(),404);
  const title=language==='de'?'Seite nicht gefunden':'Page not found';
  await page.getByRole('heading',{name:title,exact:true}).waitFor();
  const recovery=page.getByRole('link',{name:language==='de'?'Zurück zu LightScore':'Return to LightScore',exact:true});
  assert.equal(await recovery.getAttribute('href'),'/app');
  assert.equal(await page.locator('html').getAttribute('lang'),language);
  assert.ok((await recovery.boundingBox()).width>0,'Recovery is visible');
  await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:`${out}/${theme}-${language}-${width}x${height}-404.png`});
  await page.getByRole('button',{name:language==='de'?'EN':'DE',exact:true}).click();
  await page.getByRole('heading',{name:language==='de'?'Page not found':'Seite nicht gefunden',exact:true}).waitFor();
  await page.getByRole('link',{name:language==='de'?'Return to LightScore':'Zurück zu LightScore',exact:true}).click();
  await page.waitForURL('**/app');
  assert.equal(await page.getByRole('heading',{name:/Page not found|Seite nicht gefunden/}).count(),0);
  await context.close();
 }
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 await context.addInitScript(()=>{localStorage.setItem('ai-capella-lang','en');localStorage.setItem('ai-capella-intro-off','1');});
 const page=await context.newPage();
 await page.goto(base);
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.locator('[name=email]').fill('admin@test.com');await page.locator('[name=password]').fill('password');
 await page.locator('form button[type=submit]').click();await page.waitForURL('**/app');
 await page.goto(base+'/admin/users');
 const nav=page.getByRole('navigation',{name:'Administration sections'});
 await nav.waitFor();
 // This Link stays on /admin/$, exercising beforeLoad cause=stay instead of a full page load.
 await nav.getByRole('link',{name:'Ensembles',exact:true}).click();
 await page.waitForURL('**/admin/ensembles');
 await page.getByRole('heading',{name:'Ensembles',exact:true}).waitFor();
 const user=(await db.query('select id from "user" where email=$1',['admin@test.com'])).rows[0];
 revokedId=user.id;
 await db.query('delete from platform_roles where user_id=$1',[revokedId]);
 await nav.getByRole('link',{name:'Users',exact:true}).click();
 await page.waitForURL('**/admin/users');
 await page.getByRole('heading',{name:'Page not found',exact:true}).waitFor();
 assert.equal(await page.locator('.admin-shell').count(),0,'Revoked sysadmin content is removed');
 assert.equal((await context.request.get(base+'/api/admin/users')).status(),404,'API still rechecks access');
 await page.screenshot({path:`${out}/revoked-admin-navigation.png`});
 await context.close();
 console.log('Localized 404: both languages/themes, phone/desktop, language switch and recovery PASS. Revoked sysadmin in-app navigation and API denial PASS.');
} finally {
 if(revokedId)await db.query("insert into platform_roles(user_id,role) values($1,'sysadmin') on conflict(user_id) do nothing",[revokedId]);
 await db.end();await browser.close();
}
