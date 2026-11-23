import { AsyncLocalStorage } from 'node:async_hooks';
const requests = new AsyncLocalStorage<string>();
export function withRequestLog<T>(id: string, run: () => T): T { return requests.run(id, run); }
// Never serialize error messages, request bodies, URLs, headers or arbitrary metadata.
// Dependency errors can embed credentials, SQL parameters and reset links.
export function logError(event: string, error?: unknown, requestId?: string) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : undefined;
  console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', event,
    requestId: requestId ?? requests.getStore(), code: code && /^[A-Z0-9_]{2,40}$/.test(code) ? code : undefined }));
}

/** Deliberate allowlist of metadata; never serialize provider messages or bodies. */
export function logProviderError(reason:string,status?:number,code?:string|null,requestId?:string){
 const safe=(v:string|undefined|null)=>v&&/^[a-zA-Z0-9_-]{1,160}$/.test(v)?v:undefined;
 console.error(JSON.stringify({timestamp:new Date().toISOString(),level:'error',event:'transcription.provider',reason:safe(reason),status,code:safe(code),requestId:safe(requestId)}));
}

/** Native child diagnostics only; provider errors use the metadata-only logger above. */
export function logChildError(event:string,stderr:string,code?:number|null){
 console.error(JSON.stringify({timestamp:new Date().toISOString(),level:'error',event,code,stderr:stderr.replace(/[\x00-\x08\x0b-\x1f\x7f]/g,'').replace(/\.transcription-tmp\/[a-zA-Z0-9_-]+/g,'[staging]').slice(-2048)}));
}

/** Explicit admin operational fields, sent to stdout for the log collector (ADR 0007). */
export function logAdminContentAccess(actor: string, targetType: 'piece' | 'original', targetId: string, reason: string) {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', event: 'admin.content_access',
    requestId: requests.getStore(), actor, targetType, targetId, reason }));
}

import { createHash } from 'node:crypto';
const limitRequests = new AsyncLocalStorage<{route:string; hit:boolean}>();
const routeWords = new Set('api auth sign-in sign-up email request-password-reset reset-password send-verification-email verify-email verify-email-password get-session sign-out delete-account account ensembles invitations resend members pieces versions settings reorder originals pages transcriptions import cancel retry result report transcription config admin users sysadmin control usage metrics failures rehearsal read command socket join clock content download'.split(' '));
/** Keep only known route vocabulary: path parameters and queries can contain secrets. */
export function limitRoute(route:string) {
  return route.split('?')[0].split('/').map(p=>!p?'':routeWords.has(p)?p:':id').join('/');
}
export function withLimitRequest<T>(route:string,run:()=>T):T {
  return limitRequests.run({route:limitRoute(route),hit:false},run);
}
/** One allowlisted stdout event per rejected request. Never accepts arbitrary metadata. */
export function logLimitHit(limit:string,scope:'ip'|'user'|'ensemble'|'server',value:number,route?:string) {
  const request=limitRequests.getStore();
  if(request?.hit)return;
  if(request)request.hit=true;
  console.log(JSON.stringify({timestamp:new Date().toISOString(),level:'warn',event:'limit.hit',
    limit:/^[a-z][a-z0-9_.]{0,100}$/.test(limit)?limit:'unknown',scope:['ip','user','ensemble','server'].includes(scope)?scope:'server',
    value:Number.isFinite(value)?value:0,route:limitRoute(route??request?.route??'/transcription')}));
}
export function logRejectedRequest(event:'domain.denied'|'admin.origin_rejected'|'admin.denied',route:string) {
  console.log(JSON.stringify({timestamp:new Date().toISOString(),level:'warn',event,route:limitRoute(route)}));
}
export function logStorageUsage(ensemble:string,bytes:number) {
  console.log(JSON.stringify({timestamp:new Date().toISOString(),level:'info',event:'storage.usage',
    ensemble:createHash('sha256').update(ensemble).digest('hex'),bytes}));
}
/** Child validators return typed codes; logging happens in the server, never child stdout. */
export function logValidationLimit(error:unknown) {
  const code=(error as {code?:string})?.code;
  if(code==='nesting_limit')logLimitHit('score.nesting','server',64);
  if(error && typeof error==='object' && 'issues' in error && Array.isArray(error.issues)) {
    for(const issue of error.issues)if(issue.code==='too_big' && typeof issue.maximum==='number') {
      logLimitHit(issue.origin==='string'?'input.text':'input.items','server',issue.maximum);break;
    }
  }
}
