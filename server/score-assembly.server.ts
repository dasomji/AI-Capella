// @ts-ignore shared with the plain Node score worker
import { cleanMusicXML,normalizeTimewise } from './musicxml-input.mjs';
import { JSDOM } from 'jsdom';
import { XMLBuilder, XMLValidator } from 'fast-xml-parser';
import { children,text,validateMusicDocument,type MeasureSource } from '../src/score-validation';
import { ProviderError,type JobAssembler,type PageResult } from './transcription-provider.server';
export function scoreDocument(xml:string){
 try{xml=cleanMusicXML(xml,true);}catch{throw new ProviderError('invalid_output',true);}
 if(XMLValidator.validate(xml)!==true)throw new ProviderError('invalid_output');
 let depth=0;for(const tag of xml.matchAll(/<([^>]+)>/g)){const t=tag[1];if(t.startsWith('/') )depth--;else if(!t.startsWith('?')&&!t.startsWith('!')&&!t.endsWith('/'))depth++;if(depth>256)throw new ProviderError('invalid_output',true);}
 const dom=new JSDOM(xml,{contentType:'text/xml'});normalizeTimewise(dom.window.document);if(dom.window.document.documentElement.tagName!=='score-partwise'){dom.window.close();throw new ProviderError('invalid_output');}return dom;
}
export const normalizePartName=(name:string)=>name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/soprano?|sopran|s(?=\s*\d)/g,'soprano').replace(/alto?|alt|a(?=\s*\d)/g,'alto').replace(/tenore?|t(?=\s*\d)/g,'tenor').replace(/basso?|bass|b(?=\s*\d)/g,'bass').replace(/[^a-z0-9]/g,'');
const identity=(p:Element)=>normalizePartName(text(p,'part-name'));
const clefIdentity=(p:Element)=>Array.from(p.querySelectorAll('attributes > clef')).map(c=>[c.getAttribute('number')??'1',text(c,'sign').trim(),text(c,'line').trim(),text(c,'clef-octave-change').trim()||'0'].join(':')).sort().join('|');
/** Page validation uses the same parser/validator as assembly; inherited attributes come from context. */
export function validatePage(page:PageResult, prior:PageResult[]=[]){
 if(page.flags?.includes('no_music'))return 'skipped';
 const dom=scoreDocument(page.musicxmlFragment);
 try{
 const doc=dom.window.document;
 if(page.flags?.includes('no_music') || (!doc.querySelector('part')&&!doc.querySelector('score-part'))){page.flags=[...new Set([...(page.flags??[]),'no_music'])];return 'skipped';}
 if(!doc.querySelector('note'))throw new ProviderError('invalid_output',true);
 for(const part of children(doc.documentElement,'part')){
 const inherited=doc.createElement('attributes');
 const checkpoint=prior.at(-1)?.contextState;
 if(checkpoint){const name=identity(Array.from(doc.querySelectorAll('score-part')).find(p=>p.id===part.id)??part);const state=checkpoint.parts.find(p=>p.id===part.id)??checkpoint.parts.find(p=>normalizePartName(String(p.name))===name);if(state){const fields=Object.fromEntries(['divisions','key','time','clef'].filter(k=>state[k]!==undefined).map(k=>[k,state[k]]));const d=scoreDocument('<score-partwise><part-list/><part><measure>'+new XMLBuilder({ignoreAttributes:false}).build({attributes:fields})+'</measure></part></score-partwise>');try{for(const child of Array.from(d.window.document.querySelector('attributes')!.children))inherited.append(doc.importNode(child,true));}finally{d.window.close();}}}
 else for(const previous of prior){const d=scoreDocument(previous.musicxmlFragment);try{const local=children(d.window.document.documentElement,'part').find(p=>p.id===part.id);if(local)for(const a of Array.from(local.querySelectorAll('measure > attributes')))for(const child of Array.from(a.children)){for(const old of children(inherited,child.tagName))old.remove();inherited.append(doc.importNode(child,true));}}finally{d.window.close();}}

 const first=children(part,'measure')[0];if(first){const own=first.querySelector('attributes');for(const child of Array.from(inherited.children))if(!own?.querySelector(child.tagName)){const a=own??doc.createElement('attributes');if(!own)first.prepend(a);a.append(child);}}
 }
 const report=validateMusicDocument(doc);
 // Later pages may omit attributes already supplied by preceding notation.
 const errors=report.errors;
 if(errors.length)throw new ProviderError('invalid_output',true);
 return 'completed';
 }finally{dom.window.close();}
}
/** Maximum-weight one-to-one assignment, including an unmatched slot per row. */
export function assignParts(weights:number[][]):number[]{
 const n=weights.length,m=(weights[0]?.length??0)+n,u=Array(n+1).fill(0),v=Array(m+1).fill(0),p=Array(m+1).fill(0),way=Array(m+1).fill(0);
 for(let i=1;i<=n;i++){p[0]=i;let j0=0;const min=Array(m+1).fill(Infinity),used=Array(m+1).fill(false);do{used[j0]=true;const i0=p[j0];let delta=Infinity,j1=0;for(let j=1;j<=m;j++)if(!used[j]){const cost=-(weights[i0-1]?.[j-1]??0)-u[i0]-v[j];if(cost<min[j]){min[j]=cost;way[j]=j0;}if(min[j]<delta){delta=min[j];j1=j;}}for(let j=0;j<=m;j++)if(used[j]){u[p[j]]+=delta;v[j]-=delta;}else min[j]-=delta;j0=j1;}while(p[j0]!==0);do{const j1=way[j0];p[j0]=p[j1];j0=j1;}while(j0);}
 const result=Array(n).fill(-1);for(let j=1;j<=m;j++)if(p[j]&&j<=m-n&&weights[p[j]-1][j-1]>0)result[p[j]-1]=j-1;return result;
}
export class ScoreAssembler implements JobAssembler {
 async assemble(pages:PageResult[]){return (await this.assembleDetailed(pages)).xml;}
 async assembleDetailed(pages:PageResult[]){
 const clock=performance.now();let parseMs=0,mergeMs=0;
 const output=new JSDOM('<score-partwise version="4.0"><part-list/></score-partwise>',{contentType:'text/xml'});const doc=output.window.document;const root=doc.documentElement;const list=doc.querySelector('part-list')!;
 const registry:newPart[]=[];const provenance:MeasureSource[]=[];let total=0;const identityWarnings:import('../src/score-validation').Diagnostic[]=[];const skippedPages:number[]=[];
 type newPart={id:string;identity:string;clef:string;declaration:Element;element:Element;attributes?:Element;measureAttributes:Element[]};
 try{
 for(const [pageIndex,page] of pages.entries()){
 if(page.flags?.includes('no_music')){skippedPages.push(pageIndex+1);continue;}
 const pageClock=performance.now();const dom=scoreDocument(page.musicxmlFragment);parseMs+=performance.now()-pageClock;const mergeClock=performance.now();
 try{
 const source=dom.window.document;if(!source.querySelector('part')&&!source.querySelector('score-part')){skippedPages.push(pageIndex+1);continue;}if(total===0)for(const child of Array.from(source.documentElement.children))if(!['part','part-list'].includes(child.tagName))root.insertBefore(doc.importNode(child,true),list);const mapped=new Map<string,Element>();
 const sourceParts=new Map(children(source.documentElement,'part').map(p=>[p.id,p]));
 const declarations=Array.from(source.querySelectorAll('part-list > score-part')).sort((a,b)=>a.id.localeCompare(b.id));
 const weights=declarations.map(d=>{const local=sourceParts.get(d.id);const clef=local?clefIdentity(local):'';return registry.map(p=>(p.clef&&clef&&p.clef!==clef)?-100000:(p.id===d.id?1000:0)+(p.identity===identity(d)?100:0));});
 const assignments=assignParts(weights);
 for(const [declarationIndex,declaration] of declarations.entries()){ 
 const local=sourceParts.get(declaration.id);if(!local)throw new ProviderError('invalid_output',true);
 const name=identity(declaration),clef=clefIdentity(local);
 let entry=assignments[declarationIndex]>=0?registry[assignments[declarationIndex]]:undefined;
 const row=weights[declarationIndex],best=Math.max(0,...row);if(best>0&&row.filter(w=>w===best).length>1)identityWarnings.push({code:'ambiguous_part_identity',part:declaration.id,measure:total+1});
 if(!entry){let id=declaration.id||'P1';while(registry.some(p=>p.id===id))id+='n';const copy=doc.importNode(declaration,true);copy.id=id;list.append(copy);const element=doc.createElement('part');element.id=id;root.append(element);entry={id,identity:name,clef,declaration:copy,element,measureAttributes:[]};if(total)identityWarnings.push({code:'new_part_identity',part:id,measure:total+1,message:`part ${id} first appears on page ${pageIndex+1}`} as import('../src/score-validation').Diagnostic);registry.push(entry);}
 mapped.set(entry.id,local);
 }
 if(children(source.documentElement,'part').length!==mapped.size)throw new ProviderError('invalid_output');
 const width=Math.max(0,...[...mapped.values()].map(p=>children(p,'measure').length));if(!width)throw new ProviderError('invalid_output');
 const pageMeasures=new Map([...mapped].map(([id,p])=>[id,children(p,'measure')]));
 const templates=Array.from({length:width},(_,i)=>[...pageMeasures.values()].map(ms=>ms[i]).find(Boolean)!);
 const effective=new Map<Element,Element>();for(const ms of pageMeasures.values()){let state:Element|undefined;for(const m of ms){state=mergeAttributes(doc,state,m.querySelector('attributes'));effective.set(m,state);}}
 const templateAttributes=templates.map(t=>effective.get(t)!);
 for(const entry of registry){
 const local=mapped.get(entry.id);const measures=pageMeasures.get(entry.id)??[];
 // A new part receives rests for every preceding measure, carrying its initial clef.
 if(!entry.element.children.length&&total){const initial=measures[0]?.querySelector('attributes');const earlier=children(registry[0].element,'measure');for(let i=0;i<total;i++){const template=earlier[i];entry.element.append(restMeasure(doc,template,i+1,initial??undefined,registry[0].measureAttributes[i]));entry.measureAttributes.push(registry[0].measureAttributes[i]);}}
 for(let i=0;i<width;i++){
 const measure=measures[i];const copy=measure?doc.importNode(measure,true):restMeasure(doc,templates[i],total+i+1,entry.attributes,templateAttributes[i]);
 copy.setAttribute('number',String(total+i+1));entry.element.append(copy);
 const attributes=copy.querySelector('attributes');if(attributes)entry.attributes=mergeAttributes(doc,entry.attributes,attributes);entry.measureAttributes.push(entry.attributes??doc.createElement('attributes'));
 provenance.push({measure:total+i+1,part:entry.id,page:pageIndex+1,localMeasure:measure?.getAttribute('number')??templates[i].getAttribute('number')??String(i+1),model:page.model,promptVersion:page.promptVersion??'transcription-v1',synthetic:!measure});
 }
 }
 total+=width;
 }finally{dom.window.close();mergeMs+=performance.now()-mergeClock;}
 }
 // Backfilled measures also receive explicit synthetic provenance.
 const seen=new Set(provenance.map(p=>p.part+':'+p.measure));const byMeasure=new Map(provenance.map(p=>[p.measure,p]));
 for(const entry of registry)for(let i=0;i<total;i++)if(!seen.has(entry.id+':'+(i+1))){const template=byMeasure.get(i+1)!;provenance.push({...template,part:entry.id,synthetic:true});}
 const validationClock=performance.now();
 const report=validateMusicDocument(doc,provenance,pages.flatMap((p,index)=>[...p.uncertainties,...(p.flags??[]).map(flag=>({flag,page:index+1}))]));
 for(const source of provenance)if(source.synthetic)report.warnings.push({code:'inferred_tacet_rest',part:source.part,measure:source.measure,source});
 report.warnings.push(...identityWarnings,...skippedPages.map(page=>({code:'skipped_page',page})));
 const validationMs=performance.now()-validationClock;const serializationClock=performance.now();const xml=root.outerHTML;
 return {xml,provenance:compressSyntheticSources(provenance),report,skippedPages,profile:{parseMs:Math.round(parseMs),mergeMs:Math.round(mergeMs),validationMs:Math.round(validationMs),serializationMs:Math.round(performance.now()-serializationClock),totalMs:Math.round(performance.now()-clock)}};
 }finally{output.window.close();}
 }
}
function restMeasure(doc:Document,template:Element,number:number,attributes?:Element,templateState?:Element){
 const measure=doc.createElement('measure');measure.setAttribute('number',String(number));
 const templateAttrs=templateState?doc.importNode(templateState,true):effectiveAttributes(doc,template);for(const child of Array.from(templateAttrs.children))if(child.tagName!=='time')child.remove();
 if(!attributes?.querySelector('divisions')){const d=doc.createElement('divisions');d.textContent='1';templateAttrs.prepend(d);}
 const a=mergeAttributes(doc,attributes,templateAttrs);if(a)measure.append(doc.importNode(a,true));
 const note=doc.createElement('note');const rest=doc.createElement('rest');rest.setAttribute('measure','yes');note.append(rest);
 const div=Number(a?text(a,'divisions'):1)||1;const beats=Number(a?text(a,'time > beats'):4)||4;const beatType=Number(a?text(a,'time > beat-type'):4)||4;
 const duration=doc.createElement('duration');duration.textContent=String(div*beats*4/beatType);note.append(duration);const voice=doc.createElement('voice');voice.textContent='1';note.append(voice);measure.append(note);return measure;
}

