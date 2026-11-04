// Uses the same disposable Postgres/Mailpit + built-start harness as other browser tests.
// Point S3_ENDPOINT at a local SeaweedFS instance. Each run owns and removes its bucket.
import { spawn } from 'node:child_process';
const child=spawn(process.execPath,['scripts/browser-isolated.mjs'],{stdio:'inherit',env:{...process.env,S3_ENDPOINT:process.env.S3_ENDPOINT??'http://127.0.0.1:28333',S3_BUCKET:`transcription-browser-${process.pid}-${Date.now()}`,S3_ACCESS_KEY_ID:process.env.S3_ACCESS_KEY_ID??'local-only',S3_SECRET_ACCESS_KEY:process.env.S3_SECRET_ACCESS_KEY??'local-only',BROWSER_SCRIPT:'scripts/browser-transcription.mjs',BROWSER_EVIDENCE:process.env.BROWSER_EVIDENCE??`${process.cwd()}/.review-evidence/p4c`}});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>child.kill(signal));
process.exitCode=await new Promise(resolve=>child.once('exit',code=>resolve(code??1)));
