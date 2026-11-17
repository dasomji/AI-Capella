/** Run in /dev/design-system with Playwright page.evaluate or the shared browser evaluator.
 * Tests real emitted CSS and native focus behavior; throws on a mismatch. No server setup.
 */
export async function verifyDesignSystemPage() {
  for(let attempt=0;attempt<100&&!document.querySelector('[data-renderer=dom] button');attempt++)await new Promise(resolve=>setTimeout(resolve,50));
  await document.fonts.ready;
  const sheet=document.createElement('style');sheet.textContent='[data-specimen] *,[data-specimen] *::before,[data-specimen] *::after {animation:none!important;transition:none!important}';document.head.append(sheet);
  const rows=[...document.querySelectorAll('[data-specimen]')];
  if(rows.length<180) throw Error('Showcase missing primitives');
  const mismatches=[];let elements=0,properties=0;
  for(const row of rows) {
    const a=row.querySelector('[data-renderer="react"]'),b=row.querySelector('[data-renderer="dom"]');
    const react=[...a.querySelectorAll('*')],dom=[...b.querySelectorAll('*')];
    if(react.length!==dom.length) {mismatches.push({name:row.dataset.specimen,structure:[react.length,dom.length]});continue;}
    for(let index=0;index<react.length;index++)for(const pseudo of [null,'::before','::after']) {
      const left=getComputedStyle(react[index],pseudo),right=getComputedStyle(dom[index],pseudo);elements++;
      for(const prop of [...left]) {properties++;if(left.getPropertyValue(prop)!==right.getPropertyValue(prop))mismatches.push({name:row.dataset.specimen,index,pseudo,prop,left:left.getPropertyValue(prop),right:right.getPropertyValue(prop)});}
    }
  }
  const normal=document.querySelector('[data-specimen="button/standard/secondary/default"]');
  const buttons=[...normal.querySelectorAll('button')],previous=buttons.map(e=>getComputedStyle(e).minHeight);
  const original=document.documentElement.style.getPropertyValue('--ds-control-height');
  document.documentElement.style.setProperty('--ds-control-height','57px');
  const after=buttons.map(e=>getComputedStyle(e).minHeight);
  if(original)document.documentElement.style.setProperty('--ds-control-height',original);else document.documentElement.style.removeProperty('--ds-control-height');
  if(after.length!==2||!after.every(value=>value==='57px') || previous.some(value=>value==='57px'))throw Error('Token-only mutation failed '+JSON.stringify({previous,after}));
  sheet.remove();
  return {theme:document.documentElement.dataset.theme,specimens:rows.length,elements,properties,mismatches,tokenChange:{previous,after}};
}
export async function verifyDesignSystemBehavior() {
  const D=await import('/src/design-system/dom/index.ts');
  const B=await import('/src/design-system/behavior/index.ts');
  const assert=(condition,message)=>{if(!condition)throw Error(message);};
  const opener=document.createElement('button');opener.textContent='Opener';document.body.append(opener);opener.focus();
  const first=D.createButton({text:'First'}),last=D.createButton({text:'Last'});const content=document.createElement('div');content.append(first,last);
  const modal=D.createDialog({title:'Behavior',content,behavior:{opener,busy:true}});modal.open();
  assert(document.activeElement===first,'Initial focus');assert(opener.inert,'Inert background');
  last.focus();last.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));assert(document.activeElement===first,'Forward focus wrap');
  first.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));assert(document.activeElement===last,'Backward focus wrap');
  modal.element.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert(modal.element.open,'Busy Escape must stay open');
  modal.element.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:-1,clientY:-1}));assert(modal.element.open,'Busy outside must stay open');
  modal.setBusy(false);modal.element.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
  assert(!modal.element.open&&!opener.inert,'Escape cleanup');assert(document.activeElement===opener,'Focus return');
  const next=D.createSheet({title:'Sheet',body:'Outside closes'});next.open();next.element.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:-1,clientY:-1}));assert(!next.element.open,'Outside policy');
  let selected=0;const menu=D.createMenu({label:'Actions',items:[{label:'Alpha',onSelect:()=>selected++},{label:'Disabled',disabled:true,onSelect:()=>selected++},{label:'Beta',onSelect:()=>selected++}]});document.body.append(menu.element);const items=menu.element.querySelectorAll('button');items[0].focus();
  menu.element.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));assert(document.activeElement===items[2],'Skip disabled menu item');menu.element.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));assert(selected===1,'Keyboard menu activation');
  const busy=D.createButton({text:'Busy',busy:true,onClick:()=>selected++});document.body.append(busy);busy.focus();busy.click();assert(selected===1&&document.activeElement===busy&&!busy.disabled,'Focusable busy guard');
  const existingHost=document.getElementById('toast');
  B.toast('<unsafe text>');assert(document.querySelectorAll('#toast').length===1,'Singleton toast');assert(document.querySelector('#toast').textContent==='<unsafe text>','Safe toast text');B.dismissToast();if(!existingHost)document.getElementById('toast')?.remove();
  menu.dispose();menu.element.remove();opener.remove();busy.remove();
  return {dialogFocus:true,inert:true,tabWrap:true,focusReturn:true,escape:true,outside:true,busyCancel:true,menuKeyboard:true,busyButton:true,toast:true};
}

export async function verifyDesignSystemContexts() {
  await document.fonts.ready;
  const style=document.createElement('style');style.textContent='.ds-specimen-pair>[data-renderer]{width:100%!important;max-width:none!important;padding:0!important;min-height:0!important}[data-specimen] *,[data-specimen] *::before,[data-specimen] *::after{animation:none!important;transition:none!important}';document.head.append(style);
  const a=[...document.querySelectorAll('[data-renderer="react"]')],b=[...document.querySelectorAll('[data-renderer="dom"]')];
  const mismatches=[];let properties=0;
  try {
    for(const el of a)el.classList.add('auth-shell');for(const el of b)el.classList.add('admin-shell');
    for(let i=0;i<a.length;i++){
      const react=[...a[i].querySelectorAll('*')],dom=[...b[i].querySelectorAll('*')];
      for(let j=0;j<react.length;j++)for(const pseudo of [null,'::before','::after']){
        const left=getComputedStyle(react[j],pseudo),right=getComputedStyle(dom[j],pseudo);
        for(const prop of [...left]){properties++;if(left.getPropertyValue(prop)!==right.getPropertyValue(prop))mismatches.push({name:a[i].closest('[data-specimen]').dataset.specimen,index:j,pseudo,prop,left:left.getPropertyValue(prop),right:right.getPropertyValue(prop)});}
      }
    }
  } finally {for(const el of a)el.classList.remove('auth-shell');for(const el of b)el.classList.remove('admin-shell');style.remove();}
  return {theme:document.documentElement.dataset.theme,properties,mismatches};
}
