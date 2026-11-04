export const heartbeatInterval=(leaseMs:number)=>Math.max(1000,leaseMs/5);
export const heartbeatStale=(now:number,last:number,lease:number)=>now-last>=lease-heartbeatInterval(lease);
export async function withinAbort<T>(signal:AbortSignal,work:()=>Promise<T>):Promise<T>{
 signal.throwIfAborted();let rejectAbort:()=>void=()=>{};
 const deadline=new Promise<never>((_,reject)=>{rejectAbort=()=>reject(new Error('lease_deadline'));signal.addEventListener('abort',rejectAbort,{once:true});if(signal.aborted)rejectAbort();});
 try{return await Promise.race([Promise.resolve().then(work),deadline]);}finally{signal.removeEventListener('abort',rejectAbort);}
}
