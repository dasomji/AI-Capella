/** AICAP-28 centered-dialog, anchored-menu, viewport and persistent-notification regressions. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
const out=process.env.EVIDENCE_DIR??process.env.BROWSER_EVIDENCE;
const baseline=!!process.env.OVERLAY_BASELINE;
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const records=[];
try {
 for(const theme of ['night-paper','parchment']) for(const [width,height] of [[1440,900],[768,1024],[390,844],[844,390]]) {
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
  await page.goto(process.env.BASE_URL+'/dev/design-system');
  await page.locator('.ds-specimens').waitFor();
  await page.evaluate(async theme=>{
   const {setThemePreference}=await import('/src/design-system/theme/index.ts');setThemePreference(theme);
   window.D=await import('/src/design-system/dom/index.ts');window.B=await import('/src/design-system/behavior/index.ts');
   document.body.replaceChildren();
   window.trigger=document.createElement('button');trigger.textContent='Open settings';document.body.append(trigger);trigger.focus();
  },theme);
  for(const variant of ['dialog','sheet','domain-sheet','library-sheet','library-popover','library-prompt','drawer','admin-detail','transcription','transcription-review']) {
   if(baseline&&variant==='admin-detail')continue;
   await page.evaluate(({variant,baseline})=>{
    const content=document.createElement('div');
    if(variant==='library-popover') {
     content.append(D.createMenu({label:'Ensembles',items:Array.from({length:22},(_,i)=>({label:i===21?'Members & invitations':`Ensemble ${i+1} · Evening singers`,onSelect(){}}))}).element);
    } else {
     content.append(D.createField({label:'Invitation email',control:D.createInput({type:'email',value:'singer@test.com'})}));
     for(let i=0;i<12;i++){const p=document.createElement('p');p.textContent=`${i+1}. Rehearsal settings and ensemble membership details`;content.append(p);}
     content.append(D.createButton({text:'Save settings'}));
    }
    window.panel=D.createDialog({variant,title:variant==='library-popover'?'Ensembles':'Members & invitations',content,behavior:{opener:trigger}});panel.open();
    if(baseline&&variant==='library-popover'){panel.element.style.left='70%';panel.element.style.top='50px';}
   },{variant,baseline});
   await page.evaluate(()=>document.fonts.ready);
   const geometry=await page.locator('dialog[open]').evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height,scroll:el.scrollHeight,client:el.clientHeight};});
   if(!baseline) {
    assert.ok(geometry.left>=-1&&geometry.top>=-1&&geometry.right<=width+1&&geometry.bottom<=height+1,`${variant} contained ${theme}/${width}: ${JSON.stringify(geometry)}`);
    assert.ok(Math.abs((geometry.left+geometry.right)/2-width/2)<2,`${variant} centered horizontally`);
    assert.ok(Math.abs((geometry.top+geometry.bottom)/2-height/2)<2,`${variant} centered vertically`);
    if(variant!=='transcription-review') assert.ok(geometry.left>0&&geometry.top>0,'Centered dialog has visible outer margins');
   }
   await page.screenshot({path:`${out}/${theme}-${width}x${height}-${variant}.png`});
   records.push({theme,width,height,variant,...geometry});
   await page.evaluate(()=>panel.close());
  }
  if(!baseline) {
   // Last actions of a long menu remain reachable; an already-open dialog keeps identity on rotation.
   await page.evaluate(()=>{const menu=D.createMenu({label:'Ensembles',items:Array.from({length:25},(_,i)=>({label:i===24?'Final ensemble action':`Ensemble ${i+1}`,onSelect(){}}))});window.rotation=D.createSheet({variant:'library-sheet',title:'Ensembles',content:menu.element});rotation.open();window.rotationElement=rotation.element;});
   await page.getByRole('menuitem',{name:'Final ensemble action',exact:true}).click();
   await page.setViewportSize({width:height,height:width});
   await page.evaluate(()=>new Promise(requestAnimationFrame));
   assert.equal(await page.evaluate(()=>rotation.element===rotationElement&&rotation.element.open),true,'D24 keeps open identity');
   await page.evaluate(()=>rotation.close());
   await page.setViewportSize({width,height});
   for(const variant of ['member','job']) {
    await page.evaluate(variant=>{
     const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent='⋯';details.append(summary);document.body.append(details);
     window.row=D.createMenu({variant,label:'Row actions',items:Array.from({length:25},(_,i)=>({label:i===24?'Last row action':`Action ${i+1}`,onSelect(){}}))});details.append(row.element);window.unrow=B.bindRowMenu(details,row.element);details.open=true;
    },variant);
    await page.getByRole('menu',{name:'Row actions'}).waitFor();
    const bounds=await page.getByRole('menu',{name:'Row actions'}).evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,scroll:el.scrollHeight,client:el.clientHeight};});
    assert.ok(bounds.left>=0&&bounds.top>=0&&bounds.right<=width&&bounds.bottom<=height,JSON.stringify(bounds));
    assert.ok(bounds.scroll>bounds.client,'Long compact menu scrolls internally');
    await page.getByRole('menuitem',{name:'Last row action',exact:true}).click();
    await page.screenshot({path:`${out}/${theme}-${width}x${height}-${variant}-row-menu.png`});
    await page.evaluate(()=>{unrow();row.dispose();document.querySelector('details').remove();});
   }
   await page.evaluate(()=>{B.toast('The operation failed. Retry when ready.','error');B.toast('A later saved notice');});
   await page.waitForTimeout(6600);
   assert.equal(await page.evaluate(()=>B.getToast().kind),'error','D15 errors persist beyond former timeout');
   await page.screenshot({path:`${out}/${theme}-${width}x${height}-persistent-error.png`});
   await page.locator('#toast button').click();
   assert.equal(await page.evaluate(()=>B.getToast().text),'A later saved notice');
   await page.evaluate(()=>B.dismissToast());
  }
  await page.close();
 }
 await fs.writeFile(`${out}/geometry.json`,JSON.stringify(records,null,2));
 console.log(`Overlay ${baseline?'baseline':'regressions'}: ${records.length} dialog states captured; containment, centered geometry, long-menu reachability, rotation identity, anchored scrolling and persistent errors ${baseline?'recorded':'passed'}.`);
} finally {await browser.close();}
