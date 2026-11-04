import { readFile,writeFile,mkdir,readdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve,dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import OpenAI from 'openai';
import { z } from 'zod';
import { BoundedPageRenderer } from '../server/page-renderer.server';
import { OpenAITranscriptionProvider } from '../server/openai-provider.server';
import { ScoreAssembler,scoreDocument } from '../server/score-assembly.server';
import { ProviderError,type PageResult } from '../server/transcription-provider.server';
import { validateMusicDocument } from '../src/score-validation';
import { compareMusicXML } from '../server/reference-comparison';
import { priceTable,estimatedCost } from '../server/transcription-cost';
import type { ObjectStorage } from '../server/storage.server';
const pageSchema=z.object({source:z.string(),contentType:z.enum(['application/pdf','image/jpeg','image/png','image/webp']),sourcePage:z.number().int().positive(),reference:z.string(),recordedRaster:z.string(),recorded:z.object({musicxml:z.string(),uncertainties:z.array(z.unknown()),flags:z.array(z.string())})});
const manifestSchema=z.object({id:z.string(),license:z.string(),metadata:z.object({kind:z.enum(['vocal','instrumental']),divisi:z.boolean(),accompaniment:z.boolean(),lyrics:z.boolean(),photoQuality:z.string()}),reference:z.string(),pages:z.array(pageSchema).min(1)});
export function options(args:string[]){
 const value=(flag:string,fallback:string)=>{const i=args.indexOf(flag);if(i<0)return fallback;if(!args[i+1]||args[i+1].startsWith('--'))throw Error(`Missing ${flag} value`);return args[i+1];};
 const known=new Set(['--set','--pages','--limit','--out','--dry-run','--confirm-paid']);for(const arg of args)if(arg.startsWith('--')&&!known.has(arg))throw Error(`Unknown option ${arg}`);
 const dry=args.includes('--dry-run');if(!dry&&(process.env.CI||!args.includes('--confirm-paid')||!process.env.OPENAI_API_KEY))throw Error('Live evaluation requires OPENAI_API_KEY and --confirm-paid and is forbidden in CI');
 const limit=Number(value('--limit','100'));if(!Number.isInteger(limit)||limit<1)throw Error('Invalid --limit');
 return {dry,limit,pages:args.includes('--pages'),set:resolve(value('--set','eval/fixtures')),out:resolve(value('--out',`reports/eval-${new Date().toISOString().replace(/[:.]/g,'-')}.json`))};
}
export async function evaluate(args:string[]){
 const opts=options(args),prices=priceTable(process.env.TRANSCRIPTION_PRICE_TABLE??'{}');
 const jobs:any[]=[];
 const manifests:string[]=[];for(const entry of await readdir(opts.set,{withFileTypes:true})){if(entry.isDirectory())for(const name of ['manifest.json','photos.json']){const path=resolve(opts.set,entry.name,name);try{await readFile(path);manifests.push(path);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}}
 if(!manifests.length)throw Error('No fixture manifests found');
 for(const file of manifests.slice(0,opts.limit)){
 const manifest=manifestSchema.parse(JSON.parse(await readFile(file,'utf8')));const dir=dirname(file);
 const local=(p:string)=>{const path=resolve(dir,p);if(!path.startsWith(dir+'/'))throw Error('Fixture path escapes directory');return path;};
 const store={get:async(key:string)=>createReadStream(key)} as ObjectStorage;
 const renderer=new BoundedPageRenderer(store);const results:PageResult[]=[];const pages:any[]=[];const jobStart=Date.now();
 for(const [index,p] of manifest.pages.entries()){
 const attempts:any[]=[];let result:PageResult|undefined;const start=Date.now();let failure:string|undefined;
 for(let attempt=1;attempt<=3;attempt++){
 const abort=new AbortController();const timer=setTimeout(()=>abort.abort(),180000);const callStart=Date.now();
 try{
 const input=await renderer.render({objectKey:local(opts.dry?p.recordedRaster:p.source),contentType:opts.dry?'image/png':p.contentType,sourcePage:opts.dry?1:p.sourcePage,pageIndex:index},abort.signal);
 // Replay at the SDK HTTP boundary: real prompt, schema parser, refusal handling and provider code execute, no network.
 const client=opts.dry?new OpenAI({apiKey:'recorded-fixture-only',maxRetries:0,fetch:async()=>new Response(JSON.stringify({id:'recorded',object:'response',status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(p.recorded),annotations:[]}]}],usage:{input_tokens:100,output_tokens:200}}),{headers:{'content-type':'application/json'}})}):undefined;
 result=await new OpenAITranscriptionProvider(undefined,client).transcribePage(input,results,{},abort.signal);
 attempts.push({attempt,outcome:'completed',usage:result.usage,latencyMs:Date.now()-callStart,estimatedCost:estimatedCost(result.model,result.usage,prices)});break;
 }catch(e){const error=e instanceof ProviderError?e:new ProviderError('infrastructure_error');failure=error.reason;const model=process.env.OPENAI_TRANSCRIPTION_MODEL??'gpt-6.1-sol';attempts.push({attempt,outcome:failure,usage:error.usage??{},latencyMs:Date.now()-callStart,estimatedCost:estimatedCost(model,error.usage??{},prices)});if(!error.retryable||attempt===3)break;await new Promise(r=>setTimeout(r,Math.min(30000,Math.max(250,error.retryAfterMs))));}
 finally{clearTimeout(timer);}
 }
 let accuracy=null,validation=null;if(result){results.push(result);accuracy=compareMusicXML(result.musicxmlFragment,await readFile(local(p.reference),'utf8'));const dom=scoreDocument(result.musicxmlFragment);try{validation=validateMusicDocument(dom.window.document,[],result.uncertainties);}finally{dom.window.close();}}
 pages.push({page:index+1,outcome:result?'completed':failure,attempts,retries:attempts.length-1,latencyMs:Date.now()-start,accuracy,validation,uncertainties:result?.uncertainties??[],flags:result?.flags??[]});if(!result)break;
 }
 let accuracy=null,validation=null;let assemblyError=null;
 if(results.length===manifest.pages.length){try{const assembled=await new ScoreAssembler().assembleDetailed(results);validation=assembled.report;accuracy=compareMusicXML(assembled.xml,await readFile(local(manifest.reference),'utf8'));}catch(e){assemblyError=e instanceof Error?e.message:String(e);}}
 const calls=pages.flatMap(p=>p.attempts);const costKnown=calls.every(c=>c.estimatedCost!==null);
 jobs.push({id:manifest.id,metadata:manifest.metadata,model:process.env.OPENAI_TRANSCRIPTION_MODEL??'gpt-6.1-sol',promptVersion:'transcription-v1',outcome:assemblyError?'assembly_failed':accuracy?'completed':'failed',assemblyError,latencyMs:Date.now()-jobStart,accuracy,validation,usage:{inputTokens:calls.reduce((s,c)=>s+(c.usage.inputTokens??0),0),outputTokens:calls.reduce((s,c)=>s+(c.usage.outputTokens??0),0)},retries:pages.reduce((s,p)=>s+p.retries,0),estimatedCost:costKnown?calls.reduce((s,c)=>s+c.estimatedCost,0):null,pages});
 }
 const report={schemaVersion:1,capturedAt:new Date().toISOString(),mode:opts.dry?'recorded-offline':'live',currency:'USD',priceTable:prices,qualityThresholds:null,jobs};
 const rows=jobs.map(j=>({job:j.id,outcome:j.outcome,pages:j.pages.length,noteF1:j.accuracy?.metrics.notes.f1??null,editMeasures:j.accuracy?.reviewEffort.measuresNeedingEdits??null,costUSD:j.estimatedCost??'unknown'}));console.table(rows);if(opts.pages)console.table(jobs.flatMap(j=>j.pages.map((p:any)=>({job:j.id,page:p.page,outcome:p.outcome,noteF1:p.accuracy?.metrics.notes.f1}))));
 await mkdir(dirname(opts.out),{recursive:true});await writeFile(opts.out,JSON.stringify(report,null,2)+'\n');await writeFile(opts.out.replace(/\.json$/,'')+'.md',`# Transcription evaluation\n\nMode: ${report.mode}. Prices USD per million tokens; missing prices mean unknown, never free. No quality acceptance threshold set.\n\n| Job | Outcome | Pages | Note F1 | Edit measures | Estimated USD |\n|---|---|---:|---:|---:|---:|\n${rows.map(r=>`| ${r.job} | ${r.outcome} | ${r.pages} | ${r.noteF1} | ${r.editMeasures} | ${r.costUSD} |`).join('\n')}\n\nDetailed per-page diagnostics, uncertainties and attempts are in the companion JSON report.\n`);return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)evaluate(process.argv.slice(2)).then(report=>{if(report.jobs.some(j=>j.outcome!=='completed'))process.exitCode=1;}).catch(e=>{console.error(e.message);process.exitCode=1;});
