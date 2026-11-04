import { spawnSync } from 'node:child_process';
import { mkdir, readdir, readFile, mkdtemp } from 'node:fs/promises';
import assert from 'node:assert/strict';
await mkdir(`${process.cwd()}/.review-evidence`, { recursive: true });
// Keep builds private to this invocation, including NODE_ENV=test diagnostics.
const buildRoot = process.env.LIGHTSCORE_BUILD_ROOT || await mkdtemp(`${process.cwd()}/.review-evidence/secrets-`);
const clientRoot = `${buildRoot}/client`;
const names = ['DATABASE_URL','BETTER_AUTH_SECRET','RESEND_API_KEY','S3_ACCESS_KEY_ID','S3_SECRET_ACCESS_KEY','OPENAI_API_KEY'];
const sentinels = Object.fromEntries(names.map(name => [name, `SENTINEL_${name}_must_never_reach_browser_284392`]));
sentinels.DATABASE_URL = `postgres://sentinel:SENTINEL_DATABASE_URL_must_never_reach_browser_284392@localhost/test`;
const control = 'SENTINEL_PUBLIC_VITE_positive_control_284392';
// Require a file-like module path; React's literal server/client is prose.
const serverPath = /(?:^|[\s"'`(\\/])server\/[\w./-]+\.[\w-]+(?=[\s"'`)?:\\]|$)/m;
assert(!serverPath.test('React server/client diagnostic'));
for (const marker of ['server/entry.ts', '/app/server/http.server.ts', '"server/nested/module.js"', 'server/sandbox.py']) assert(serverPath.test(marker), marker);
const markers = ['BETTER_AUTH_SECRET','DATABASE_URL','RESEND','drizzle-orm','node_modules/pg','.server.ts','ai-capella.firebase','ai-capella.firebasestorage','firestore.googleapis','firebaseio','AIza'];
async function artifacts(path) {
  const result = [];
  for (const entry of await readdir(path, {withFileTypes:true})) {
    const file = `${path}/${entry.name}`;
    if (entry.isDirectory()) result.push(...await artifacts(file));
    else result.push({file, data:await readFile(file,'utf8')});
  }
  return result;
}
function build(extra = {}) { const r = spawnSync('npm',['run','build'],{env:{...process.env,LIGHTSCORE_BUILD_ROOT:buildRoot,...sentinels,...extra},stdio:'inherit'}); if (r.status !== 0) throw new Error('Build failed'); }
build({VITE_LEAK_TEST:control});
if (!(await artifacts(clientRoot)).some(({data})=>data.includes(control))) throw new Error('Positive control was not detected');
build({VITE_LEAK_TEST:''});
for (const {file,data} of await artifacts(clientRoot)) {
  // Source maps, if introduced, are scanned as text AND decoded sources/content.
  const decoded = file.endsWith('.map') ? JSON.parse(data) : null;
  const contents = data + (decoded ? JSON.stringify([decoded.sources,decoded.sourcesContent]) : '');
  for (const value of [...Object.values(sentinels),...markers,control]) if (contents.includes(value)) throw new Error(`Forbidden client content ${value} in ${file}`);
  if (serverPath.test(contents)) throw new Error(`Forbidden server module path in ${file}`);
  if (file.endsWith('.map')) throw new Error(`Public source map ${file}`);
}
console.log('PASS: positive control detected; all client artifacts clean; no public source maps');
