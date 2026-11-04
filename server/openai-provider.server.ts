import { createHash } from 'node:crypto';
// @ts-ignore shared with the plain Node score worker
import { cleanMusicXML } from './musicxml-input.mjs';
import OpenAI from 'openai';
import { logProviderError } from './logger.server';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { ProviderError, type TranscriptionProvider, type PageInput, type PageResult } from './transcription-provider.server';
const prompt=readFileSync(new URL('./prompts/transcription-v1.txt',import.meta.url),'utf8');
export const promptSha256='d1d0abc2dd7c93678ea4efdbac93559d14b0763f025606368eff40f0e0be8308';
export function verifyPrompt(content:string){if(createHash('sha256').update(content).digest('hex')!==promptSha256)throw Error('Pinned transcription prompt changed');}
verifyPrompt(prompt);
export const responseSchema=z.object({musicxml:z.string(),uncertainties:z.array(z.object({measure:z.string(),part:z.string(),voice:z.string(),reason:z.string()})),flags:z.array(z.enum(['refusal','partial','truncated','unreadable','no_music']))}).strict();
export const strictResponseSchema=z.toJSONSchema(responseSchema);
delete strictResponseSchema.$schema;
const array=<T>(v:T|T[]|undefined):T[]=>v===undefined?[]:Array.isArray(v)?v:[v];
/** Retain only state in effect, never previous notation or full responses. */
export function compactContext(pages:PageResult[]) {
 const checkpoint=[...pages].reverse().find(p=>p.contextState)?.contextState as {parts:Record<string,unknown>[];lastMeasure:number;tempo:string;lyricLanguage:string}|undefined;
 const parts=new Map<string,Record<string,unknown>>((checkpoint?.parts??[]).map(p=>[String(p.id),structuredClone(p)]));let lastMeasure=checkpoint?.lastMeasure??0;let tempo=checkpoint?.tempo??'';let lyricLanguage=checkpoint?.lyricLanguage??'';
 const checkpointIndex=pages.findLastIndex(p=>!!p.contextState);pages=pages.slice(checkpointIndex+1);
 for(const page of pages){
 let pageMeasures=0;const score=new XMLParser({ignoreAttributes:false,processEntities:false}).parse(page.musicxmlFragment)['score-partwise'];if(!score)continue;
 for(const item of array<any>(score['part-list']?.['score-part'])){const id=String(item['@_id']);parts.set(id,{...parts.get(id),id,name:item['part-name'],instrument:item['score-instrument']});}
 for(const part of array<any>(score.part)){
 const id=String(part['@_id']);const state=parts.get(id)??{id};const ties=new Set<string>(state.openTies as string[]??[]);const slurs=new Set<string>(state.openSlurs as string[]??[]);
 for(const m of array<any>(part.measure)){pageMeasures=Math.max(pageMeasures,array<any>(part.measure).length);for(const a of array<any>(m.attributes))for(const key of ['divisions','key','time','clef'])if(a[key]!==undefined)state[key]=a[key];
 for(const bar of array<any>(m.barline)){if(bar.repeat){if(bar.repeat['@_direction']==='forward')state.openRepeat=true;else state.openRepeat=false;}for(const ending of array<any>(bar.ending))state.openEnding=ending['@_type']==='start'?ending['@_number']:null;}
 for(const d of array<any>(m.direction)){if(d['direction-type']?.metronome)tempo=JSON.stringify(d['direction-type'].metronome);for(const kind of ['octave-shift','pedal'])for(const mark of array<any>(d['direction-type']?.[kind])){const states=(state[kind]??{}) as Record<string,unknown>;const k=String(mark['@_number']??1);if(mark['@_type']==='stop')delete states[k];else states[k]=mark;state[kind]=states;}}
 for(const n of array<any>(m.note)){const key=JSON.stringify([n.voice??'1',n.staff??'1',n.pitch]);for(const t of array<any>(n.tie)){if(t['@_type']==='stop')ties.delete(key);if(t['@_type']==='start')ties.add(key);}for(const slur of array<any>(n.notations?.slur)){const k=JSON.stringify([n.voice??'1',n.staff??'1',slur['@_number']??1]);if(slur['@_type']==='stop')slurs.delete(k);if(slur['@_type']==='start')slurs.add(k);}for(const lyric of array<any>(n.lyric)){if(lyric['@_xml:lang'])lyricLanguage=lyric['@_xml:lang'];const syllabic=(state.lyricSyllabic??{}) as Record<string,unknown>;syllabic[String(lyric['@_number']??1)]=lyric.syllabic??'single';state.lyricSyllabic=syllabic;}}}
 state.openTies=[...ties];state.openSlurs=[...slurs];parts.set(id,state);
 }lastMeasure+=pageMeasures;}return {parts:[...parts.values()],lastMeasure,tempo,lyricLanguage};
}
export class OpenAITranscriptionProvider implements TranscriptionProvider {
 readonly promptVersion='transcription-v1';
 readonly promptSha256=promptSha256;
 constructor(readonly model=process.env.OPENAI_TRANSCRIPTION_MODEL??'gpt-6.1-sol',private client?:OpenAI){}
 async transcribePage(input:PageInput,pages:PageResult[],options:Record<string,unknown>,signal:AbortSignal):Promise<PageResult>{
 const start=Date.now();if(signal.aborted)throw new ProviderError('provider_timeout',true);
 if(!input.raster)throw new ProviderError('infrastructure_error');
 if(!this.client){if(!process.env.OPENAI_API_KEY)throw new ProviderError('model_unavailable');this.client=new OpenAI({apiKey:process.env.OPENAI_API_KEY,maxRetries:0});}
 let usage:PageResult['usage']|undefined;let requestId:string|undefined;
 try{
 // The 64k API budget includes reasoning and notation; low effort reduces reasoning pressure.
 const response=await this.client.responses.create({model:this.model,store:false,max_output_tokens:64000,reasoning:{effort:'low'},instructions:prompt,input:[{role:'user',content:[{type:'input_text',text:JSON.stringify({page:input.pageIndex+1,language:options.language??null,context:compactContext(pages)})},{type:'input_image',detail:'high',image_url:`data:image/png;base64,${input.raster.toString('base64')}`}]}],text:{format:{type:'json_schema',name:'transcription_page',strict:true,schema:strictResponseSchema}}},{signal,maxRetries:0});
 usage={inputTokens:response.usage?.input_tokens??0,outputTokens:response.usage?.output_tokens??0};requestId=response._request_id??response.id;
 if(response.output.some(o=>o.type==='message' && o.content.some(c=>c.type==='refusal')))throw new ProviderError('provider_refusal');
 if(response.status==='incomplete')throw new ProviderError(response.incomplete_details?.reason==='max_output_tokens'?'truncated':'provider_refusal');
 if(response.status!=='completed')throw new ProviderError('infrastructure_error',true);
 let data:z.infer<typeof responseSchema>;try{data=responseSchema.parse(JSON.parse(response.output_text.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i,'$1')));}catch{throw new ProviderError('invalid_output',true);}
 if(data.flags.includes('no_music'))data.musicxml='<score-partwise><part-list/></score-partwise>';
 if(data.flags.includes('refusal'))throw new ProviderError('provider_refusal');
 if(data.flags.includes('truncated')||data.flags.includes('partial'))throw new ProviderError('truncated');
 try{data.musicxml=cleanMusicXML(data.musicxml,true);}catch{throw new ProviderError('invalid_output',true);}
 if(XMLValidator.validate(data.musicxml)!==true || !['score-partwise','score-timewise'].some(root=>new XMLParser().parse(data.musicxml)[root]))throw new ProviderError('invalid_output',true);
 const value:PageResult={musicxmlFragment:data.musicxml,uncertainties:data.uncertainties.map(u=>({...u,page:input.pageIndex+1})),flags:data.flags,usage,requestId,model:this.model,promptVersion:this.promptVersion,latency:Date.now()-start};value.contextState=compactContext([...pages,value]);return value;
 }catch(error){
 let failure:ProviderError;
 if(error instanceof ProviderError)failure=error;
 else if(signal.aborted || error instanceof OpenAI.APIUserAbortError || error instanceof OpenAI.APIConnectionTimeoutError)failure=new ProviderError('provider_timeout',true);
 else if(error instanceof OpenAI.APIError){
 requestId??=error.requestID??undefined;
 if(error.code==='insufficient_quota'||error.status===401||error.status===403)failure=new ProviderError('provider_account_error');
 else if(error.code==='model_not_found'||error.code==='model_not_available')failure=new ProviderError('model_unavailable');
 else if(error.status===429){const value=error.headers?.get('retry-after');const ms=value?(Number.isFinite(Number(value))?Number(value)*1000:Date.parse(value)-Date.now()):0;failure=new ProviderError('rate_limited',true,Math.max(0,ms||0));}
 else failure=new ProviderError('infrastructure_error',!error.status||error.status>=500);
 }else failure=new ProviderError(usage?'invalid_output':'infrastructure_error',true);
 failure.usage=usage;failure.requestId=requestId;
 logProviderError(failure.reason,error instanceof OpenAI.APIError?error.status:undefined,error instanceof OpenAI.APIError?error.code:undefined,requestId);
 throw failure;
 }
 }
}
