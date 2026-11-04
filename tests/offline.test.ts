import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { privateName, withinOfflineWindow, OFFLINE_WINDOW_MS, purgeAccount, reconcilePrepared, purgeEnsemble, writeOfflineCatalog } from '../src/offline-store';
describe('offline privacy boundary', () => {
 afterEach(()=>vi.unstubAllGlobals());
 function storageFixture() {
   const names=new Set([privateName('A','one'),privateName('A','two'),privateName('A','_identity'),privateName('B','one'),'unrelated']);
   const values=new Map([['lightscore-offline-account','A']]);
   vi.stubGlobal('localStorage',{getItem:(k:string)=>values.get(k)??null,removeItem:(k:string)=>values.delete(k)});
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
