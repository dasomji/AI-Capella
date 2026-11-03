import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
const names = ['DATABASE_URL','BETTER_AUTH_SECRET','RESEND_API_KEY','S3_ACCESS_KEY_ID','S3_SECRET_ACCESS_KEY','OPENAI_API_KEY'];
const sentinels = Object.fromEntries(names.map(name => [name, `SENTINEL_${name}_must_never_reach_browser_284392`]));
sentinels.DATABASE_URL = `postgres://sentinel:SENTINEL_DATABASE_URL_must_never_reach_browser_284392@localhost/test`;
const build = spawnSync('npm', ['run','build','--','--sourcemap'], { env: { ...process.env, ...sentinels }, stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);
async function check(path) { for (const entry of await readdir(path, { withFileTypes: true })) { const file = `${path}/${entry.name}`; if (entry.isDirectory()) await check(file); else { const data = await readFile(file); for (const secret of Object.values(sentinels)) if (data.includes(secret)) throw new Error(`Secret leaked to ${file}`); } } }
await check('dist/client'); console.log('PASS: browser artifacts and source maps contain no sentinel secrets');
