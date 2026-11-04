import { JSDOM } from 'jsdom';
import { XMLValidator } from 'fast-xml-parser';
import { children,text,validateMusicDocument,type MeasureSource } from '../src/score-validation';
import { ProviderError,type JobAssembler,type PageResult } from './transcription-provider.server';
export function scoreDocument(xml:string){
 if(/<!DOCTYPE|<!ENTITY/i.test(xml)||XMLValidator.validate(xml)!==true)throw new ProviderError('invalid_output');
 const dom=new JSDOM(xml,{contentType:'text/xml'});if(dom.window.document.documentElement.tagName!=='score-partwise'){dom.window.close();throw new ProviderError('invalid_output');}return dom;
}
const identity=(p:Element)=>[text(p,'part-name').trim().toLowerCase(),text(p,'score-instrument > instrument-name').trim().toLowerCase()].join('|');
export class ScoreAssembler implements JobAssembler {
 async assemble(pages:PageResult[]){return (await this.assembleDetailed(pages)).xml;}
 async assembleDetailed(pages:PageResult[]){
 const output=new JSDOM('<score-partwise version="4.0"><part-list/></score-partwise>',{contentType:'text/xml'});const doc=output.window.document;const root=doc.documentElement;const list=doc.querySelector('part-list')!;
 const registry:newPart[]=[];const provenance:MeasureSource[]=[];let total=0;
 type newPart={id:string;identity:string;clef:string;declaration:Element;element:Element;attributes?:Element};
 try{
 for(const [pageIndex,page] of pages.entries()){
 const dom=scoreDocument(page.musicxmlFragment);
 try{
 const source=dom.window.document;const mapped=new Map<string,Element>();
 for(const declaration of Array.from(source.querySelectorAll('part-list > score-part'))){
 const local=children(source.documentElement,'part').find(p=>p.id===declaration.id);if(!local)throw new ProviderError('invalid_output');
 const name=identity(declaration),clef=text(local,'clef');
 // Context ids are trusted only with corroborating identity. Never match by order.
 let entry=registry.find(p=>p.id===declaration.id&&p.identity===name);
 if(!entry){const candidates=registry.filter(p=>p.identity===name&&(!p.clef||!clef||p.clef===clef)&&!mapped.has(p.id));if(candidates.length===1)entry=candidates[0];}
 if(!entry){let id=declaration.id||'P1';while(registry.some(p=>p.id===id))id+='n';const copy=doc.importNode(declaration,true);copy.id=id;list.append(copy);const element=doc.createElement('part');element.id=id;root.append(element);entry={id,identity:name,clef,declaration:copy,element};registry.push(entry);}
 if(mapped.has(entry.id))throw new ProviderError('invalid_output');mapped.set(entry.id,local);
 }
 if(children(source.documentElement,'part').length!==mapped.size)throw new ProviderError('invalid_output');
 const width=Math.max(0,...[...mapped.values()].map(p=>children(p,'measure').length));if(!width)throw new ProviderError('invalid_output');
 const templates=Array.from({length:width},(_,i)=>[...mapped.values()].map(p=>children(p,'measure')[i]).find(Boolean)!);
 for(const entry of registry){
 const local=mapped.get(entry.id);const measures=local?children(local,'measure'):[];
 // A new part receives rests for every preceding measure, carrying its initial clef.
 if(!entry.element.children.length&&total){const initial=measures[0]?.querySelector('attributes');for(let i=0;i<total;i++){const template=children(registry[0].element,'measure')[i];entry.element.append(restMeasure(doc,template,i+1,initial??undefined));}}
 for(let i=0;i<width;i++){
 const measure=measures[i];const copy=measure?doc.importNode(measure,true):restMeasure(doc,templates[i],total+i+1,entry.attributes);
 copy.setAttribute('number',String(total+i+1));entry.element.append(copy);
 const attributes=copy.querySelector('attributes');if(attributes)entry.attributes=attributes;
 provenance.push({measure:total+i+1,part:entry.id,page:pageIndex+1,localMeasure:measure?.getAttribute('number')??templates[i].getAttribute('number')??String(i+1),model:page.model,promptVersion:page.promptVersion??'transcription-v1',synthetic:!measure});
 }
 }
 total+=width;
 }finally{dom.window.close();}
 }
 // Backfilled measures also receive explicit synthetic provenance.
 for(const entry of registry)for(let i=0;i<total;i++)if(!provenance.some(p=>p.part===entry.id&&p.measure===i+1)){const template=provenance.find(p=>p.measure===i+1)!;provenance.push({...template,part:entry.id,synthetic:true});}
 const report=validateMusicDocument(doc,provenance,pages.flatMap(p=>[...p.uncertainties,...(p.flags??[]).map(flag=>({flag}))]));
 return {xml:root.outerHTML,provenance,report};
 }finally{output.window.close();}
 }
}
function restMeasure(doc:Document,template:Element,number:number,attributes?:Element){
 const measure=doc.createElement('measure');measure.setAttribute('number',String(number));
 const a=attributes??template.querySelector('attributes');if(a)measure.append(doc.importNode(a,true));
 const note=doc.createElement('note');const rest=doc.createElement('rest');rest.setAttribute('measure','yes');note.append(rest);
 const div=Number(a?text(a,'divisions'):1)||1;const beats=Number(a?text(a,'time > beats'):4)||4;const beatType=Number(a?text(a,'time > beat-type'):4)||4;
 const duration=doc.createElement('duration');duration.textContent=String(div*beats*4/beatType);note.append(duration);const voice=doc.createElement('voice');voice.textContent='1';note.append(voice);measure.append(note);return measure;
}
