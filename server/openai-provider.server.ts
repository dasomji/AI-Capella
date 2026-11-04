// @ts-ignore shared with the plain Node score worker
import { cleanMusicXML } from './musicxml-input.mjs';
import OpenAI from 'openai';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { ProviderError, type TranscriptionProvider, type PageInput, type PageResult } from './transcription-provider.server';
const prompt=readFileSync(resolve('server/prompts/transcription-v1.txt'),'utf8');
export const responseSchema=z.object({musicxml:z.string().min(1),uncertainties:z.array(z.object({measure:z.string(),part:z.string(),voice:z.string(),reason:z.string()})),flags:z.array(z.enum(['refusal','partial','truncated','unreadable']))}).strict();
const array=<T>(v:T|T[]|undefined):T[]=>v===undefined?[]:Array.isArray(v)?v:[v];
/** Retain only state in effect, never previous notation or full responses. */
export function compactContext(pages:PageResult[]) {
 const parts=new Map<string,Record<string,unknown>>();let lastMeasure=0;let tempo='';let lyricLanguage='';
 for(const page of pages){
 let pageMeasures=0;const score=new XMLParser({ignoreAttributes:false,processEntities:false}).parse(page.musicxmlFragment)['score-partwise'];if(!score)continue;
 for(const item of array<any>(score['part-list']?.['score-part'])){const id=String(item['@_id']);parts.set(id,{...parts.get(id),id,name:item['part-name'],instrument:item['score-instrument']});}
 for(const part of array<any>(score.part)){
 const id=String(part['@_id']);const state=parts.get(id)??{id};const ties=new Set<string>(state.openTies as string[]??[]);const slurs=new Set<string>(state.openSlurs as string[]??[]);
 for(const m of array<any>(part.measure)){pageMeasures=Math.max(pageMeasures,array<any>(part.measure).length);for(const a of array<any>(m.attributes))for(const key of ['divisions','key','time','clef'])if(a[key]!==undefined)state[key]=a[key];
 for(const d of array<any>(m.direction))if(d['direction-type']?.metronome)tempo=JSON.stringify(d['direction-type'].metronome);
 for(const n of array<any>(m.note)){const key=JSON.stringify([n.voice??'1',n.staff??'1',n.pitch]);for(const t of array<any>(n.tie)){if(t['@_type']==='stop')ties.delete(key);if(t['@_type']==='start')ties.add(key);}for(const slur of array<any>(n.notations?.slur)){const k=JSON.stringify([n.voice??'1',n.staff??'1',slur['@_number']??1]);if(slur['@_type']==='stop')slurs.delete(k);if(slur['@_type']==='start')slurs.add(k);}for(const lyric of array<any>(n.lyric))if(lyric['@_xml:lang'])lyricLanguage=lyric['@_xml:lang'];}}
 state.openTies=[...ties];state.openSlurs=[...slurs];parts.set(id,state);
 }lastMeasure+=pageMeasures;}return {parts:[...parts.values()],lastMeasure,tempo,lyricLanguage};
}
export class OpenAITranscriptionProvider implements TranscriptionProvider {
 readonly promptVersion='transcription-v1';
 constructor(readonly model=process.env.OPENAI_TRANSCRIPTION_MODEL??'gpt-6.1-sol',private client?:OpenAI){}
 async transcribePage(input:PageInput,pages:PageResult[],options:Record<string,unknown>,signal:AbortSignal):Promise<PageResult>{
 const start=Date.now();if(signal.aborted)throw new ProviderError('provider_timeout',true);
 if(!input.raster)throw new ProviderError('infrastructure_error');
 if(!this.client){if(!process.env.OPENAI_API_KEY)throw new ProviderError('model_unavailable');this.client=new OpenAI({apiKey:process.env.OPENAI_API_KEY,maxRetries:0});}
 let usage:PageResult['usage']|undefined;let requestId:string|undefined;
 try{
 const response=await this.client.responses.create({model:this.model,store:false,max_output_tokens:64000,instructions:prompt,input:[{role:'user',content:[{type:'input_text',text:JSON.stringify({page:input.pageIndex+1,language:options.language??null,context:compactContext(pages)})},{type:'input_image',detail:'high',image_url:`data:image/png;base64,${input.raster.toString('base64')}`}]}],text:{format:{type:'json_schema',name:'transcription_page',strict:true,schema:z.toJSONSchema(responseSchema)}}},{signal,maxRetries:0});
 usage={inputTokens:response.usage?.input_tokens??0,outputTokens:response.usage?.output_tokens??0};requestId=response._request_id??response.id;
 if(response.output.some(o=>o.type==='message' && o.content.some(c=>c.type==='refusal')))throw new ProviderError('provider_refusal');
 if(response.status==='incomplete')throw new ProviderError(response.incomplete_details?.reason==='max_output_tokens'?'truncated':'provider_refusal');
 if(response.status!=='completed')throw new ProviderError('infrastructure_error',true);
 let data:z.infer<typeof responseSchema>;try{data=responseSchema.parse(JSON.parse(response.output_text));}catch{throw new ProviderError('invalid_output');}
 if(data.flags.includes('refusal'))throw new ProviderError('provider_refusal');
 if(data.flags.includes('truncated')||data.flags.includes('partial'))throw new ProviderError('truncated');
 try{data.musicxml=cleanMusicXML(data.musicxml,true);}catch{throw new ProviderError('invalid_output',true);}
 if(XMLValidator.validate(data.musicxml)!==true || !new XMLParser().parse(data.musicxml)['score-partwise'])throw new ProviderError('invalid_output');
 return {musicxmlFragment:data.musicxml,uncertainties:data.uncertainties.map(u=>({...u,page:input.pageIndex+1})),flags:data.flags,usage,requestId,model:this.model,promptVersion:this.promptVersion,latency:Date.now()-start};
 }catch(error){if(error instanceof ProviderError){error.usage=usage;error.requestId=requestId;throw error;}
 if(signal.aborted || error instanceof OpenAI.APIUserAbortError || error instanceof OpenAI.APIConnectionTimeoutError)throw new ProviderError('provider_timeout',true);
 if(error instanceof OpenAI.APIError){if(error.code==='model_not_found' || error.code==='model_not_available')throw new ProviderError('model_unavailable');if(error.status===429){const value=error.headers?.get('retry-after');const ms=value?(Number.isFinite(Number(value))?Number(value)*1000:Date.parse(value)-Date.now()):0;throw new ProviderError('rate_limited',true,Math.max(0,ms||0));}throw new ProviderError('infrastructure_error',!error.status || error.status>=500);}
 throw new ProviderError('infrastructure_error',true);
 }
 }
}
