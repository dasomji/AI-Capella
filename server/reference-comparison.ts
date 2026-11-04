import { JSDOM } from 'jsdom';
import { XMLValidator } from 'fast-xml-parser';
import { children, text } from '../src/score-validation';
export const categories=['notes','pitch','onset','duration','rests','measures','key','time','clef','lyrics','ties'] as const;
type Category=typeof categories[number];
export type Metric={precision:number;recall:number;f1:number;matched:number;predicted:number;reference:number};
type Measure=Record<Category,string[]>;
type Event={m:number;at:number;absolute:number;duration:number;pitch:string;voice:string;rest:boolean;lyrics:string[];start:boolean;stop:boolean};
type Part={name:string;measures:Measure[];fingerprint:string;profile:{pitches:string[];rhythms:string[];clefs:string[];center:number}};
const empty=()=>Object.fromEntries(categories.map(c=>[c,[] as string[]])) as Measure;
const normalized=(s:string)=>s.normalize('NFC').trim().replace(/\s+/g,' ').toLowerCase();
const round=(n:number)=>Math.round(n*1e5)/1e5;
function parse(xml:string):Part[]{
 if(/<!DOCTYPE|<!ENTITY/i.test(xml)||XMLValidator.validate(xml)!==true)throw Error('Unsafe or malformed MusicXML');
 const dom=new JSDOM(xml,{contentType:'text/xml'});
 try{
 const doc=dom.window.document;if(doc.documentElement.tagName!=='score-partwise')throw Error('Expected score-partwise');
 return children(doc.documentElement,'part').map(part=>{
 const declaration=Array.from(doc.querySelectorAll('score-part')).find(p=>p.id===part.id);
 const name=normalized(declaration?text(declaration,'part-name'):'')||part.id;
 let divisions=1,absolute=0;const state=new Map<string,string>();const events:Event[]=[];
 const measures=children(part,'measure').map((measure,m)=>{
 const out=empty();out.measures.push('measure');let cursor=0,end=0;const chords=new Map<string,number>();
 for(const item of Array.from(measure.children)){
 if(item.tagName==='attributes'){
 if(text(item,'divisions'))divisions=Number(text(item,'divisions'));if(!(divisions>0))throw Error('Invalid divisions');
 for(const c of ['key','time','clef'] as const)for(const el of children(item,c)){
 const key=c+':'+(el.getAttribute('number')??'1');const value=JSON.stringify(Array.from(el.children).map(e=>[e.tagName,e.textContent?.trim()]));
 if(state.get(key)!==value)out[c].push(key+value);state.set(key,value);
 }
 }else if(item.tagName==='backup')cursor-=Number(text(item,'duration'))/divisions;
 else if(item.tagName==='forward')cursor+=Number(text(item,'duration'))/divisions;
 else if(item.tagName==='note'){
 const voice=(text(item,'staff')||'1')+':'+(text(item,'voice')||'1');const at=item.querySelector('chord')?(chords.get(voice)??cursor):cursor;
 const duration=Number(text(item,'duration')||0)/divisions;if(!Number.isFinite(at)||!Number.isFinite(duration)||duration<0)throw Error('Invalid timing');
 const rest=!!item.querySelector('rest');const pitch=rest?'rest':item.querySelector('unpitched')?'unpitched:'+text(item,'unpitched'):text(item,'pitch > step')+':'+Number(text(item,'pitch > alter')||0)+':'+text(item,'pitch > octave');
 const lyrics=children(item,'lyric').map(l=>JSON.stringify([l.getAttribute('number')??'1',text(l,'syllabic')||'single',Array.from(l.children).filter(e=>e.tagName==='text'||e.tagName==='elision').map(e=>e.tagName==='elision'?' ':e.textContent??'').join('').normalize('NFC').replace(/\s+/g,' ').trim()]));
 const ties=children(item,'tie');events.push({m,at,absolute:absolute+at,duration,pitch,voice,rest,lyrics,start:ties.some(t=>t.getAttribute('type')==='start'),stop:ties.some(t=>t.getAttribute('type')==='stop')});
 chords.set(voice,at);if(!item.querySelector('chord')&&!item.querySelector('grace'))cursor+=duration;end=Math.max(end,cursor);
 }
 }absolute+=end;return out;
 });
 // Voice labels are local exporter identifiers. Rank streams by their musical content.
 const voices=[...new Set(events.map(e=>e.voice))].sort((a,b)=>{
 const signature=(v:string)=>events.filter(e=>e.voice===v).map(e=>[e.pitch,round(e.duration)]).join('|');return signature(a).localeCompare(signature(b));});
 const voiceIds=new Map(voices.map((v,i)=>[v,i]));const open=new Map<string,Event>();const merged:Event[]=[];
 for(const event of events){const key=event.voice+event.pitch;const prior=open.get(key);
 if(event.stop&&prior&&Math.abs(prior.absolute+prior.duration-event.absolute)<1e-5){prior.duration+=event.duration;prior.lyrics.push(...event.lyrics.filter(l=>!prior.lyrics.includes(l)));prior.start=event.start;if(!event.start)open.delete(key);continue;}
 merged.push(event);if(event.start)open.set(key,event);
 }
 for(const e of merged){const out=measures[e.m],anchor=JSON.stringify([voiceIds.get(e.voice),round(e.at)]);
 if(e.rest){out.rests.push(JSON.stringify([anchor,round(e.duration)]));continue;}
 out.notes.push(JSON.stringify([anchor,e.pitch,round(e.duration)]));out.pitch.push(JSON.stringify([anchor,e.pitch]));out.onset.push(JSON.stringify([anchor,e.pitch]));out.duration.push(JSON.stringify([anchor,round(e.duration)]));
 for(const lyric of e.lyrics)out.lyrics.push(JSON.stringify([anchor,lyric]));
 if(e.start||e.stop)out.ties.push(JSON.stringify([anchor,e.pitch,e.start,e.stop]));
 }
 const fingerprint=JSON.stringify([merged.filter(e=>!e.rest).map(e=>e.pitch).sort(),merged.map(e=>round(e.duration)).sort(),[...state].filter(([k])=>k.startsWith('clef'))]);
 const pitched=merged.filter(e=>!e.rest);const midis=pitched.map(e=>{const [step,alter,octave]=e.pitch.split(':');return Number(octave)*12+({C:0,D:2,E:4,F:5,G:7,A:9,B:11}[step as 'C']??0)+Number(alter);}).filter(Number.isFinite);
 const profile={pitches:pitched.map(e=>e.pitch),rhythms:merged.map(e=>String(round(e.duration))),clefs:[...state].filter(([k])=>k.startsWith('clef')).map(([,v])=>v),center:midis.length?midis.reduce((a,b)=>a+b,0)/midis.length:0};
 return {name,measures,fingerprint,profile};
 });
 }finally{dom.window.close();}
}
const timingTolerance=1e-4;
function equivalent(a:unknown,b:unknown):boolean{
 if(a===b)return true;if(typeof a==='number'&&typeof b==='number')return Math.abs(a-b)<=timingTolerance;
 if(Array.isArray(a)&&Array.isArray(b))return a.length===b.length&&a.every((v,i)=>equivalent(v,b[i]));
 if(typeof a==='string'&&typeof b==='string'&&a.startsWith('[')&&b.startsWith('[')){try{return equivalent(JSON.parse(a),JSON.parse(b));}catch{return false;}}return false;
}
function intersection(a:string[],b:string[]){const counts=new Map<string,number>();for(const s of b)counts.set(s,(counts.get(s)??0)+1);let matched=0;const unmatched:string[]=[];for(const s of a)if(counts.get(s)){matched++;counts.set(s,counts.get(s)!-1);}else unmatched.push(s);
 for(const s of unmatched){const candidate=[...counts.keys()].find(k=>counts.get(k)!>0&&equivalent(s,k));if(candidate!==undefined){matched++;counts.set(candidate,counts.get(candidate)!-1);}}return matched;}

