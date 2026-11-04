import { TranscriptionWorker } from './transcription.server';
import { pool } from './db/index.server';
import { env } from './env.server';
import { storage } from './storage.server';
import { cleanupObjects } from './originals.server';
import { logError } from './logger.server';
if(env.NODE_ENV==='development')await storage().initialize();
let stopping=false;for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{stopping=true;});
const worker=new TranscriptionWorker();
try{while(!stopping){try{await cleanupObjects();await worker.recoverAssembly();const worked=await Promise.all(Array.from({length:env.TRANSCRIPTION_WORKER_CONCURRENCY},()=>worker.tick()));if(!worked.some(Boolean))await new Promise(r=>setTimeout(r,500));}catch(error){logError('transcription.worker',error);await new Promise(r=>setTimeout(r,1000));}}}finally{await pool.end();}
