import {test,expect,vi,beforeEach,afterEach} from 'vitest';
const state=vi.hoisted(()=>({rows:[] as any[],saved:[] as any[],writes:[] as any[],quota:false}));
vi.mock('../src/ensembles',()=>({account:{id:'A'},ensembleById:()=>({id:'E'}),activeEnsemble:()=> 'E',canEditPieces:()=>true,PUBLIC_ID:'public'}));
vi.mock('../src/domain-client',async original=>({...await original<any>(),api:async()=>state.rows}));
vi.mock('socket.io-client',()=>({io:()=>({on(){},emit(){},disconnect(){},connect(){}})}));
vi.mock('../src/offline-store',async original=>({...await original<any>(),readPrepared:async()=>state.saved,writeOfflineCatalog:async()=>{},removePrepared:async()=>{},writePrepared:async(_user:any,row:any,valid:any)=>{if(state.quota)throw new DOMException('full','QuotaExceededError');if(valid())state.writes.push(row);}}));
import {subscribeToSongs,preparePiece,unpreparePiece,isPrepared,clearLibrary,scoreBody,preparePieces} from '../src/library';
import {isOffline,setOffline} from '../src/offline-state';
const row=(id:string,hash='old')=>({id,ensembleId:'E',contentHash:hash,revision:1,settings:{},sortKey:id});
beforeEach(()=>{localStorage.setItem('lightscore-offline-account','A');state.rows=[row('one'),row('two')];state.saved=[];state.writes=[];state.quota=false;setOffline(false);});
afterEach(()=>{clearLibrary();vi.unstubAllGlobals();});
const subscribe=async()=>{subscribeToSongs(()=>{},()=>{},'E');await vi.waitFor(()=>expect(isPrepared('one')).toBe(true));};
test('500 refreshing a prepared piece retains it and leaves the app online',async()=>{
 state.saved=[{metadata:row('one'),body:'old body'}];state.rows=[row('one','new')];
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('failed',{status:500})));
 const notice=vi.fn();window.addEventListener('offline:refresh-failed',notice,{once:true});
 await subscribe();await vi.waitFor(()=>expect(notice).toHaveBeenCalled());expect(isOffline()).toBe(false);expect(isPrepared('one')).toBe(true);expect(state.writes).toHaveLength(0);expect(await scoreBody('one')).toBe('old body');expect(isOffline()).toBe(false);expect(fetch).toHaveBeenCalledWith(expect.any(String),{cache:'no-store'});
});
test('unpreparing one piece does not cancel a second in-flight prepare',async()=>{
 state.saved=[{metadata:row('one'),body:'one'}];await subscribe();
 let release!:(value:Response)=>void;vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(resolve=>release=resolve)));
 const pending=preparePiece('two');await unpreparePiece('one');release(new Response('two'));
 await pending;expect(isPrepared('two')).toBe(true);expect(state.writes.map(r=>r.metadata.id)).toEqual(['two']);
});
test('quota exhaustion reports the actionable offline message',async()=>{
 state.saved=[{metadata:row('one'),body:'one'}];await subscribe();state.quota=true;
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('two')));
 await expect(preparePiece('two')).rejects.toThrow('Nicht genug Speicherplatz für Offline-Stücke.');expect(isOffline()).toBe(false);
});

test('bulk preparation continues after a failed piece and counts failures and skips',async()=>{
 const notify=vi.fn();subscribeToSongs(notify,()=>{},'E');await vi.waitFor(()=>expect(notify).toHaveBeenCalled());
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>new Response('body',{status:url.includes('/one/')?500:200})));
 expect(await preparePieces(['one','two','missing'])).toEqual({failed:1,skipped:1});expect(isPrepared('two')).toBe(true);
});

test('evicting another ensemble does not cancel this ensemble preparation',async()=>{
 state.saved=[{metadata:row('one'),body:'one'}];await subscribe();
 let release!:(value:Response)=>void;vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(resolve=>release=resolve)));
 const pending=preparePiece('two');window.dispatchEvent(new CustomEvent('offline:ensemble-purged',{detail:{user:'A',ensemble:'different',revoked:false}}));
 release(new Response('two'));await pending;expect(isPrepared('two')).toBe(true);
});
