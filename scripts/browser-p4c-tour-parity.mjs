/** Full tour-step parity against the source revision recorded at the original P4c capture. */
import {chromium} from 'playwright';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';
const base=process.env.BASE_URL??'https://lightscore-main-app-59737521.tailf5ea68.ts.net';
const root='/tmp/aicap-design/evidence/p4c';const ref=process.env.P4C_BEFORE_REF??'7133269e89395906a6baf63b6cea314686546569';
const old=file=>execFileSync('git',['show',`${ref}:${file}`],{encoding:'utf8'});
const legacy=(old('src/style.css')+'\n'+old('src/parchment.css')).replace(/theme\(--breakpoint-([\w-]+)\)/g,(_,name)=>({'panel':'900px','score':'700px','account':'640px'}[name]??'900px'));
const source=ts.transpileModule(old('src/intro.ts'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace(/from ['"]\.\/(design|i18n)['"]/g,(_,name)=>`from '/src/${name}.ts'`);
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{for(const version of ['before','after'])for(const theme of ['night-paper','parchment'])for(const [width,height] of [[1440,900],[768,1024],[390,844]]){
 const context=await browser.newContext({viewport:{width,height},colorScheme:'dark'}),page=await context.newPage();await page.addInitScript(()=>{localStorage.setItem('ai-capella-lang','en');localStorage.setItem('ai-capella-intro-off','1');});
 if(version==='before')await page.route('**/src/intro.ts',route=>route.fulfill({contentType:'application/javascript',body:source}));
 await page.goto(base+'/dev/design-system');await page.locator('.ds-specimens').waitFor();await page.evaluate(()=>document.fonts.ready);
 if(version==='before')await page.addStyleTag({content:'@layer legacy {'+legacy+'}'});
 await page.evaluate(async theme=>{(await import('/src/design-system/theme/index.ts')).setThemePreference(theme);window.intro=await import('/src/intro.ts');document.body.replaceChildren();},theme);
 for(const tour of ['library','player']){
  await page.evaluate(tour=>{document.body.replaceChildren();const controls=tour==='library'?['.ens-switch','#song-grid .song-card','#import-btn','#mode-seg']:['#stage','.play-btn','#view-seg','.voices-panel','#overview-wrap','.t-center .t-metro','.t-right','#mode-badge','#player-menu-btn'];controls.forEach((selector,i)=>{const parent=document.createElement('div'),target=document.createElement('button');target.textContent=['Ensemble','Piece','Add','Together','Overview','Count in','Tempo','Lead','More'][i];target.style.cssText=`position:fixed;left:16px;top:${16+i*60}px;width:160px;min-height:40px`;const parts=selector.split(' ');const apply=(el,s)=>s.startsWith('#')?el.id=s.slice(1):el.className=s.slice(1);if(parts.length===2){apply(parent,parts[0]);apply(target,parts[1]);parent.append(target);document.body.append(parent);}else{apply(target,selector);document.body.append(target);}});window.intro.startIntro(tour);},tour);
  const total=await page.locator('.intro-dots i').count();for(let step=1;step<=total;step++){await page.waitForTimeout(650);await page.screenshot({path:`${root}/${version}/${theme}-${width}-tour-${tour}-${step}.png`,animations:'disabled'});if(step<total)await page.keyboard.press('ArrowRight');}
  await page.evaluate(()=>window.intro.stopIntro());await page.waitForTimeout(400);
 }
 console.log(version,theme,width,'all tour steps captured');await context.close();
}}finally{await browser.close();}
