// @vitest-environment node
import { test,expect } from 'vitest';
import OpenAI from 'openai';
import { JSDOM } from 'jsdom';
import sharp from 'sharp';
import { Readable } from 'node:stream';
import { OpenAITranscriptionProvider,compactContext } from '../server/openai-provider.server';
import { ScoreAssembler,scoreDocument } from '../server/score-assembly.server';
import { validateMusicDocument } from '../src/score-validation';
import { parseMusicXML } from '../src/musicxml';
import { timingFromScore } from '../src/rehearsal/timeline';
import type { PageResult } from '../server/transcription-provider.server';
const attrs='<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>';
const note=(tie='')=>`<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type>${tie?`<tie type="${tie}"/>`:''}<lyric xml:lang="de"><text>Freude</text></lyric></note>`;
export const page=(names:string[],tie='')=>`<score-partwise version="4.0"><part-list>${names.map(n=>`<score-part id="${n}"><part-name>${n}</part-name></score-part>`).join('')}</part-list>${names.map(n=>`<part id="${n}"><measure number="1">${attrs}${note(tie)}</measure></part>`).join('')}</score-partwise>`;
const result=(xml:string):PageResult=>({musicxmlFragment:xml,model:'gpt-6.1-sol',promptVersion:'transcription-v1',uncertainties:[],usage:{inputTokens:50,outputTokens:100},latency:1});
const input={objectKey:'private',contentType:'image/png',sourcePage:1,pageIndex:0,raster:Buffer.from('fake')};
function provider(body:unknown,status=200,headers:Record<string,string>={},capture?:(r:RequestInit|undefined)=>void){return new OpenAITranscriptionProvider('gpt-6.1-sol',new OpenAI({apiKey:'fixture-only',maxRetries:0,fetch:async(_url,init)=>{capture?.(init);return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json',...headers}});}}));}
const response=(data:unknown,extra={})=>({object:'response',id:'resp_fixture',status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:typeof data==='string'?data:JSON.stringify(data),annotations:[]}]}],usage:{input_tokens:50,output_tokens:100},...extra});
test('three SATB pages preserve lyrics, boundary ties, provenance and playable timing',async()=>{
 const pages=[result(page(['S','A','T','B'],'start')),result(page(['S','A','T','B'],'stop')),result(page(['S','A','T','B']))];
 const assembled=await new ScoreAssembler().assembleDetailed(pages);expect(assembled.report.errors).toEqual([]);expect(assembled.report.warnings.filter(w=>w.code.includes('tie'))).toEqual([]);expect(assembled.provenance).toHaveLength(12);
 const dom=scoreDocument(assembled.xml);globalThis.DOMParser=dom.window.DOMParser;const parsed=parseMusicXML(assembled.xml);expect(timingFromScore(parsed)).toBeTruthy();expect(assembled.xml.match(/Freude/g)).toHaveLength(12);dom.window.close();
 const context=JSON.stringify(compactContext(pages));expect(context).not.toContain('<note');expect(context).toContain('openTies');
});
test('accompaniment and divisi enter without dropping a section; all parts aligned',async()=>{
 const assembled=await new ScoreAssembler().assembleDetailed([result(page(['S','A','T','B'])),result(page(['B','T','A','S','Piano'])),result(page(['S','S2','A','T','B','Piano']))]);
 const dom=scoreDocument(assembled.xml);const parts=[...dom.window.document.querySelectorAll('score-partwise > part')];expect(parts).toHaveLength(6);expect(parts.map(p=>p.querySelectorAll('measure').length)).toEqual([3,3,3,3,3,3]);expect(assembled.provenance).toHaveLength(18);expect(dom.window.document.querySelector('part[id="S2"] measure rest')).toBeTruthy();dom.window.close();
});
test('provider sends pinned structured page request with compact context, records usage',async()=>{
 let body:any;const p=provider(response({musicxml:page(['S']),uncertainties:[],flags:[]}),200,{},init=>{body=JSON.parse(String(init?.body));});const out=await p.transcribePage(input,[result(page(['S']))],{},new AbortController().signal);expect(out.usage.outputTokens).toBe(100);expect(body.model).toBe('gpt-6.1-sol');expect(body.text.format.strict).toBe(true);expect(body.input[0].content[1].type).toBe('input_image');expect(body.store).toBe(false);
});
for(const [name,body,reason] of [
 ['refusal',response('',{output:[{type:'message',content:[{type:'refusal',refusal:'no'}]}]}),'provider_refusal'],
 ['truncation',response('',{status:'incomplete',incomplete_details:{reason:'max_output_tokens'}}),'truncated'],
 ['malformed JSON',response('{'),'invalid_output'],
 ['invalid XML',response({musicxml:'<no/>',uncertainties:[],flags:[]}),'invalid_output'],
 ['partial',response({musicxml:page(['S']),uncertainties:[],flags:['partial']}),'truncated'],
] as const)test(name,async()=>{await expect(provider(body).transcribePage(input,[],{},new AbortController().signal)).rejects.toMatchObject({reason,usage:{inputTokens:50,outputTokens:100}});});
test('429 respects retry-after and model missing is explicit',async()=>{
 await expect(provider({error:{message:'slow',code:'rate_limit_exceeded'}},429,{'retry-after':'17'}).transcribePage(input,[],{},new AbortController().signal)).rejects.toMatchObject({reason:'rate_limited',retryAfterMs:17000});
 await expect(provider({error:{message:'missing',code:'model_not_found'}},404).transcribePage(input,[],{},new AbortController().signal)).rejects.toMatchObject({reason:'model_unavailable'});
 const abort=new AbortController();abort.abort();await expect(provider({}).transcribePage(input,[],{},abort.signal)).rejects.toMatchObject({reason:'provider_timeout'});
});
test('validator separates timing/tie review warnings from blocking empty parts and invalid durations',()=>{
 const dom=new JSDOM(page(['S'],'start').replace('<duration>4','<duration>3'),{contentType:'text/xml'});const report=validateMusicDocument(dom.window.document);expect(report.structurallyValid).toBe(true);expect(report.accuracy).toBe('unknown');expect(report.warnings.map(w=>w.code)).toContain('unmatched_tie_start');expect(report.warnings.map(w=>w.code)).toContain('pickup_or_final_measure');dom.window.close();
 const empty=new JSDOM(page(['S']).replace(note(),''),{contentType:'text/xml'});expect(validateMusicDocument(empty.window.document).errors.map(e=>e.code)).toContain('empty_part');empty.window.close();
 expect(()=>scoreDocument('<!DOCTYPE score-partwise><score-partwise/>')).toThrow();
});

test('prior-art Evening Rise retains all original notation through page assembly',async()=>{
 const {readFileSync}=await import('node:fs');const dom=scoreDocument(readFileSync('public/evening-rise.musicxml','utf8'));const original=dom.window.document;
 const count=original.querySelector('part')!.querySelectorAll('measure').length;const pages:PageResult[]=[];
 for(let start=0;start<count;start+=8){const copy=original.documentElement.cloneNode(true) as Element;for(const part of [...copy.querySelectorAll(':scope > part')])for(const [i,m] of [...part.querySelectorAll(':scope > measure')].entries())if(i<start||i>=start+8)m.remove();pages.push(result(copy.outerHTML));}
 const output=await new ScoreAssembler().assembleDetailed(pages);const assembled=scoreDocument(output.xml);
 for(const tag of ['note','lyric','tie','slur','direction','barline','clef','time'])expect(assembled.window.document.querySelectorAll(tag).length).toBe(original.querySelectorAll(tag).length);
 expect(output.report.errors).toEqual([]);dom.window.close();assembled.window.close();
});

test('abort during HTTP request cancels provider, without hidden retries',async()=>{
 let count=0;const client=new OpenAI({apiKey:'fixture-only',fetch:async(_url,init)=>{count++;return new Promise((_resolve,reject)=>{init?.signal?.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true});});}});const controller=new AbortController();const pending=new OpenAITranscriptionProvider('gpt-6.1-sol',client).transcribePage(input,[],{},controller.signal);setTimeout(()=>controller.abort(),10);await expect(pending).rejects.toMatchObject({reason:'provider_timeout'});expect(count).toBe(1);
});
