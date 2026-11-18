/** Page-side effective-target audit. Hidden native switch/checkbox inputs use their clickable
 * associated label. Links nested in an actually clickable row use that row's hit area.
 * No size exceptions are granted to specialized music controls: their real pseudo hit area
 * must reach 44px and survive edge hit tests. There are no per-screen size exemptions.
 * Disabled controls and focusable scroll regions are not pointer actions.
 */
export function auditTouchTargets() {
 const targets=[],failures=[];
 const modal=document.querySelector('dialog[open]:last-of-type');
 for(const el of (modal??document).querySelectorAll('button,a[href],input:not([type=hidden]),select,textarea,summary,[role=button],[role=switch],[role=checkbox],[tabindex]')){
  if(el.matches(':disabled,[aria-disabled=true],[tabindex="-1"]'))continue;
  if(el.matches('[tabindex]')&&!el.matches('button,a,input,select,textarea,summary,[role=button],[role=switch],[role=checkbox]'))continue; // Scroll regions are focusable, not pointer actions.
  const cs=getComputedStyle(el),box=el.getBoundingClientRect();
  if(!el.checkVisibility({checkVisibilityCSS:true})||!box.width||!box.height||cs.pointerEvents==='none')continue;
  let owner=el;
  if(el.matches('input')&&el.labels?.length)owner=[...el.labels].find(l=>l.getBoundingClientRect().width>=44&&l.getBoundingClientRect().height>=44)??el;
  if(el.matches('a')&&el.closest('tr[data-href]'))owner=el.closest('tr[data-href]');
  let b=owner.getBoundingClientRect(),rect={x:b.x,y:b.y,width:b.width,height:b.height};
  for(const pseudo of ['::before','::after']){
   const p=getComputedStyle(owner,pseudo);
   if(p.content==='none'||p.content==='normal'||p.position!=='absolute'||p.pointerEvents==='none')continue;
   const w=parseFloat(p.width),h=parseFloat(p.height),left=parseFloat(p.left),top=parseFloat(p.top);
   if(w>=44&&h>=44&&Number.isFinite(left)&&Number.isFinite(top)){
    const [tx='0',ty='0']=p.translate==='none'?[]:p.translate.split(' '),offset=(v,size)=>parseFloat(v)*(v.endsWith('%')?size/100:1);
    const m=new DOMMatrix(p.transform==='none'?undefined:p.transform);
    rect={x:b.x+left+offset(tx,w)+m.m41,y:b.y+top+offset(ty,h)+m.m42,width:w,height:h};
   }
  }
  const label=(el.getAttribute('aria-label')||el.textContent||el.getAttribute('name')||el.id||el.tagName).trim().slice(0,90);
  const record={tag:el.tagName,id:el.id,label,width:rect.width,height:rect.height,owner:owner.tagName,pseudo:rect.width!==b.width||rect.height!==b.height};
  const small=rect.width<43.99||rect.height<43.99;
  // Verify that extensions are clickable at both extremes, not only generated geometry.
  const samples=record.pseudo?[[rect.x+1,rect.y+1],[rect.x+rect.width-1,rect.y+rect.height-1]]:[];
  const blocked=samples.some(([x,y])=>x>=0&&y>=0&&x<innerWidth&&y<innerHeight&&!owner.contains(document.elementFromPoint(x,y))&&document.elementFromPoint(x,y)!==owner);
  targets.push(record);if(small||blocked)failures.push({...record,reason:small?'below 44px':'extended target intercepted'});
 }
 return {targets,failures};
}
