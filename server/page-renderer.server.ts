import { mkdir,mkdtemp,open,readFile,rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { ObjectStorage } from './storage.server';
import { ProviderError,type PageRenderer,type PageInput } from './transcription-provider.server';
export class BoundedPageRenderer implements PageRenderer {
 constructor(private store?:ObjectStorage){}
 async render(input:PageInput,signal:AbortSignal):Promise<PageInput>{
 await mkdir('.transcription-tmp',{recursive:true,mode:0o700});const dir=await mkdtemp('.transcription-tmp/render-');
 try{
 if(signal.aborted)throw new ProviderError('provider_timeout',true);
 const stream=await (this.store??(await import('./storage.server')).storage()).get(input.objectKey);const abort=()=>stream.destroy(new Error('aborted'));signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
 const file=await open(dir+'/source','wx',0o600);let bytes=0;
 const timer=setTimeout(abort,15000);
 try{for await(const chunk of stream){bytes+=chunk.length;if(bytes>50*1024*1024)throw new ProviderError('invalid_output');await file.writeFile(chunk);}}finally{clearTimeout(timer);signal.removeEventListener('abort',abort);stream.destroy();await file.close();}
 await new Promise<void>((resolve,reject)=>{
 const child=spawn('python3',[fileURLToPath(new URL('./inspection-sandbox.py',import.meta.url)),process.execPath,'--jitless','--max-old-space-size=192',fileURLToPath(new URL('./page-render.mjs',import.meta.url)),JSON.stringify({path:dir+'/source',dir,contentType:input.contentType,sourcePage:input.sourcePage})],{detached:true,stdio:'ignore',env:{PATH:process.env.PATH}});
 const kill=()=>{if(child.pid){try{process.kill(-child.pid,'SIGKILL');}catch(error){if((error as NodeJS.ErrnoException).code!=='ESRCH')reject(error);}}};const timer=setTimeout(kill,15000);signal.addEventListener('abort',kill,{once:true});if(signal.aborted)kill();
 child.once('error',error=>{clearTimeout(timer);signal.removeEventListener('abort',kill);reject(error);});child.once('close',(code)=>{clearTimeout(timer);signal.removeEventListener('abort',kill);code===0?resolve():reject(new ProviderError(signal.aborted?'provider_timeout':'infrastructure_error',true));});
 });
 return {...input,raster:await readFile(dir+'/raster.png')};
 }finally{await rm(dir,{recursive:true,force:true});}
 }
}
