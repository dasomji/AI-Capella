import { describe, it, test, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { privateName, withinOfflineWindow, OFFLINE_WINDOW_MS, purgeAccount, reconcilePrepared, purgeEnsemble, writeOfflineCatalog } from '../src/offline-store';
describe('offline privacy boundary', () => {
 afterEach(()=>vi.unstubAllGlobals());
 function storageFixture() {
   const names=new Set([privateName('A','one'),privateName('A','two'),privateName('A','_identity'),privateName('B','one'),'unrelated']);
   const values=new Map([['lightscore-offline-account','A']]);
   vi.stubGlobal('localStorage',{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)});
   vi.stubGlobal('window',new EventTarget());
   vi.stubGlobal('indexedDB',{databases:async()=>[...names].map(name=>({name})),deleteDatabase:(name:string)=>{const request:any={};queueMicrotask(()=>{names.delete(name);request.onsuccess();});return request;}});
   return {names,values};
 }
 it('logout/account-switch purge removes every account ensemble and identity, preserving other accounts',async()=>{
   const {names,values}=storageFixture();await purgeAccount('A');
   expect([...names]).toEqual([privateName('B','one'),'unrelated']);expect(values.has('lightscore-offline-account')).toBe(false);
 });
 it('membership revalidation immediately purges revoked ensembles only',async()=>{
   const {names}=storageFixture();await reconcilePrepared('A',['two']);
   expect(names.has(privateName('A','one'))).toBe(false);expect(names.has(privateName('A','two'))).toBe(true);expect(names.has(privateName('A','_identity'))).toBe(true);expect(names.has(privateName('B','one'))).toBe(true);
 });
 it('explicit ensemble eviction preserves identity and other repertoire',async()=>{
   const {names}=storageFixture();await purgeEnsemble('A','one');expect(names.has(privateName('A','one'))).toBe(false);expect(names.has(privateName('A','two'))).toBe(true);
 });
 it('rejects a pending page write before opening a transaction after logout',async()=>{
   storageFixture();
   const transaction=vi.fn(), request:any={};
   (indexedDB as any).open=()=>request;
   const pending=writeOfflineCatalog('A','one',[]);
   await purgeAccount('A');
   request.result={close:vi.fn(),transaction};request.onsuccess();
   await expect(pending).rejects.toThrow('Offline access cleared');expect(transaction).not.toHaveBeenCalled();
 });
 it('scopes private content by account AND ensemble without delimiter collisions', () => {
   expect(new Set([privateName('A','one'),privateName('B','one'),privateName('A','two'),privateName('A:one','two'),privateName('A','one:two')]).size).toBe(5);
 });
 it('bounds verified offline access, including clock rollback and invalid values', () => {
   expect(withinOfflineWindow(100,100+OFFLINE_WINDOW_MS)).toBe(true);
   for (const now of [99, 101+OFFLINE_WINDOW_MS, NaN, Infinity]) expect(withinOfflineWindow(100,now)).toBe(false);
   expect(withinOfflineWindow(NaN)).toBe(false);
   expect(withinOfflineWindow(10,20,5)).toBe(false);
 });
 it('allows only exact public manifest GETs without queries', () => {
   const code=readFileSync('public/sw.js','utf8').replace('/* PUBLIC_ASSETS */ []',JSON.stringify(['/assets/main-hash.js','/samples/piano/p33.mp3','/assets/font-hash.woff2','/assets/verovio-hash.wasm','/offline.html']));
   const allowed=runInNewContext(code+';allowed',{self:{location:{origin:'https://local.test'},addEventListener(){}},URL});
   for(const path of ['/assets/main-hash.js','/samples/piano/p33.mp3','/assets/font-hash.woff2','/assets/verovio-hash.wasm']) expect(allowed({url:'https://local.test'+path,method:'GET'})).toBe(true);
   for(const path of ['/','/app','/api/me','/api/auth/session','/auth/sign-in','/admin','/api/admin/usage','/invite/token','/socket.io/','/scores/one.xml','/originals/one.png','/api/ensembles/a/pieces/b/versions/hash','/assets/unlisted.js','/assets/main-hash.js?X-Amz-Signature=x','/assets/main-hash.js?token=x']) expect(allowed({url:'https://local.test'+path,method:'GET'})).toBe(false);
   expect(allowed({url:'https://other.test/assets/main-hash.js',method:'GET'})).toBe(false);
   expect(allowed({url:'https://local.test/assets/main-hash.js',method:'POST'})).toBe(false);
 });
});

