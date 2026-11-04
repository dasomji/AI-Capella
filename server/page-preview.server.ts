import { UploadSlots } from './upload-slots.server';
/** Independent admission: two renders, four waiting requests, two seconds maximum. */
export class PreviewAdmission {
 private slots=new UploadSlots(2,2);private waiting=0;
 async take(user:string,signal:AbortSignal){
  const first=this.slots.take(user);if(!('code' in first))return first;
  if(this.waiting>=4)throw Error('render_busy');this.waiting++;
  const until=Date.now()+2000;
  try{while(Date.now()<until){signal.throwIfAborted();await new Promise(r=>setTimeout(r,25));const slot=this.slots.take(user);if(!('code' in slot))return slot;}throw Error('render_busy');}finally{this.waiting--;}
 }
}
/** Memory-only derived PNGs; eviction can never delete original storage. */
export class PreviewCache {
 private entries=new Map<string,Uint8Array>();private bytes=0;
 constructor(private maxBytes=32*1024*1024){}
 get(key:string){const value=this.entries.get(key);if(value){this.entries.delete(key);this.entries.set(key,value);}return value;}
 set(key:string,value:Uint8Array){const old=this.entries.get(key);if(old)this.bytes-=old.byteLength;this.entries.delete(key);if(value.byteLength>this.maxBytes)return;this.entries.set(key,value);this.bytes+=value.byteLength;while(this.bytes>this.maxBytes){const first=this.entries.keys().next().value!;this.bytes-=this.entries.get(first)!.byteLength;this.entries.delete(first);}}
}
export const previewAdmission=new PreviewAdmission(),previewCache=new PreviewCache();
const audited=new Map<string,number>();
export function needsPreviewAudit(user:string,object:string,now=Date.now()){
 for(const [key,time] of audited)if(now-time>=600000)audited.delete(key);
 const key=JSON.stringify([user,object]);if(audited.has(key))return false;
 if(audited.size>=10000)audited.delete(audited.keys().next().value!);
 audited.set(key,now);return true;
}
