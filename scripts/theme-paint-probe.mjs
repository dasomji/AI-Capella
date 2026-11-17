/** Runs inside the page. Record the complete matrix, then classify browser initial paints. */
export async function probeThemePaints({baseline, theme}) {
  const api=await import('/src/design-system/theme/index.ts');
  const elements=[...document.querySelectorAll('*')];
  const properties=['color','background-color','background-image','border-top-color','border-right-color','border-bottom-color','border-left-color','outline-color','column-rule-color','box-shadow','text-shadow','fill','stroke','filter','backdrop-filter','caret-color','accent-color','text-decoration-color','-webkit-text-fill-color','-webkit-text-stroke-color','flood-color','lighting-color','stop-color'];
  const pseudos=[null,'::before','::after'];
  const sample=()=>elements.flatMap(element=>pseudos.map(pseudo=>{
    const style=getComputedStyle(element,pseudo);
    return {content:style.content,borders:['top','right','bottom','left'].map(edge=>style.getPropertyValue('border-'+edge+'-style')),outline:style.outlineStyle,column:style.columnRuleStyle,...Object.fromEntries(properties.map(property=>[property,style.getPropertyValue(property)]))};
  }));
  api.setThemePreference(baseline);await new Promise(r=>setTimeout(r,40));const before=sample();
  api.setThemePreference(theme);await new Promise(r=>setTimeout(r,40));const after=sample();
  // CSS initial paints are not authored UI colors. Keep this list property/element-specific.
  function browserDefault(paint) {
    if(paint.pseudo&&['none','normal'].includes(paint.contentBefore)&&['none','normal'].includes(paint.contentAfter))return 'CSS initial pseudo-element without a generated box';
    if(paint.pseudo&&paint.contentBefore==='""'&&paint.contentAfter==='""'&&paint.before==='rgb(255, 255, 255)'){
      if(['color','caret-color','text-decoration-color','-webkit-text-fill-color','-webkit-text-stroke-color'].includes(paint.property))return 'Dark-scheme initial text paint on an empty generated decoration';
      const edge=['border-top-color','border-right-color','border-bottom-color','border-left-color'].indexOf(paint.property);
      if(edge>=0&&paint.borders[edge]==='none'||paint.property==='outline-color'&&paint.outline==='none'||paint.property==='column-rule-color'&&paint.column==='none')return 'Initial currentColor on a decoration without that stroke';
    }
    if(paint.tag==='fieldset'&&/^border-(top|right|bottom|left)-color$/.test(paint.property)&&paint.before==='rgb(107, 107, 107)')return 'Chromium dark native fieldset groove border';
    if((paint.tag==='option'||paint.nativeSelect)&&['rgb(255, 255, 255)','rgb(107, 107, 107)','rgb(133, 133, 133)'].includes(paint.before))return 'Chromium dark native option/select palette (showcase switcher or OS menu option)';
    if(paint.coverage&&['fill','stroke'].includes(paint.property)&&['rgb(0, 0, 0)','none'].includes(paint.before))return 'SVG initial coverage paint inside definitions/masks (geometry, not display pigment)';
    if(paint.svg&&paint.lineGeometry&&paint.property==='fill'&&paint.before==='rgb(0, 0, 0)')return 'SVG initial black fill on a straight open path with zero fill area';
    if(!paint.before||['none','auto','normal'].includes(paint.before))return 'CSS initial non-paint';
    if(paint.before==='rgba(0, 0, 0, 0)')return 'CSS initial transparent ground';
    if(['fill','stroke'].includes(paint.property)&&(!paint.svg||paint.pseudo||['svg','g','defs','clippath','mask','symbol','use'].includes(paint.tag))&&['rgb(0, 0, 0)','none'].includes(paint.before))return 'SVG initial fill/stroke on a non-painting HTML/container node';
    if(['flood-color','lighting-color','stop-color'].includes(paint.property)&&!['feflood','fediffuselighting','fespecularlighting','stop'].includes(paint.tag)&&['rgb(0, 0, 0)','rgb(255, 255, 255)'].includes(paint.before))return 'SVG filter initial color on an element without that paint operation';
    return null;
  }
  function zeroFillArea(element) {
    const tag=element.tagName.toLowerCase();if(tag==='line')return true;if(tag!=='path')return false;
    const subpaths=(element.getAttribute('d')??'').match(/[Mm][^Mm]*/g)??[];
    return subpaths.length>0&&subpaths.every(part=>{const commands=part.match(/[a-df-z]/gi)??[];return commands.every(c=>/[mh]/i.test(c))||commands.every(c=>/[mv]/i.test(c))||commands.length===2&&/[m]/i.test(commands[0])&&/[l]/i.test(commands[1]);});
  }
  const matrix=[],unchanged=[],defaultCounts=new Map();
  for(let index=0;index<before.length;index++) {
    const element=elements[Math.floor(index/pseudos.length)],pseudo=pseudos[index%pseudos.length];
    const metadata={element:element.id||element.getAttribute('data-ds')||element.tagName,path:element.tagName+(element.className?.baseVal??(typeof element.className==='string'?'.'+element.className.split(' ').filter(c=>!c.startsWith('tw:')).join('.'):'')),pseudo,nativeSelect:element.tagName==='SELECT'&&!element.classList.contains('ds-reset'),svg:element.namespaceURI==='http://www.w3.org/2000/svg',tag:element.tagName.toLowerCase(),coverage:!!element.closest('clipPath,mask,defs'),lineGeometry:zeroFillArea(element),html:element.outerHTML.slice(0,600)};
    matrix.push({...metadata,before:before[index],after:after[index]});
    for(const property of properties) {
      const value=before[index][property];
      if(value!==after[index][property]||!/(?:rgb|hsl|#[a-f\d]{3})/i.test(value))continue;
      const paint={...metadata,property,before:value,after:after[index][property],contentBefore:before[index].content,contentAfter:after[index].content,borders:before[index].borders,outline:before[index].outline,column:before[index].column};
      const reason=browserDefault(paint);
      if(!reason)unchanged.push(paint);
      else {const key=JSON.stringify([reason,property,value]);const prior=defaultCounts.get(key)??{reason,property,value,count:0};prior.count++;defaultCounts.set(key,prior);}
    }
  }
  const compressed=new Uint8Array(await new Response(new Blob([JSON.stringify(matrix)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  let encoded='';for(let i=0;i<compressed.length;i+=32768)encoded+=String.fromCharCode(...compressed.subarray(i,i+32768));
  return {elements:elements.length,pseudos:pseudos.length,properties,paints:btoa(encoded),paintCount:elements.length*pseudos.length*properties.length,defaults:[...defaultCounts.values()],unchanged};
}