describe('offline review regressions',()=>{
 afterEach(()=>vi.unstubAllGlobals());
 it('rejects a delayed write when another tab increments the ensemble epoch',async()=>{
   const values=new Map([['lightscore-offline-account','A']]);
   vi.stubGlobal('localStorage',{getItem:(k:string)=>values.get(k)??null});
   const request:any={},transaction=vi.fn();
   vi.stubGlobal('indexedDB',{open:()=>request});
   const pending=writeOfflineCatalog('A','one',[]);
   values.set('lightscore-epoch:A:one','1');
   request.result={close:vi.fn(),transaction};request.onsuccess();
   await expect(pending).rejects.toThrow('Offline access cleared');expect(transaction).not.toHaveBeenCalled();
 });
 it('stale membership reconciliation cannot delete an ensemble',async()=>{
   vi.stubGlobal('indexedDB',{databases:async()=>[{name:privateName('A','new-membership')}],deleteDatabase:vi.fn()});
   await reconcilePrepared('A',[],()=>false);expect(indexedDB.deleteDatabase).not.toHaveBeenCalled();
 });
 it('navigation fallback accepts trailing slash and query without caching requests',async()=>{
   const handlers:any={},fallback={offline:true};
   runInNewContext(readFileSync('public/sw.js','utf8'),{URL,self:{location:{origin:'https://local.test'},addEventListener:(name:string,fn:any)=>handlers[name]=fn},fetch:()=>Promise.reject(Error('offline')),caches:{open:async()=>({match:async()=>fallback})}});
   for(const path of ['/app','/app/','/app?x=1']){let response:any;handlers.fetch({request:{url:'https://local.test'+path,method:'GET',mode:'navigate'},respondWith:(r:any)=>response=r});expect(await response).toBe(fallback);}
 });
});

test('a clock behind the server denies restore without purging; shared mode caps at 24 hours',async()=>{
 const {restoreIdentity,offlineWindow}=await import('../src/offline-store');
 const values=new Map([['lightscore-offline-account','skew']]);
 vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null});
 const deleted=vi.fn();
 vi.stubGlobal('indexedDB',{deleteDatabase:deleted,open:()=>{
   const request:any={};queueMicrotask(()=>{request.result={close(){},transaction(){const tx:any={objectStore:()=>({get:()=>{const q={result:{verified:Date.now()+60000,user:{id:'skew'},ensembles:[]}};queueMicrotask(()=>tx.oncomplete());return q;}})};return tx;}};request.onsuccess();});return request;
 }});
 try{expect(await restoreIdentity()).toBeNull();expect(deleted).not.toHaveBeenCalled();expect(offlineWindow()).toBe(OFFLINE_WINDOW_MS);values.set('lightscore-shared-device','1');expect(offlineWindow()).toBe(Math.min(OFFLINE_WINDOW_MS,86400000));}finally{vi.unstubAllGlobals();}
});

test.each([-300000,300000,NaN])('prepare and offline restore use the verified timeline (skew %s)',async(skew)=>{
 const {rememberIdentity,writePrepared,restoreIdentity}=await import('../src/offline-store');
 const values=new Map<string,string>(),databases=new Map<string,Map<string,any>>();
 vi.stubGlobal('localStorage',{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k),get length(){return values.size;},key:(i:number)=>[...values.keys()][i]});
 vi.stubGlobal('window',new EventTarget());
 vi.stubGlobal('indexedDB',{databases:async()=>[...databases.keys()].map(name=>({name})),deleteDatabase:(name:string)=>{const q:any={};queueMicrotask(()=>{databases.delete(name);q.onsuccess();});return q;},open:(name:string)=>{
 const q:any={};if(!databases.has(name))databases.set(name,new Map());const data=databases.get(name)!;
 queueMicrotask(()=>{q.result={close(){},transaction(){const tx:any={objectStore:()=>({get:(k:string)=>request(data.get(k)),put:(v:any,k:string)=>{data.set(k,v);return request(k);},getAll:()=>request([...data.values()])})};function request(result:any){queueMicrotask(()=>tx.oncomplete());return {result};}return tx;}};q.onsuccess();});return q;
 }});
 const now=Date.now();vi.spyOn(Date,'now').mockReturnValue(now);
 try{await rememberIdentity({id:'skew-test',email:'test@example.test',name:'Test'},[{id:'E'}],now-skew);
 await writePrepared('skew-test',{metadata:{id:'p',ensembleId:'E',contentHash:'hash'} as any,body:'score'});
 expect((await restoreIdentity()).user.id).toBe('skew-test');
 localStorage.setItem('lightscore-epoch:skew-test:E','3');localStorage.setItem('lightscore-epoch:other:E','4');
 vi.mocked(Date.now).mockReturnValue(now+15*86400000);expect(await restoreIdentity()).toBeNull();expect(databases.size).toBe(0);expect(localStorage.getItem('lightscore-epoch:skew-test:E')).toBeNull();expect(localStorage.getItem('lightscore-epoch:other:E')).toBe('4');
 }finally{vi.restoreAllMocks();vi.unstubAllGlobals();}
});

test('a transaction with no own error preserves the request quota error',async()=>{
 const quota=new DOMException('full','QuotaExceededError'),open:any={},tx:any={error:null,objectStore:()=>({put:()=>({})})};
 vi.stubGlobal('localStorage',{getItem:(k:string)=>k==='lightscore-offline-account'?'quota-user':null});vi.stubGlobal('indexedDB',{open:()=>open});
 const pending=writeOfflineCatalog('quota-user','ensemble',[]);open.result={close(){},transaction:()=>tx};open.onsuccess();tx.onerror({target:{error:quota}});
 try{await expect(pending).rejects.toBe(quota);}finally{vi.unstubAllGlobals();}
});

test('identity verification falls back to the local clock without an HTTP Date',async()=>{
 const {api,lastVerifiedServerDate}=await import('../src/domain-client');const now=Date.now();vi.spyOn(Date,'now').mockReturnValue(now);
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({user:{id:'date-fixture'}})));
 try{await api('/me');expect(lastVerifiedServerDate()).toBe(now);}finally{vi.restoreAllMocks();vi.unstubAllGlobals();}
});