/** Sequence edit alignment: substitutions cost one, insertions/deletions one. */
function align(a:Measure[],b:Measure[]){
 const fingerprint=(m:Measure)=>JSON.stringify([m.notes,m.rests]);const af=a.map(fingerprint),bf=b.map(fingerprint);
 const dp=Array.from({length:a.length+1},()=>new Uint32Array(b.length+1));for(let i=0;i<=a.length;i++)dp[i][0]=i;for(let j=0;j<=b.length;j++)dp[0][j]=j;
 for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)dp[i][j]=Math.min(dp[i-1][j-1]+Number(af[i-1]!==bf[j-1]),dp[i-1][j]+1,dp[i][j-1]+1);
 const pairs:[Measure|undefined,Measure|undefined][]=[];let i=a.length,j=b.length;
 while(i||j){if(i&&j&&dp[i][j]===dp[i-1][j-1]+Number(af[i-1]!==bf[j-1]))pairs.push([a[--i],b[--j]]);else if(i&&dp[i][j]===dp[i-1][j]+1)pairs.push([a[--i],undefined]);else pairs.push([undefined,b[--j]]);}return pairs.reverse();
}
export function compareMusicXML(predictedXML:string,referenceXML:string){
 const predicted=parse(predictedXML),reference=parse(referenceXML);const totals=Object.fromEntries(categories.map(c=>[c,{matched:0,predicted:0,reference:0}])) as Record<Category,{matched:number;predicted:number;reference:number}>;
 const used=new Set<Part>();const edits=new Set<string>();const ambiguities:string[]=[];
 const pairs:([Part|undefined,Part|undefined])[]=reference.map(r=>{
 const available=predicted.filter(p=>!used.has(p));const candidates=available.filter(p=>p.name===r.name);if(candidates.length>1)ambiguities.push(r.name);
 const p=candidates.find(p=>p.fingerprint===r.fingerprint)??candidates[0]??available.find(p=>p.fingerprint===r.fingerprint)??available.map(p=>({p,score:4*intersection(p.profile.pitches,r.profile.pitches)+intersection(p.profile.rhythms,r.profile.rhythms)+10*intersection(p.profile.clefs,r.profile.clefs)-Math.abs(p.profile.center-r.profile.center)})).sort((a,b)=>b.score-a.score)[0]?.p;
 if(p)used.add(p);return [p,r];
 });for(const p of predicted)if(!used.has(p))pairs.push([p,undefined]);
 pairs.forEach(([p,r],part)=>{align(p?.measures??[],r?.measures??[]).forEach(([pm,rm],m)=>{for(const category of categories){
 const a=pm?.[category]??[],b=rm?.[category]??[];const matched=intersection(a,b);const t=totals[category];t.matched+=matched;t.predicted+=a.length;t.reference+=b.length;if(matched<a.length||matched<b.length)edits.add(part+':'+m);
 }});});
 const metrics=Object.fromEntries(categories.map(c=>{const t=totals[c];const precision=t.predicted?t.matched/t.predicted:t.reference?0:1;const recall=t.reference?t.matched/t.reference:t.predicted?0:1;return [c,{...t,precision,recall,f1:precision+recall?2*precision*recall/(precision+recall):0}];})) as Record<Category,Metric>;
 return {metrics,reviewEffort:{measuresNeedingEdits:new Set([...edits].map(e=>e.split(':')[1])).size,partMeasuresNeedingEdits:edits.size,partMeasurePositions:[...edits]},ambiguities,qualityPass:null};
}
