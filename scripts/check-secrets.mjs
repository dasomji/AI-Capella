import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
const clientRoot = `${process.env.LIGHTSCORE_BUILD_ROOT || 'dist'}/client`;
const names = ['DATABASE_URL','BETTER_AUTH_SECRET','RESEND_API_KEY','S3_ACCESS_KEY_ID','S3_SECRET_ACCESS_KEY','OPENAI_API_KEY'];
const sentinels = Object.fromEntries(names.map(name => [name, `SENTINEL_${name}_must_never_reach_browser_284392`]));
sentinels.DATABASE_URL = `postgres://sentinel:SENTINEL_DATABASE_URL_must_never_reach_browser_284392@localhost/test`;
const control = 'SENTINEL_PUBLIC_VITE_positive_control_284392';
const markers = ['BETTER_AUTH_SECRET','DATABASE_URL','RESEND','drizzle-orm','node_modules/pg','.server.ts','server/','ai-capella.firebase','ai-capella.firebasestorage','firestore.googleapis','firebaseio','AIza'];
async function artifacts(path) {
  const result = [];
  for (const entry of await readdir(path, {withFileTypes:true})) {
    const file = `${path}/${entry.name}`;
    if (entry.isDirectory()) result.push(...await artifacts(file));
    else result.push({file, data:await readFile(file,'utf8')});
  }
  return result;
}
function build(extra = {}) { const r = spawnSync('npm',['run','build'],{env:{...process.env,...sentinels,...extra},stdio:'inherit'}); if (r.status !== 0) throw new Error('Build failed'); }
build({VITE_LEAK_TEST:control});
if (!(await artifacts(clientRoot)).some(({data})=>data.includes(control))) throw new Error('Positive control was not detected');
build({VITE_LEAK_TEST:''});
for (const {file,data} of await artifacts(clientRoot)) {
  // Source maps, if introduced, are scanned as text AND decoded sources/content.
  const decoded = file.endsWith('.map') ? JSON.parse(data) : null;
  const contents = data + (decoded ? JSON.stringify([decoded.sources,decoded.sourcesContent]) : '');
  for (const value of [...Object.values(sentinels),...markers,control]) if (contents.includes(value)) throw new Error(`Forbidden client content ${value} in ${file}`);
  if (file.endsWith('.map')) throw new Error(`Public source map ${file}`);
}
console.log('PASS: positive control detected; all client artifacts clean; no public source maps');
