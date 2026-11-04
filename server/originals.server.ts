import { mkdir, mkdtemp, open, rm, readdir, lstat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { storage, type ObjectStorage } from './storage.server';
import { transaction, authorize, audit, DomainError, lockEnsemble } from './domain.server';
import { pool } from './db/index.server';
import { env } from './env.server';
export const sourceLimits={pdf:env.TRANSCRIPTION_PDF_MAX_BYTES,photo:env.TRANSCRIPTION_PHOTO_MAX_BYTES,pages:env.TRANSCRIPTION_MAX_PAGES,pixels:env.TRANSCRIPTION_MAX_PIXELS};
export async function inspectSource(path:string):Promise<{type:string;pages:number;width?:number;height?:number}> {
 return new Promise((resolve,reject)=>{
 const child=spawn('python3',[fileURLToPath(new URL('./inspection-sandbox.py',import.meta.url)),process.execPath,'--jitless','--max-old-space-size=192',fileURLToPath(new URL('./source-inspect.mjs',import.meta.url)),JSON.stringify({path,maxPages:sourceLimits.pages,maxPixels:sourceLimits.pixels})],{stdio:['ignore','pipe','ignore'],env:{PATH:process.env.PATH}});
 let output='';let expired=false;
 const timer=setTimeout(()=>{expired=true;child.kill('SIGKILL');},10000);
 child.stdout.on('data',chunk=>{output+=chunk;if(output.length>4096)child.kill('SIGKILL');});
 child.once('error',()=>{clearTimeout(timer);reject(new DomainError('invalid_source',422));});
 child.once('close',(code,signal)=>{clearTimeout(timer);
 if(expired || code || signal){reject(new DomainError('source_too_complex',422));return;}
 try{const r=JSON.parse(output);r.error?reject(new DomainError(r.error,422)):resolve(r);}catch{reject(new DomainError('invalid_source',422));}
 });
 });
}
export async function uploadOriginal(user:string,ensemble:string,body:ReadableStream<Uint8Array>,filename:string,store:ObjectStorage=storage()) {
 await authorize(pool,user,ensemble,'transcribe');
 if(env.NODE_ENV==='development' && 'initialize' in store)await (store as import('./storage.server').S3Storage).initialize();
 await mkdir('.transcription-tmp',{recursive:true,mode:0o700});const dir=await mkdtemp('.transcription-tmp/upload-');const path=dir+'/source';
 const reader=body.getReader();const file=await open(path,'wx',0o600);const hash=createHash('sha256');let size=0;let first=Buffer.alloc(0);let limit=sourceLimits.pdf;
 let timedOut=false;const expire=()=>{timedOut=true;void reader.cancel();};let idle=setTimeout(expire,30000);const timer=setTimeout(expire,600000);
 try {
 while(true){const chunk=await reader.read();if(chunk.done)break;clearTimeout(idle);idle=setTimeout(expire,30000);size+=chunk.value.length;
 if(first.length<5){first=Buffer.concat([first,Buffer.from(chunk.value.subarray(0,5-first.length))]);if(first.length===5 && first.toString()!=='%PDF-')limit=sourceLimits.photo;}
 if(size>limit)throw new DomainError('body_too_large',413);
 hash.update(chunk.value);await file.writeFile(chunk.value);
 }
 if(timedOut)throw new DomainError('upload_timeout',408);
 await file.close();const info=await inspectSource(path);if(size>(info.type==='application/pdf'?sourceLimits.pdf:sourceLimits.photo))throw new DomainError('body_too_large',413);
 const digest=hash.digest('hex');
 const key=`ensembles/${ensemble}/originals/${randomUUID()}`;
 // Commit orphan protection before streaming; never hold an ensemble lock over I/O.
 await pool.query('insert into object_deletions(object_key) values($1)',[key]);
 await store.put(key,createReadStream(path),size,info.type);
 return await transaction(async db=>{
 await lockEnsemble(db,ensemble);await authorize(db,user,ensemble,'transcribe');
 const old=(await db.query("select * from stored_objects where ensemble_id=$1 and sha256=$2 and kind='original' and state='ready'",[ensemble,digest])).rows[0];if(old)return old;
 const used=(await db.query("select coalesce(sum(size),0)::text as bytes from stored_objects where ensemble_id=$1 and kind='original' and state='ready'",[ensemble])).rows[0];
 if(Number(used.bytes)+size>env.TRANSCRIPTION_STORAGE_MAX_BYTES)throw new DomainError('storage_limit',413);
 const row=(await db.query("insert into stored_objects(ensemble_id,user_id,object_key,kind,size,content_type,sha256,original_filename,provenance,state) values($1,$2,$3,'original',$4,$5,$6,$7,$8,'ready') returning *",[ensemble,user,key,size,info.type,digest,filename.replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'').replace(/[\x00-\x1f\x7f/\\]/g,'_').slice(0,200),JSON.stringify(info)])).rows[0];
 await db.query('delete from object_deletions where object_key=$1',[key]);await audit(db,ensemble,user,'original.upload',row.id);return row;
 });
 } finally {clearTimeout(timer);clearTimeout(idle);await reader.cancel().catch(()=>{});reader.releaseLock();await file.close().catch(()=>{});await rm(dir,{recursive:true,force:true});}
}
/** Only explicit outbox keys without live DB references, or explicitly selected derivatives. */
export async function cleanupObjects(store:ObjectStorage=storage()) {
 await cleanupStaging();
 const rows=await pool.query("select object_key from object_deletions where created_at<now()-interval '1 hour' and not exists(select 1 from stored_objects s where s.object_key=object_deletions.object_key)");
 for(const r of rows.rows){await store.delete(r.object_key);await pool.query('delete from object_deletions where object_key=$1',[r.object_key]);}
}

export async function cleanupDerived(before:Date,store:ObjectStorage=storage()) {
 // Lock selection and enqueue deletion atomically; never select originals, even failed ones.
 return transaction(async db=>{
 const rows=(await db.query("delete from stored_objects where kind='derived' and created_at<$1 and not exists(select 1 from job_pages where object_id=stored_objects.id) returning object_key",[before])).rows;
 for(const row of rows)await db.query('insert into object_deletions(object_key) values($1) on conflict do nothing',[row.object_key]);
 return rows.length;
 });
}

export async function cleanupStaging(now=new Date()) {
 let entries:string[];
 try{entries=await readdir('.transcription-tmp');}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return;throw error;}
 for(const name of entries.filter(name=>name.startsWith('upload-')).slice(0,100)){
 const path='.transcription-tmp/'+name;
 try{const info=await lstat(path);if(info.isDirectory() && info.mtimeMs<now.getTime()-3600000)await rm(path,{recursive:true,force:true});}
 catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 }
}
