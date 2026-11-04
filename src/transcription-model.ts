import { tr, type Lang } from './i18n';
import type { MeasureSource, ValidationReport } from './score-validation';
export interface JobPage {page_number:number;source_page:number;state:string;object_id:string;content_type:string;original_filename?:string;failure_reason?:string}
export interface TranscriptionJob {id:string;state:string;stage:string;failure_reason?:string;imported_piece_id?:string;options?:{title?:string};pages:JobPage[]}
export function reorderPhotos<T>(items:readonly T[],from:number,to:number):T[] {
 const result=[...items];if(from<0||to<0||from>=items.length||to>=items.length)return result;
 const [item]=result.splice(from,1);result.splice(to,0,item);return result;
}
export function jobPresentation(job:TranscriptionJob,language?:Lang) {
 const say=(key:string,values={})=>tr(key,values,language);
 const running=job.pages.find(p=>p.state==='running');
 const key=job.imported_piece_id?'imported':job.stage==='processing_paused'?'paused':['uploading','assembling','validating'].includes(job.stage)?job.stage:job.state==='completed'?'ready':job.state==='failed'?'failed':job.state==='cancelled'?'cancelled':running?'reading':job.pages.length&&job.pages.every(p=>['completed','skipped'].includes(p.state))?'assembling':'queued';
 return {text:say(key,{reason:say(job.failure_reason??'infrastructure_error'),n:(running?.page_number??0)+1,total:job.pages.length}),segments:job.pages.map(p=>p.state==='completed'?'completed':p.state==='skipped'?'skipped':p.state==='running'?'running':['failed','cancelled'].includes(p.state)?'failed':'queued')};
}
export interface ReviewItem {kind:'warning'|'uncertainty';measure?:number;part?:string;page?:number;code:string;message?:string}
export function reviewItems(report:{measures:MeasureSource[];validation:ValidationReport|null}):ReviewItem[] {
 const warnings=(report.validation?.warnings??[]).filter(w=>w.code!=='skipped_page').map(w=>({kind:'warning' as const,code:w.code,part:w.part,measure:w.measure,page:w.source?.page??report.measures.find(s=>w.measure!==undefined&&s.measure<=w.measure&&(s.endMeasure??s.measure)>=w.measure&&(!w.part||s.part===w.part))?.page}));
 const uncertainties=(report.validation?.uncertainties??[]).filter((u):u is Record<string,unknown>=>!!u&&typeof u==='object').map(u=>{
 const page=typeof u.page==='number'?u.page:undefined,part=typeof u.part==='string'?u.part:undefined;
 const localNumber=Number(u.measure);
 const source=report.measures.find(s=>(page===undefined||s.page===page)&&(!part||s.part===part)&&(u.measure===undefined||s.localMeasure===String(u.measure)||(s.localMeasureEnd!==undefined&&localNumber>=Number(s.localMeasure)&&localNumber<=Number(s.localMeasureEnd))));
 const measure=source?source.measure+(source.endMeasure!==undefined&&Number.isFinite(localNumber)?Math.min(source.endMeasure-source.measure,Math.max(0,localNumber-Number(source.localMeasure))):0):undefined;
 return {kind:'uncertainty' as const,code:'reviewPassage',measure,part:source?.part??part,page:source?.page??page,message:typeof u.reason==='string'?u.reason:typeof u.message==='string'?u.message:undefined};
 });return [...warnings,...uncertainties];
}
