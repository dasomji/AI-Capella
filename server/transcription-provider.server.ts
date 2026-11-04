export type FailureReason='provider_refusal'|'provider_timeout'|'rate_limited'|'invalid_output'|'truncated'|'cancelled'|'permission_revoked'|'emergency_stop'|'abandoned'|'infrastructure_error'|'model_unavailable'|'provider_account_error'|'render_failed'|'sandbox_unavailable';
export class ProviderError extends Error {constructor(public reason:FailureReason,public retryable=false,public retryAfterMs=0,public usage?:{inputTokens:number;outputTokens:number},public requestId?:string){super(reason);}}
export type PageInput={objectKey:string;contentType:string;sourcePage:number;pageIndex:number;raster?:Buffer};
export type PageResult={musicxmlFragment:string;uncertainties:unknown[];usage:{inputTokens:number;outputTokens:number};model:string;latency:number;requestId?:string;flags?:string[];promptVersion?:string};
export interface TranscriptionProvider {model:string;promptVersion:string;transcribePage(input:PageInput,context:PageResult[],options:Record<string,unknown>,signal:AbortSignal):Promise<PageResult>;}
export interface PageRenderer {render(input:PageInput,signal:AbortSignal):Promise<PageInput>;}
/** Phase 4a preserves a PDF page reference; 4b supplies bounded rasterization. */
export class ReferenceRenderer implements PageRenderer {async render(input:PageInput){return input;}}
export class FakeProvider implements TranscriptionProvider {
 model='fake-transcription-v1';promptVersion='fake-prompt-v1';
 constructor(private behavior:(input:PageInput)=>'success'|'uncertain'|FailureReason=()=> 'success',private delay=0){}
 async transcribePage(input:PageInput,_context:PageResult[],_options:Record<string,unknown>,signal:AbortSignal):Promise<PageResult>{
 const start=Date.now();if(this.delay)await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(new ProviderError('provider_timeout',true));};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},this.delay);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});
 const mode=this.behavior(input);
 if(mode!=='success' && mode!=='uncertain' && mode!=='invalid_output' && mode!=='truncated')throw new ProviderError(mode,['provider_timeout','rate_limited'].includes(mode));
 return {musicxmlFragment:mode==='invalid_output'?'garbage':mode==='truncated'?'<measure>':`<measure number="${input.pageIndex+1}"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note></measure>`,uncertainties:mode==='uncertain'?[{page:input.pageIndex,message:'Review this passage'}]:[],usage:{inputTokens:0,outputTokens:0},model:this.model,latency:Date.now()-start};
 }
}
export interface JobAssembler {assemble(pages:PageResult[]):Promise<string>;}
export class FakeAssembler implements JobAssembler {async assemble(pages:PageResult[]){return `<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Fake transcription</part-name></score-part></part-list><part id="P1">${pages.map(p=>p.musicxmlFragment).join('')}</part></score-partwise>`;}}
