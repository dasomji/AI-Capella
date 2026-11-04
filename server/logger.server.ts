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
