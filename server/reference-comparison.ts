import { JSDOM } from 'jsdom';
import { XMLValidator } from 'fast-xml-parser';
import { children, text } from '../src/score-validation';
export const categories=['notes','pitch','onset','duration','rests','measures','key','time','clef','lyrics','ties'] as const;
type Category=typeof categories[number];
export type Metric={precision:number;recall:number;f1:number;matched:number;predicted:number;reference:number};
type Part={name:string;measures:Record<Category,string[]>[]};
const empty=()=>Object.fromEntries(categories.map(c=>[c,[] as string[]])) as Record<Category,string[]>;
const normalized=(s:string)=>s.normalize('NFC').trim().replace(/\s+/g,' ').toLowerCase();
function parse(xml:string):Part[]{
 if(/<!DOCTYPE|<!ENTITY/i.test(xml)||XMLValidator.validate(xml)!==true)throw Error('Unsafe or malformed MusicXML');
 const dom=new JSDOM(xml,{contentType:'text/xml'});
 try{
 const doc=dom.window.document;if(doc.documentElement.tagName!=='score-partwise')throw Error('Expected score-partwise');
 return children(doc.documentElement,'part').map(part=>{
 const declaration=Array.from(doc.querySelectorAll('score-part')).find(p=>p.id===part.id);
 const name=normalized(declaration?text(declaration,'part-name'):'')||part.id;
 let divisions=1;const state=new Map<string,string>();
 const measures=children(part,'measure').map(measure=>{
 const out=empty();out.measures.push('measure');let cursor=0;const chordOnsets=new Map<string,number>();const ordinals=new Map<string,number>();
 for(const item of Array.from(measure.children)){
 if(item.tagName==='attributes'){
 if(text(item,'divisions'))divisions=Number(text(item,'divisions'));
 if(!(divisions>0))throw Error('Invalid divisions');
 for(const c of ['key','time','clef'] as const)for(const el of children(item,c))state.set(c+':'+(el.getAttribute('number')??'1'),JSON.stringify(Array.from(el.children).map(e=>[e.tagName,e.textContent?.trim()])));
 }else if(item.tagName==='backup')cursor-=Number(text(item,'duration'))/divisions;
 else if(item.tagName==='forward')cursor+=Number(text(item,'duration'))/divisions;
 else if(item.tagName==='note'){
 const voice=(text(item,'staff')||'1')+':'+(text(item,'voice')||'1');
 const onset=item.querySelector('chord')?(chordOnsets.get(voice)??cursor):cursor;
 const duration=Number(text(item,'duration')||0)/divisions;
 if(!Number.isFinite(onset)||!Number.isFinite(duration)||duration<0)throw Error('Invalid timing');
 const pitch=item.querySelector('rest')?'rest':item.querySelector('unpitched')?'unpitched:'+text(item,'unpitched'):text(item,'pitch > step')+':'+(text(item,'pitch > alter')||'0')+':'+text(item,'pitch > octave');
 const round=(n:number)=>Math.round(n*1e6)/1e6;
 const anchor=voice+':'+round(onset);const order=ordinals.get(voice)??0;ordinals.set(voice,order+1);
 out.notes.push(JSON.stringify([anchor,pitch,round(duration)]));
 out.pitch.push(JSON.stringify([anchor,pitch]));out.onset.push(JSON.stringify([voice,order,round(onset)]));out.duration.push(JSON.stringify([anchor,round(duration)]));
 if(pitch==='rest')out.rests.push(JSON.stringify([anchor,round(duration)]));
 for(const lyric of children(item,'lyric'))out.lyrics.push(JSON.stringify([anchor,lyric.getAttribute('number')??'1',text(lyric,'syllabic')||'single',text(lyric,'text').normalize('NFC')]));
 for(const tie of children(item,'tie'))out.ties.push(JSON.stringify([anchor,pitch,tie.getAttribute('type')]));
 chordOnsets.set(voice,onset);if(!item.querySelector('chord')&&!item.querySelector('grace'))cursor+=duration;
 }
 }
 for(const [key,value] of state)out[key.split(':')[0] as 'key'|'time'|'clef'].push(key+value);
 return out;
 });return {name,measures};
 });
 }finally{dom.window.close();}
}
function intersection(a:string[],b:string[]){const counts=new Map<string,number>();for(const s of b)counts.set(s,(counts.get(s)??0)+1);let matched=0;for(const s of a)if(counts.get(s)){matched++;counts.set(s,counts.get(s)!-1);}return matched;}
/** Exact multiset comparison within ordinal measures/voices. Printed measure numbers and part order are ignored. */
export function compareMusicXML(predictedXML:string,referenceXML:string){
 const predicted=parse(predictedXML),reference=parse(referenceXML);const totals=Object.fromEntries(categories.map(c=>[c,{matched:0,predicted:0,reference:0}])) as Record<Category,{matched:number;predicted:number;reference:number}>;
 const used=new Set<Part>();const edits=new Set<string>();const ambiguities:string[]=[];
 const pairs:([Part|undefined,Part|undefined])[]=reference.map(r=>{
 const candidates=predicted.filter(p=>p.name===r.name&&!used.has(p));if(candidates.length>1)ambiguities.push(r.name);
 // Duplicate names are paired by musical fingerprint, then deterministically. Ambiguity remains explicit.
 const p=candidates.find(p=>JSON.stringify(p.measures)===JSON.stringify(r.measures))??candidates[0];if(p)used.add(p);return [p,r];
 });for(const p of predicted)if(!used.has(p))pairs.push([p,undefined]);
 pairs.forEach(([p,r],part)=>{for(let m=0;m<Math.max(p?.measures.length??0,r?.measures.length??0);m++)for(const category of categories){
 const a=p?.measures[m]?.[category]??[],b=r?.measures[m]?.[category]??[];const matched=intersection(a,b);const t=totals[category];t.matched+=matched;t.predicted+=a.length;t.reference+=b.length;if(matched<a.length||matched<b.length)edits.add(part+':'+m);
 }});
 const metrics=Object.fromEntries(categories.map(c=>{const t=totals[c];const precision=t.predicted?t.matched/t.predicted:t.reference?0:1;const recall=t.reference?t.matched/t.reference:t.predicted?0:1;return [c,{...t,precision,recall,f1:precision+recall?2*precision*recall/(precision+recall):0}];})) as Record<Category,Metric>;
 return {metrics,reviewEffort:{measuresNeedingEdits:edits.size,partMeasurePositions:[...edits]},ambiguities,qualityPass:null};
}
