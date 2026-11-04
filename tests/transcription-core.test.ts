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
 const dom=scoreDocument(assembled.xml);globalThis.DOMParser=dom.window.DOMParser;const parsed=parseMusicXML(assembled.xml);expect(parsed.notes).toHaveLength(8);expect(parsed.notes.filter(n=>n.startBeat===0).map(n=>n.durationBeats)).toEqual([8,8,8,8]);expect(timingFromScore(parsed).totalBeats).toBe(12);expect(assembled.xml.match(/Freude/g)).toHaveLength(12);dom.window.close();
 const context=JSON.stringify(compactContext(pages));expect(context).not.toContain('<note');expect(context).toContain('openTies');
});
test('accompaniment and divisi enter without dropping a section; all parts aligned',async()=>{
 const assembled=await new ScoreAssembler().assembleDetailed([result(page(['S','A','T','B'])),result(page(['B','T','A','S','Piano'])),result(page(['S','S2','A','T','B','Piano']))]);
 const dom=scoreDocument(assembled.xml);const parts=[...dom.window.document.querySelectorAll('score-partwise > part')];expect(parts).toHaveLength(6);expect(parts.map(p=>p.querySelectorAll('measure').length)).toEqual([3,3,3,3,3,3]);expect(assembled.provenance).toHaveLength(18);expect(dom.window.document.querySelector('part[id="S2"] measure rest')).toBeTruthy();dom.window.close();
});
test('provider sends pinned structured page request with compact context, records usage',async()=>{
 let body:any;const p=provider(response({musicxml:page(['S']),uncertainties:[],flags:[]}),200,{},init=>{body=JSON.parse(String(init?.body));});const out=await p.transcribePage(input,[result(page(['S']))],{},new AbortController().signal);expect(out.usage.outputTokens).toBe(100);expect(body.model).toBe('gpt-6.1-sol');expect(body.text.format.strict).toBe(true);expect(body.input[0].content[1].type).toBe('input_image');expect(body.store).toBe(false);expect(body.max_output_tokens).toBe(64000);expect(body.reasoning.effort).toBe('low');
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
 const empty=new JSDOM(page(['S']).replace(note(),''),{contentType:'text/xml'});expect(validateMusicDocument(empty.window.document).warnings.map(e=>e.code)).toContain('empty_part');empty.window.close();
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

test('interior rhythm errors and unmatched stops are review warnings; nonfinite durations block import',()=>{
 const xml=page(['S'],'stop').replace('</part>',`<measure number="2">${note().replace('<duration>4','<duration>2')}</measure><measure number="3">${note()}</measure></part>`);
 const dom=scoreDocument(xml);const report=validateMusicDocument(dom.window.document);expect(report.errors).toEqual([]);expect(report.warnings.map(w=>w.code)).toContain('measure_duration');expect(report.warnings.map(w=>w.code)).toContain('unmatched_tie_stop');dom.window.close();
 const invalid=scoreDocument(xml.replace('<duration>4','<duration>NaN'));expect(validateMusicDocument(invalid.window.document).errors.map(e=>e.code)).toContain('invalid_duration');invalid.window.close();
});

test('part reorder and tacet spans retain identity; compact request state stays bounded',async()=>{
 const first=page(['S','A','T','B']);const second=page(['B','A','S']).replace(/<step>C<\/step>/g,'<step>D</step>');const out=await new ScoreAssembler().assembleDetailed([result(first),result(second),result(first)]);const dom=scoreDocument(out.xml);
 expect(dom.window.document.querySelector('part[id="T"] measure[number="2"] rest')).toBeTruthy();expect(dom.window.document.querySelector('part[id="S"] measure[number="2"] step')?.textContent).toBe('D');expect(out.provenance.find(p=>p.part==='T'&&p.measure===2)?.synthetic).toBe(true);dom.window.close();
 const short=JSON.stringify(compactContext([result(first)]));const long=JSON.stringify(compactContext(Array(40).fill(result(first))));expect(long.length).toBeLessThanOrEqual(short.length+10);expect(compactContext(Array(40).fill(result(first))).lastMeasure).toBe(40);
});
test('SDK connection timeout is a retryable provider timeout',async()=>{
 const client=new OpenAI({apiKey:'fixture-only',fetch:async()=>{throw new OpenAI.APIConnectionTimeoutError();}});await expect(new OpenAITranscriptionProvider('gpt-6.1-sol',client).transcribePage(input,[],{},new AbortController().signal)).rejects.toMatchObject({reason:'provider_timeout',retryable:true});
});
// Ported legacy invariant: notation passes through without compact-notation rebuilding.
test('legacy lyric syllables, tuplets, voices and repeats survive direct XML assembly',async()=>{
 const xml=page(['S']).replace('<duration>4</duration>','<duration>1</duration><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>').replace('<text>Freude</text>','<syllabic>begin</syllabic><text>Freu</text>').replace('</measure>','<barline location="right"><repeat direction="backward" times="3"/></barline></measure>');
 const assembled=await new ScoreAssembler().assembleDetailed([result(xml)]);
 for(const tag of ['time-modification','syllabic','repeat']){const a=scoreDocument(xml),b=scoreDocument(assembled.xml);try{expect(b.window.document.querySelector(tag)?.outerHTML).toBe(a.window.document.querySelector(tag)?.outerHTML);}finally{a.window.close();b.window.close();}}
 const invalid=xml.replace('<duration>1</duration>','<duration>-1</duration>');const dom=scoreDocument(invalid);try{expect(validateMusicDocument(dom.window.document).structurallyValid).toBe(false);}finally{dom.window.close();}
});

test('external exporter DOCTYPEs work for import and model output; subsets and entities fail',async()=>{
 const {Worker}=await import('node:worker_threads');
 const validateScore=(raw:string,format:string)=>new Promise((resolve,reject)=>{const w=new Worker(new URL('../server/score-worker.mjs',import.meta.url));w.once('message',r=>{void w.terminate();r.error?reject({code:r.error}):resolve(r);});w.once('error',reject);w.postMessage({raw,format});});
 for(const version of ['3.0','3.1','4.0'])for(const root of ['score-partwise','score-timewise']){
 const header=`<!DOCTYPE ${root} PUBLIC "-//Recordare//DTD MusicXML ${version} ${root==='score-partwise'?'Partwise':'Timewise'}//EN" "http://www.musicxml.org/dtds/${root==='score-partwise'?'partwise':'timewise'}.dtd">`;
 const xml=root==='score-partwise'?page(['S']):`<score-timewise><part-list><score-part id="S"><part-name>S</part-name></score-part></part-list><measure number="1"><part id="S">${attrs}${note()}</part></measure></score-timewise>`;
 await expect(validateScore(header+xml,'musicxml')).resolves.toHaveProperty('hash');
 await expect(provider(response({musicxml:header+xml,uncertainties:[],flags:[]})).transcribePage(input,[],{},new AbortController().signal)).resolves.toHaveProperty('musicxmlFragment');
 }
 await expect(validateScore('<!DOCTYPE score-partwise SYSTEM "partwise.dtd">'+page(['S']),'musicxml')).resolves.toHaveProperty('hash');
 for(const bad of ['<!DOCTYPE score-partwise [<!ENTITY x "bad">]>','<!ENTITY x "bad">'])await expect(validateScore(bad+page(['S']),'musicxml')).rejects.toMatchObject({code:'invalid_xml'});
},30000);

test('valid unusual notation produces warnings, cross-staff mixed-meter ties stay clean',()=>{
 const validate=(xml:string)=>{const d=scoreDocument(xml);try{return validateMusicDocument(d.window.document);}finally{d.window.close();}};
 const unusual=page(['S','A']).replace(note(),'<note><rest/><duration>4</duration><lyric><text>Ah</text></lyric></note>').replace('</part>','<measure><forward><duration>4</duration></forward></measure><measure><barline/></measure></part>');
 const r=validate(unusual);expect(r.structurallyValid).toBe(true);expect(r.warnings.map(w=>w.code)).toEqual(expect.arrayContaining(['unattached_lyric','empty_measure','discontinuous_part']));
 const cross=page(['S']).replace(note(),note().replace('<duration>4','<duration>2').replace('</note>','<staff>1</staff></note>')+note().replace('<duration>4','<duration>2').replace('</note>','<staff>2</staff></note>'));
 expect(validate(cross).warnings.map(w=>w.code)).not.toContain('measure_duration');
 expect(validate(page(['S']).replace('<beats>4</beats><beat-type>4</beat-type>','<beats>3</beats><beat-type>4</beat-type><beats>2</beats><beat-type>8</beat-type>')).warnings.map(w=>w.code)).not.toContain('measure_duration');
 const tied=page(['S'],'start').replace('</part>',`<measure>${note().replace('</note>','<tie type="start"/><tie type="stop"/></note>')}</measure><measure>${note('stop')}</measure></part>`);
 expect(validate(tied).warnings.map(w=>w.code).filter(c=>c.includes('tie'))).toEqual([]);
});

test('covers skip with provenance; divisi reserves context ids before name matching; renamed parts stay continuous',async()=>{
 const {validatePage}=await import('../server/score-assembly.server');
 const cover=result('<score-partwise><part-list/></score-partwise>');expect(validatePage(cover)).toBe('skipped');
 const renamed=page(['S']).replace('<part-name>S</part-name>','<part-name>Sopran</part-name>');
 const first=page(['S']).replace('<part-name>S</part-name>','<part-name>Soprano</part-name>');
 const reverse=page(['S2','S']).replaceAll('<part-name>S2</part-name>','<part-name>Soprano</part-name>').replaceAll('<part-name>S</part-name>','<part-name>Soprano</part-name>');
 const assembled=await new ScoreAssembler().assembleDetailed([cover,result(first),result(reverse),result(renamed)]);
 const dom=scoreDocument(assembled.xml);expect(dom.window.document.querySelectorAll('part')).toHaveLength(2);expect(assembled.skippedPages).toEqual([1]);expect(assembled.report.warnings.map(w=>w.code)).toContain('new_part_identity');dom.window.close();
 expect(()=>validatePage(result(page(['S']).replace('<duration>4</duration>','<duration>bad</duration>')))).toThrow();
 expect(validatePage(result(page(['S']).replace(attrs,'')),[result(first)])).toBe('completed');
});

test('strict response schema uses the documented supported subset',async()=>{
 // https://developers.openai.com/api/docs/guides/structured-outputs#supported-schemas
 const {strictResponseSchema}=await import('../server/openai-provider.server');
 const walk=(v:any)=>{if(!v||typeof v!=='object')return;for(const k of ['$schema','minLength','maxLength','pattern','format'])expect(v).not.toHaveProperty(k);if(v.type==='object'){expect(v.additionalProperties).toBe(false);expect(v.required.sort()).toEqual(Object.keys(v.properties).sort());}for(const c of Object.values(v))if(Array.isArray(c))c.forEach(walk);else walk(c);};walk(strictResponseSchema);
});

test('model fences are tolerated and empty/reasoning-only responses retry; parser failures retain usage',async()=>{
 const noisy={musicxml:'  ```xml\n<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">'+page(['S'])+'\n```  ',uncertainties:[],flags:[]};
 await expect(provider(response(noisy)).transcribePage(input,[],{},new AbortController().signal)).resolves.toHaveProperty('musicxmlFragment',page(['S']));
 await expect(provider(response({}, {output_text:'',output:[]})).transcribePage(input,[],{},new AbortController().signal)).rejects.toMatchObject({reason:'invalid_output',retryable:true,requestId:'resp_fixture',usage:{inputTokens:50,outputTokens:100}});
 const deep={musicxml:'<score-partwise>'+ '<x>'.repeat(400)+'</x>'.repeat(400)+'</score-partwise>',uncertainties:[],flags:[]};
 await expect(provider(response(deep)).transcribePage(input,[],{},new AbortController().signal)).rejects.toMatchObject({reason:'invalid_output',requestId:'resp_fixture'});
});

test('quota/auth failures are terminal account errors',async()=>{
 for(const status of [401,403,429])await expect(provider({error:{message:'private',type:'test',code:status===429?'insufficient_quota':'invalid_api_key'}},status,{'x-request-id':'req_account'}).transcribePage(input,[],{},new AbortController().signal)).rejects.toMatchObject({reason:'provider_account_error',retryable:false,requestId:'req_account'});
});

test('sandbox launcher canary fails closed when Python is unavailable',async()=>{
 const {spawnSync}=await import('node:child_process');
 const r=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',`const {sandboxReady}=await import('./server/sandbox.server.ts');process.exit(await sandboxReady()?1:0);`],{cwd:process.cwd(),env:{PATH:'/nonexistent'},encoding:'utf8',timeout:10000});
 expect(r.status).toBe(0);expect(r.stderr).toContain('sandbox.unavailable');
 const good=await import('../server/sandbox.server');expect(await good.sandboxReady()).toBe(true);expect(good.sandboxEnv()).not.toHaveProperty('OPENAI_API_KEY');
 const script=(await import('node:fs')).readFileSync('server/inspection-sandbox.py','utf8');expect(script).toContain("b'io_uring_setup'");expect(script).toContain("b'io_uring_enter'");expect(script).toContain("b'io_uring_register'");expect(script).toContain("name == b'socket'");
},15000);

test('synthetic rests retain each parts own divisions and never copy another instrument transpose',async()=>{
 const clarinet=page(['Cl']).replace('</attributes>','<transpose><chromatic>-2</chromatic></transpose><staves>2</staves></attributes>');
 const soprano=page(['S']).replace('<divisions>1','<divisions>4').replace('<duration>4','<duration>16');
 const second=clarinet.replace('</part-list>','<score-part id="S"><part-name>S</part-name></score-part></part-list>').replace('</score-partwise>',soprano.match(/<part id="S">[\s\S]*<\/part>/)![0]+'</score-partwise>');
 const out=await new ScoreAssembler().assembleDetailed([result(clarinet),result(second),result(clarinet),result(soprano.replace(attrs,''))]);const dom=scoreDocument(out.xml);try{
 const s=dom.window.document.querySelector('part[id="S"]')!;expect(s.querySelector('transpose, staves')).toBeNull();expect(s.querySelector('measure[number="3"] divisions')?.textContent).toBe('4');expect(s.querySelector('measure[number="3"] duration')?.textContent).toBe('16');
 }finally{dom.window.close();}
});

test('structural validity does not hide unreadable or all-rest transcription',()=>{
 const d=scoreDocument(page(['S']).replace(/<pitch>[\s\S]*?<\/pitch>/g,'<rest/>'));
 try{const r=validateMusicDocument(d.window.document,[],[{flag:'unreadable',page:1}]);expect(r.structurallyValid).toBe(true);expect(r.accuracy).toBe('unknown');expect(r.warnings.map(w=>w.code)).toEqual(expect.arrayContaining(['all_rest_part','all_rest_score','unreadable_page']));}finally{d.window.close();}
});

test('pinned prompt hash refuses edits and loads independently of cwd',async()=>{
 const {verifyPrompt,promptSha256}=await import('../server/openai-provider.server');const {readFileSync}=await import('node:fs');const prompt=readFileSync(new URL('../server/prompts/transcription-v1.txt',import.meta.url),'utf8');expect(()=>verifyPrompt(prompt)).not.toThrow();expect(()=>verifyPrompt(prompt+' ')).toThrow('Pinned');expect(promptSha256).toMatch(/^[a-f0-9]{64}$/);
});

test('renderer flattens transparent notation to white and distinguishes invalid files',async()=>{
 const {BoundedPageRenderer}=await import('../server/page-renderer.server');
 const png=await sharp({create:{width:16,height:16,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).png().toBuffer();
 const out=await new BoundedPageRenderer({get:async()=>Readable.from([png])}).render({...input,raster:undefined},new AbortController().signal);const pixels=await sharp(out.raster!).raw().toBuffer();expect(pixels[0]).toBe(255);
 await expect(new BoundedPageRenderer({get:async()=>Readable.from([Buffer.from('bad')])}).render({...input,raster:undefined},new AbortController().signal)).rejects.toMatchObject({reason:'render_failed',retryable:false});
});

test('sandbox denies parent environ and io_uring while retaining its own process diagnostics',async()=>{
 const {spawnSync}=await import('node:child_process');
 const r=spawnSync('python3',['server/inspection-sandbox.py',process.execPath,'--jitless','--input-type=module','-e',`import fs from 'node:fs';try{fs.readFileSync('/proc/${process.pid}/environ');process.exit(2);}catch(e){if(e.code!=='EACCES')throw e;}fs.readFileSync('/proc/self/limits');`],{encoding:'utf8',timeout:5000,env:{PATH:process.env.PATH}});expect(r.status,r.stderr).toBe(0);
 const probe=spawnSync('python3',['server/inspection-sandbox.py','/usr/bin/python3','-c',`import ctypes,errno;lib=ctypes.CDLL(None,use_errno=True);assert all(lib.syscall(n,-1,0,0,0,0,0)==-1 and ctypes.get_errno()==errno.EPERM for n in [425,426,427])`],{encoding:'utf8',timeout:5000,env:{PATH:process.env.PATH}});expect(probe.status,probe.stderr).toBe(0);
});

test('off-thread assembly preserves provenance and yields the parent event loop',async()=>{
 const {assembleOffThread}=await import('../server/assembly-worker.server');let yielded=false;const pending=assembleOffThread([result(page(['S','A']))]);await new Promise<void>(r=>setTimeout(()=>{yielded=true;r();},0));const out=await pending;expect(yielded).toBe(true);expect(out.provenance).toHaveLength(2);expect(out.report.structurallyValid).toBe(true);
});

test('global identity assignment preserves stronger context signals and warns on indistinguishable names',async()=>{
 const {assignParts}=await import('../server/score-assembly.server');expect(assignParts([[100,100],[1000,0]])).toEqual([1,0]);expect(assignParts([[1000,0],[100,100]])).toEqual([0,1]);
 const a=page(['P','Q']).replaceAll('<part-name>P</part-name>','<part-name>Soprano</part-name>').replaceAll('<part-name>Q</part-name>','<part-name>Soprano</part-name>');const b=page(['R','U']).replaceAll('<part-name>R</part-name>','<part-name>Soprano</part-name>').replaceAll('<part-name>U</part-name>','<part-name>Soprano</part-name>');
 const out=await new ScoreAssembler().assembleDetailed([result(a),result(b)]);expect(out.report.warnings.map(w=>w.code)).toContain('ambiguous_part_identity');
});

test('clef identity ignores exporter whitespace',async()=>{
 const first=page(['S']);const pretty=first.replace('<sign>G</sign><line>2</line>','\n<sign>G</sign>\n<line>2</line>\n');const out=await new ScoreAssembler().assembleDetailed([result(first),result(pretty)]);const d=scoreDocument(out.xml);try{expect(d.window.document.querySelectorAll('part')).toHaveLength(1);}finally{d.window.close();}
});

test('assembly preserves two verses, tuplets, endings, repeats and directions verbatim',async()=>{
 const decoration='<direction><direction-type><rehearsal>A</rehearsal><metronome><beat-unit>quarter</beat-unit><per-minute>96</per-minute></metronome></direction-type><sound tempo="96" dacapo="yes"/></direction><barline location="left"><ending number="1" type="start"/><repeat direction="forward"/></barline>';
 const xml=page(['S']).replace('</attributes>','</attributes>'+decoration).replace('<type>whole</type>','<type>whole</type><dot/><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>').replace('<lyric xml:lang="de">','<lyric number="2"><syllabic>begin</syllabic><text>Light</text></lyric><lyric number="1" xml:lang="de">');
 const out=await new ScoreAssembler().assembleDetailed([result(xml),result(xml)]);const dom=scoreDocument(out.xml);try{for(const selector of ['lyric[number="1"]','lyric[number="2"]','ending[number="1"]','repeat[direction="forward"]','sound[dacapo="yes"]','rehearsal','metronome','dot','time-modification'])expect(dom.window.document.querySelectorAll(selector)).toHaveLength(2);}finally{dom.window.close();}
});
test('persisted context equals full replay and keeps repeat, ending, octave, pedal and lyric continuation',()=>{
 const xml=page(['S'],'start').replace('</attributes>','</attributes><barline><repeat direction="forward"/><ending number="1" type="start"/></barline><direction><direction-type><octave-shift type="down" size="8"/><pedal type="start"/></direction-type></direction>').replace('<text>Freude','<syllabic>begin</syllabic><text>Freude');
 const a=result(xml);a.contextState=compactContext([a]);const b=result(page(['S'],'stop'));const state=compactContext([a,b]);expect(state).toEqual(compactContext([result(xml),b]));expect(state.parts[0].openRepeat).toBe(true);expect(state.parts[0].openEnding).toBe('1');expect(state.parts[0]['octave-shift']).toBeTruthy();expect(state.parts[0].pedal).toBeTruthy();expect(state.parts[0].lyricSyllabic).toBeTruthy();expect(state.parts[0].openTies).toEqual([]);
});
test('synthetic source runs retain inclusive range endpoints',async()=>{const {compressSyntheticSources}=await import('../server/score-assembly.server');const s=Array.from({length:30},(_,i)=>({measure:i+1,part:'S',page:1,localMeasure:String(i+1),model:'m',promptVersion:'v',synthetic:true}));const out=compressSyntheticSources(s);expect(out).toHaveLength(1);expect(out[0].endMeasure).toBe(30);expect(out[0].localMeasureEnd).toBe('30');expect(compressSyntheticSources(s.map(s=>({...s,synthetic:false})))).toHaveLength(30);});

test('a persisted checkpoint avoids parsing all prior page notation',()=>{const a=result(page(['S']));a.contextState=compactContext([a]);a.musicxmlFragment='<unparseable';expect(compactContext([a]).lastMeasure).toBe(1);expect(compactContext([a,result(page(['S']))]).lastMeasure).toBe(2);});

test('octave shifts in either direction stay open until an explicit stop',()=>{for(const type of ['up','down']){const xml=page(['S']).replace('</attributes>',`</attributes><direction><direction-type><octave-shift type="${type}" size="8"/></direction-type></direction>`);const a=result(xml);a.contextState=compactContext([a]);expect(a.contextState.parts[0]['octave-shift']).toHaveProperty('1');const stop=result(page(['S']).replace('</attributes>','</attributes><direction><direction-type><octave-shift type="stop"/></direction-type></direction>'));expect(compactContext([a,stop]).parts[0]['octave-shift']).toEqual({});}});

test('page preview has independent bounded admission and byte-bounded LRU',async()=>{
 const {PreviewAdmission,PreviewCache,needsPreviewAudit}=await import('../server/page-preview.server');
 const admission=new PreviewAdmission(),signal=new AbortController();const a=await admission.take('u',signal.signal),b=await admission.take('v',signal.signal);
 let acquired=false;const next=admission.take('w',signal.signal).then(slot=>{acquired=true;slot.release();});await new Promise(r=>setTimeout(r,35));expect(acquired).toBe(false);a.release();await next;b.release();
 const c=new PreviewCache(4);c.set('a',new Uint8Array(2));c.set('b',new Uint8Array(2));c.get('a');c.set('c',new Uint8Array(2));expect(c.get('b')).toBeUndefined();expect(c.get('a')).toHaveLength(2);
 expect(needsPreviewAudit('u','o',0)).toBe(true);expect(needsPreviewAudit('u','o',1)).toBe(false);expect(needsPreviewAudit('v','o',1)).toBe(true);expect(needsPreviewAudit('u','o',600000)).toBe(true);
});

test('lease staleness includes a safety interval and abort races hung preparatory work',async()=>{
 const {heartbeatStale,withinAbort}=await import('../server/lease-deadline');
 expect(heartbeatStale(7999,0,10000)).toBe(false);expect(heartbeatStale(8000,0,10000)).toBe(true);
 const abort=new AbortController();const hung=withinAbort(abort.signal,()=>new Promise(()=>{}));abort.abort();await expect(hung).rejects.toThrow('lease_deadline');
});

test('Landlock permits only the task temporary directory for writes',async()=>{
 const fs=await import('node:fs');const path=await import('node:path');const {spawnSync}=await import('node:child_process');
 fs.mkdirSync('.transcription-tmp',{recursive:true});const dir=fs.mkdtempSync('.transcription-tmp/landlock-'),sibling=path.resolve(dir)+'-denied';
 try{const code=`import os,sys,json,errno; p=json.loads(sys.argv[1]);open(p['dir']+'/allowed','w').write('ok');\ntry: open(p['denied'],'w');raise AssertionError('write escaped sandbox')\nexcept OSError as e: assert e.errno==errno.EACCES`;
 const r=spawnSync('python3',['server/inspection-sandbox.py','/usr/bin/python3','-c',code,JSON.stringify({dir:path.resolve(dir),denied:sibling})],{encoding:'utf8',timeout:5000});expect(r.status,r.stderr).toBe(0);expect(fs.existsSync(dir+'/allowed')).toBe(true);
 }finally{fs.rmSync(dir,{recursive:true,force:true});fs.rmSync(sibling,{force:true});}
});
