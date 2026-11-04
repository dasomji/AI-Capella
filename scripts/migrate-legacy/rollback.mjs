import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
// Restricted to harness-owned disposable containers. Never accepts a production URL.
const {values:v}=parseArgs({options:{container:{type:'string'},backup:{type:'string'},sha256:{type:'string'},bytes:{type:'string'}}});
if(!/^aicap-migration-\d+$/.test(v.container??''))throw Error('Only aicap-migration-<pid> disposable containers are supported');
const bytes=readFileSync(v.backup);if(bytes.length!==Number(v.bytes)||createHash('sha256').update(bytes).digest('hex')!==v.sha256)throw Error('Downloaded backup size/hash mismatch');
const r=spawnSync('docker',['exec','-i','-e','PGHOST=/var/run/postgresql','-e','PGCONNECT_TIMEOUT=5',v.container,'pg_restore','-w','-U','postgres','-d','fixture','--clean','--if-exists','--exit-on-error','--single-transaction'],{input:bytes,encoding:'buffer',timeout:180000});
if(r.status!==0)throw Error(r.stderr.toString());console.log('Restored downloaded pre-import archive; run reconciliation to prove the expected missing imports.');
