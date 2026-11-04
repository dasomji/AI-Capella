import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, writeFile } from 'node:fs/promises';
const run=(cmd,args,options={})=>{const r=spawnSync(cmd,args,{stdio:'inherit',...options});if(r.status!==0)throw Error(cmd+' failed');return r;};
async function port(){const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
run(process.execPath,['node_modules/typescript/bin/tsc','--noEmit','-p','scripts/migrate-legacy/tsconfig.json']);
const name='aicap-migration-'+process.pid;const root=process.cwd()+'/migration/.runtime/'+process.pid;await mkdir(root,{recursive:true});
const dbPort=await port(),firePort=await port(),appPort=await port();const env={...process.env,NODE_ENV:'test',DATABASE_URL:`postgres://postgres:fixture-only@127.0.0.1:${dbPort}/fixture`,BETTER_AUTH_SECRET:'migration-fixture-secret-at-least-32-characters',BETTER_AUTH_URL:`http://localhost:${appPort}`,TRUSTED_ORIGINS:`http://localhost:${appPort}`,PORT:String(appPort),MAIL_TRANSPORT:'capture',FIRESTORE_EMULATOR_HOST:`127.0.0.1:${firePort}`,METADATA_SERVER_DETECTION:'none',MIGRATION_TEST_ROOT:root,MIGRATION_TEST_CONTAINER:name,TZ:'Pacific/Honolulu'};
await writeFile(root+'/firebase.json',JSON.stringify({emulators:{firestore:{host:'127.0.0.1',port:firePort,websocketPort:await port()},ui:{enabled:false},hub:{port:await port()},logging:{port:await port()}},firestore:{rules:process.cwd()+'/firestore.rules'}}));
try{run('docker',['run','-d','--name',name,'-e','POSTGRES_PASSWORD=fixture-only','-e','POSTGRES_DB=fixture','-p',`127.0.0.1:${dbPort}:5432`,'postgres:17-alpine']);let ready=false;for(let i=0;i<100;i++){if(spawnSync('docker',['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres'],{stdio:'ignore'}).status===0){ready=true;break;}await new Promise(r=>setTimeout(r,100));}if(!ready)throw Error('Postgres readiness timeout');run(process.execPath,['--import','tsx','scripts/migrate.ts'],{env});
const child=spawn('rules-test/node_modules/.bin/firebase',['emulators:exec','--only','firestore','--project','demo-migration','--config',root+'/firebase.json',`${process.execPath} --import tsx --test tests/migration.test.ts`],{env,stdio:'inherit'});process.exitCode=await new Promise(r=>child.on('exit',c=>r(c??1)));
}finally{run('docker',['rm','-fv',name]);}
