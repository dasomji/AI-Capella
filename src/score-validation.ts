/** Shared import/transcription musical diagnostics. Raw notation is never rewritten. */
export type MeasureSource={measure:number;part:string;page:number;localMeasure:string;model:string;promptVersion:string;synthetic?:boolean};
export type Diagnostic={code:string;part?:string;measure?:number;voice?:string;source?:MeasureSource};
export type ValidationReport={structurallyValid:boolean;accuracy:'unknown';reviewRequired:boolean;errors:Diagnostic[];warnings:Diagnostic[];uncertainties:unknown[]};
export const children=(e:Element,name:string)=>Array.from(e.children).filter(c=>c.tagName===name);
export const text=(e:Element,selector:string)=>e.querySelector(selector)?.textContent??'';
export function validateMusicDocument(doc:Document,sources:MeasureSource[]=[],uncertainties:unknown[]=[]):ValidationReport {
 const errors:Diagnostic[]=[],warnings:Diagnostic[]=[];
 const add=(list:Diagnostic[],code:string,part?:string,measure?:number,voice?:string)=>list.push({code,part,measure,voice,source:sources.find(s=>s.part===part&&s.measure===measure)});
 const root=doc.documentElement;
 if(root.tagName!=='score-partwise'||doc.querySelector('parsererror'))add(errors,'invalid_xml');
 const declarations=Array.from(doc.querySelectorAll('part-list > score-part'));const ids=declarations.map(p=>p.id);
 if(new Set(ids).size!==ids.length||ids.some(id=>!id))add(errors,'duplicate_part_id');
 const parts=children(root,'part');if(!parts.length)add(errors,'empty_score');
 if(parts.length!==ids.length || new Set(parts.map(p=>p.id)).size!==parts.length)add(errors,'part_list_mismatch');
 const count=Math.max(0,...parts.map(p=>children(p,'measure').length));
 for(const part of parts){const id=part.id;if(!ids.includes(id))add(errors,'unknown_part',id);
 const measures=children(part,'measure');if(measures.length!==count)add(errors,'discontinuous_part',id);
 if(!part.querySelector('note'))add(errors,'empty_part',id);
 let divisions=0,beats=0,beatType=0;let key=false,clef=false;const ties=new Map<string,number>();const slurs=new Map<string,number>();
 for(const [index,m] of measures.entries()){
 const number=index+1;const attr=children(m,'attributes');
 for(const a of attr){if(a.querySelector('divisions')){divisions=Number(text(a,'divisions'));if(!Number.isInteger(divisions)||divisions<=0)add(errors,'invalid_divisions',id,number);}if(a.querySelector('time')){beats=text(a,'time > beats').split('+').reduce((a,b)=>a+Number(b),0);beatType=Number(text(a,'time > beat-type'));}key ||= !!a.querySelector('key');clef ||= !!a.querySelector('clef');}
 if(!divisions)add(errors,'missing_divisions',id,number);
 if(index===0)for(const [present,code] of [[key,'missing_key'],[clef,'missing_clef'],[beats>0&&beatType>0,'missing_time']] as const)if(!present)add(warnings,code,id,number);
 const end=new Map<string,number>();let cursor=0;let lastStart=0;
 for(const node of Array.from(m.children)){
 if(node.tagName==='backup'||node.tagName==='forward'){const d=Number(text(node,'duration'))/divisions;if(!Number.isFinite(d)||d<0)add(errors,'invalid_duration',id,number);cursor+=node.tagName==='backup'?-d:d;if(cursor< -1e-7)add(errors,'negative_cursor',id,number);continue;}
 if(node.tagName==='lyric')add(errors,'unattached_lyric',id,number);
 if(node.tagName!=='note')continue;
 const voice=text(node,'voice')||'1';const staff=text(node,'staff')||'1';const v=voice+':'+staff;
 if(!/^[1-9]\d*$/.test(staff)||!voice.trim())add(errors,'invalid_voice_staff',id,number,voice);
 const grace=!!node.querySelector('grace');const duration=grace?0:Number(text(node,'duration'))/divisions;
 if(!Number.isFinite(duration)||(!grace&&duration<=0))add(errors,'invalid_duration',id,number,voice);
 const pitch=node.querySelector('pitch');if(pitch&&(!/^[A-G]$/.test(text(pitch,'step'))||!/^\d$/.test(text(pitch,'octave')) || !Number.isFinite(Number(text(pitch,'alter')||0))))add(errors,'invalid_pitch',id,number,voice);
 if(!pitch&&!node.querySelector('rest, unpitched'))add(errors,'missing_pitch',id,number,voice);
 if((node.querySelector('rest')&&node.querySelector('lyric')))add(errors,'unattached_lyric',id,number,voice);
 const start=node.querySelector('chord')?lastStart:cursor;end.set(v,Math.max(end.get(v)??0,start+duration));if(!node.querySelector('chord')){lastStart=cursor;cursor+=duration;}
 const k=v+':'+(pitch?['step','alter','octave'].map(k=>text(pitch,k)||'0').join(':'):'');for(const tie of children(node,'tie')){if(tie.getAttribute('type')==='stop'){if(!ties.delete(k))add(warnings,'unmatched_tie_stop',id,number,voice);}if(tie.getAttribute('type')==='start'){if(ties.has(k))add(warnings,'duplicate_tie_start',id,number,voice);ties.set(k,number);}}
 for(const slur of Array.from(node.querySelectorAll('notations > slur'))){const k=v+':'+(slur.getAttribute('number')??'1');if(slur.getAttribute('type')==='stop'&&!slurs.delete(k))add(warnings,'unmatched_slur_stop',id,number,voice);if(slur.getAttribute('type')==='start')slurs.set(k,number);}
 }
 const expected=beats*4/beatType;
 for(const [voice,duration] of end)if(Number.isFinite(expected)&&expected>0&&Math.abs(duration-expected)>1e-6){const pickup=(index===0||index===measures.length-1||m.getAttribute('implicit')==='yes')&&duration<expected;add(warnings,pickup?'pickup_or_final_measure':'measure_duration',id,number,voice);}
 if(!end.size)add(errors,'empty_measure',id,number);
 }
 for(const [voice,measure] of ties)add(warnings,'unmatched_tie_start',id,measure,voice);
 for(const [voice,measure] of slurs)add(warnings,'unmatched_slur_start',id,measure,voice);
 }
 return {structurallyValid:errors.length===0,accuracy:'unknown',reviewRequired:true,errors,warnings,uncertainties};
}
