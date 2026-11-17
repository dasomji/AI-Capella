/** D11/D14/D15: preserve real save timing and keep failures inside the active panel. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
const out=process.env.BROWSER_EVIDENCE;
const baseline=process.env.COMPONENT_BASELINE==='1';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const records=[];
try {
 for(const theme of ['night-paper','parchment'])for(const [width,height]of [[1440,900],[768,1024],[390,844],[844,390]]) {
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
  let rejectCreate=true,patches=0,invitations=0;
  const capabilities={manageMembers:false,editPieces:false,transcribe:false};
  const ensemble={id:'fixture',name:'Evening singers',kind:'choir',isLead:true,membershipId:'lead-membership',capabilities:{manageMembers:true,editPieces:true,transcribe:true}};
  await page.route('**/api/**',async route=>{
   const request=route.request(),path=new URL(request.url()).pathname;
   let data={},status=200;
   if(path==='/api/ensembles'&&request.method()==='POST') {if(rejectCreate){data={code:'service_unavailable'};status=503;}else data={id:'fixture'};}
   else if(path==='/api/ensembles')data=[ensemble];
   else if(path==='/api/me')data={user:{id:'lead',name:'Test lead',email:'admin@test.com'}};
   else if(path==='/api/ensembles/fixture/members')data=[{id:'member',userId:'singer',name:'Singer',email:'user@test.com',isLead:false,capabilities}];
   else if(path==='/api/ensembles/fixture/members/member'&&request.method()==='PATCH') {Object.assign(capabilities,request.postDataJSON());patches++;}
   else if(path==='/api/ensembles/fixture/invitations') {if(request.method()==='POST')invitations++;else data=[];}
   await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto(process.env.BASE_URL+'/healthz');
  await page.setContent('<!doctype html><html lang="en"><head><link rel="stylesheet" href="/src/design-system/app.css"></head><body></body></html>');
  await page.evaluate(async theme=>{
   localStorage.setItem('ai-capella-lang','en');
   (await import('/src/design-system/theme/index.ts')).setThemePreference(theme);
   window.C=await import('/src/ensemble-ui.ts');
   window.B=await import('/src/design-system/behavior/index.ts');
   C.createEnsembleSheet(()=>{window.created=true;});
  },theme);
  await page.locator('dialog[open] input').fill('Evening singers');
  await page.locator('dialog[open] button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('dialog[open] button[type=submit]')?.getAttribute('aria-busy')==='false');
  const inlineError=page.locator('dialog[open] [role=alert]');
  if(!baseline){await inlineError.waitFor();assert.ok(await inlineError.innerText());assert.equal(await page.locator('dialog[open] input').inputValue(),'Evening singers');}
  await page.screenshot({path:`${out}/${theme}-${width}x${height}-operation-error.png`});
  rejectCreate=false;
  await page.locator('dialog[open] button[type=submit]').click();
  await page.waitForFunction(()=>window.created===true);
  await page.locator('dialog[open]').waitFor({state:'detached'});
  await page.evaluate(async()=>{await(await import('/src/ensembles.ts')).initializeEnsembles();await C.membersSheet('fixture');});
  const panel=page.locator('dialog[open]');
  await panel.locator('[role=switch]').first().locator('..').click();
  await page.waitForFunction(()=>document.querySelector('dialog[open] [role=switch]')?.getAttribute('aria-checked')==='true');
  assert.equal(patches,1,'Member permission applies immediately');
  const draft=panel.locator('form input[type=checkbox]');
  assert.equal(await draft.count(),3);
  if(!baseline)assert.equal(await panel.locator('form [role=switch]').count(),0,'Invitation choices are submitted with Invite');
  await draft.first().locator('..').click();
  assert.equal(invitations,0,'Changing an invitation choice does not save');
  await page.screenshot({path:`${out}/${theme}-${width}x${height}-save-timing.png`});
  await panel.locator('form input[type=email]').fill('singer@test.com');
  await panel.locator('form button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('dialog[open] form button[type=submit]')?.getAttribute('aria-busy')==='false');
  assert.equal(invitations,1,'Invitation choices submit together');
  await panel.locator('summary').first().click();
  await panel.getByRole('menuitem',{name:'Remove member',exact:true}).click();
  const confirmation=page.getByRole('alertdialog');
  await confirmation.waitFor();
  const danger=confirmation.getByRole('button',{name:'Remove',exact:true});
  assert.equal(await danger.count(),1);
  assert.ok((await danger.getAttribute('class')).includes('tw:bg-danger'),'Final irreversible action has danger treatment');
  if(!baseline)assert.ok((await confirmation.getAttribute('class')).includes('tw:border-danger'),'Final confirmation has deliberate danger treatment');
  await page.screenshot({path:`${out}/${theme}-${width}x${height}-destructive-confirm.png`});
  await page.keyboard.press('Escape');
  await confirmation.waitFor({state:'detached'});
  records.push({theme,width,height,inlineError:!baseline,memberPatches:patches,invitationPosts:invitations,danger:true});
  await page.close();
  console.log('COMPONENTS',theme,width,height,'PASS');
 }
 await fs.writeFile(`${out}/functional.json`,JSON.stringify({baseline,records},null,2));
}finally{await browser.close();}