function mergeAttributes(doc:Document,prior:Element|undefined,next:Element|undefined|null){
 const out=doc.createElement('attributes');
 for(const source of [prior,next])if(source)for(const child of Array.from(source.children)){
 const number=child.getAttribute('number');const old=Array.from(out.children).find(c=>c.tagName===child.tagName&&c.getAttribute('number')===number);old?.remove();out.append(doc.importNode(child,true));
 }return out;
}
function effectiveAttributes(doc:Document,measure:Element){
 let state:Element|undefined;const siblings=measure.parentElement?children(measure.parentElement,'measure'):[measure];
 for(const sibling of siblings){state=mergeAttributes(doc,state,sibling.querySelector('attributes'));if(sibling===measure)break;}
 return state??doc.createElement('attributes');
}

/** endMeasure/localMeasureEnd are inclusive; actual recognized measures remain individual. */
export function compressSyntheticSources(sources:MeasureSource[]){
 const result:(MeasureSource&{endMeasure?:number;localMeasureEnd?:string})[]=[];
 const sorted=[...sources].sort((a,b)=>a.part.localeCompare(b.part)||a.measure-b.measure);
 for(const source of sorted){const last=result.at(-1);if(source.synthetic&&last?.synthetic&&last.part===source.part&&last.page===source.page&&last.model===source.model&&last.promptVersion===source.promptVersion&&(last.endMeasure??last.measure)+1===source.measure){last.endMeasure=source.measure;last.localMeasureEnd=source.localMeasure;}else result.push({...source});}return result;
}
