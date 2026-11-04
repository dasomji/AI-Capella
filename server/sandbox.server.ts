import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { logError } from './logger.server';
export const sandboxLauncher=fileURLToPath(new URL('./inspection-sandbox.py',import.meta.url));
export const sandboxEnv=()=>({PATH:process.env.PATH??'/usr/bin:/bin',MALLOC_ARENA_MAX:'2'});
let canary:Promise<boolean>|undefined;
/** Executed through the actual launcher, with no credentials or inherited Node options. */
export function sandboxReady(){return canary??=new Promise<boolean>(resolve=>{
 const child=spawn('python3',[sandboxLauncher,process.execPath,'--jitless','--max-old-space-size=192','--input-type=module','-e',`import net from 'node:net';net.createServer().listen(0,'127.0.0.1').on('error',e=>process.exit(e.code==='EPERM'?0:1)).on('listening',()=>process.exit(1));`],{detached:true,env:sandboxEnv(),stdio:'ignore'});
 const timer=setTimeout(()=>child.kill('SIGKILL'),5000);
 const done=(ok:boolean)=>{clearTimeout(timer);if(!ok)logError('sandbox.unavailable');resolve(ok);};child.once('error',()=>done(false));child.once('close',code=>done(code===0));
 });}
