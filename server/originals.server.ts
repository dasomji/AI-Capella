import { mkdir, mkdtemp, open, rm } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { storage, type ObjectStorage } from './storage.server';
import { transaction, authorize, audit, DomainError, lockEnsemble } from './domain.server';
import { pool } from './db/index.server';
import { env } from './env.server';
export const sourceLimits={pdf:env.TRANSCRIPTION_PDF_MAX_BYTES,photo:env.TRANSCRIPTION_PHOTO_MAX_BYTES,pages:env.TRANSCRIPTION_MAX_PAGES,pixels:env.TRANSCRIPTION_MAX_PIXELS};
export async function inspectSource(path:string):Promise<{type:string;pages:number;width?:number;height?:number}> {
 return new Promise((resolve,reject)=>{
 const worker=new Worker(new URL('./source-inspect.mjs',import.meta.url),{workerData:{path,maxPages:sourceLimits.pages,maxPixels:sourceLimits.pixels},resourceLimits:{maxOldGenerationSizeMb:192}});
 const timer=setTimeout(()=>{void worker.terminate();reject(new DomainError('inspection_timeout',422));},10000);
 worker.once('message',r=>{clearTimeout(timer);void worker.terminate();r.error?reject(new DomainError(r.error,422)):resolve(r);});
 worker.once('error',()=>{clearTimeout(timer);reject(new DomainError('invalid_source',422));});
 worker.once('exit',code=>{clearTimeout(timer);if(code)reject(new DomainError('invalid_source',422));});
 });
}
export async function uploadOriginal(user:string,ensemble:string,body:ReadableStream<Uint8Array>,filename:string,store:ObjectStorage=storage()) {
 await authorize(pool,user,ensemble,'transcribe');
 await mkdir('.transcription-tmp',{recursive:true,mode:0o700});const dir=await mkdtemp('.transcription-tmp/upload-');const path=dir+'/source';
 const reader=body.getReader();const file=await open(path,'wx',0o600);const hash=createHash('sha256');let size=0;let first=Buffer.alloc(0);let limit=sourceLimits.pdf;
 const timer=setTimeout(()=>{void reader.cancel();},30000);
 try {
 while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;
 if(first.length<5){first=Buffer.concat([first,Buffer.from(chunk.value.subarray(0,5-first.length))]);if(first.length===5 && first.toString()!=='%PDF-')limit=sourceLimits.photo;}
 if(size>limit)throw new DomainError('body_too_large',413);
 hash.update(chunk.value);await file.writeFile(chunk.value);
 }
 await file.close();const info=await inspectSource(path);if(size>(info.type==='application/pdf'?sourceLimits.pdf:sourceLimits.photo))throw new DomainError('body_too_large',413);
 const digest=hash.digest('hex');
 return await transaction(async db=>{
 await lockEnsemble(db,ensemble);await authorize(db,user,ensemble,'transcribe');
 const old=(await db.query("select * from stored_objects where ensemble_id=$1 and sha256=$2 and kind='original' and state='ready'",[ensemble,digest])).rows[0];if(old)return old;
 const key=`ensembles/${ensemble}/originals/${randomUUID()}`;
 // The outbox is committed before upload separately; it also catches DB rollback/crash orphans.
 await pool.query('insert into object_deletions(object_key) values($1)',[key]);
 await store.put(key,createReadStream(path),size,info.type);
 const row=(await db.query("insert into stored_objects(ensemble_id,user_id,object_key,kind,size,content_type,sha256,original_filename,provenance,state) values($1,$2,$3,'original',$4,$5,$6,$7,$8,'ready') returning *",[ensemble,user,key,size,info.type,digest,filename.replace(/[\x00-\x1f\x7f/\\]/g,'_').slice(0,200),JSON.stringify(info)])).rows[0];
 await db.query('delete from object_deletions where object_key=$1',[key]);await audit(db,ensemble,user,'original.upload',row.id);return row;
 });
 } finally {clearTimeout(timer);await reader.cancel().catch(()=>{});reader.releaseLock();await file.close().catch(()=>{});await rm(dir,{recursive:true,force:true});}
}
/** Only explicit outbox keys without live DB references, or explicitly selected derivatives. */
export async function cleanupObjects(store:ObjectStorage=storage()) {
 const rows=await pool.query("select object_key from object_deletions where created_at<now()-interval '1 hour' and not exists(select 1 from stored_objects s where s.object_key=object_deletions.object_key)");
 for(const r of rows.rows){await store.delete(r.object_key);await pool.query('delete from object_deletions where object_key=$1',[r.object_key]);}
}
