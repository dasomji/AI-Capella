export const heartbeatInterval=(leaseMs:number)=>Math.max(1000,leaseMs/5);
export const heartbeatStale=(now:number,last:number,lease:number)=>now-last>=lease-heartbeatInterval(lease);
export async function withinAbort<T>(signal:AbortSignal,work:()=>Promise<T>):Promise<T>{
 signal.throwIfAborted();let rejectAbort:()=>void=()=>{};
 const deadline=new Promise<never>((_,reject)=>{rejectAbort=()=>reject(new Error('lease_deadline'));signal.addEventListener('abort',rejectAbort,{once:true});if(signal.aborted)rejectAbort();});
 try{return await Promise.race([Promise.resolve().then(work),deadline]);}finally{signal.removeEventListener('abort',rejectAbort);}
}
/** Time source for lease timing. Tests inject a virtual clock so lease deadlines do not depend on machine speed. */
export interface LeaseClock{now():number;setTimeout(fn:()=>void,ms:number):unknown;clearTimeout(handle:unknown):void;setInterval(fn:()=>void,ms:number):unknown;clearInterval(handle:unknown):void;}
export const systemClock:LeaseClock={now:()=>performance.now(),setTimeout:(fn,ms)=>setTimeout(fn,ms),clearTimeout:handle=>clearTimeout(handle as ReturnType<typeof setTimeout>),setInterval:(fn,ms)=>setInterval(fn,ms),clearInterval:handle=>clearInterval(handle as ReturnType<typeof setInterval>)};
