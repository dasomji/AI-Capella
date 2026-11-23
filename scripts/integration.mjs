import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import { INTEGRATION_FILES, INTEGRATION_GROUPS } from './integration-groups.mjs';
// Every suite here imports or serves the production build; without it they crash or wait on a server that never starts.
const buildEntry = `${process.env.LIGHTSCORE_BUILD_ROOT ?? 'dist'}/server/server.js`;
// `--group <name>` runs one group (CI runs them in parallel jobs); without it every file runs.
const groupAt = process.argv.indexOf('--group'), group = groupAt === -1 ? undefined : process.argv[groupAt + 1] ?? '';
if (group !== undefined && !Object.hasOwn(INTEGRATION_GROUPS, group)) { console.error(`unknown integration group '${group}'; expected one of: ${Object.keys(INTEGRATION_GROUPS).join(', ')}`); process.exit(2); }
const files = group === undefined ? INTEGRATION_FILES : INTEGRATION_GROUPS[group];
if (!existsSync(buildEntry)) { console.error(`test:integration requires a built client and server (${buildEntry} is missing); run npm run build first`); process.exit(1); }
const reservation = createServer(); await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
const hostPort = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
const appReservation = createServer(); await new Promise(resolve => appReservation.listen(0,'127.0.0.1',resolve));
const appPort=appReservation.address().port;await new Promise(resolve=>appReservation.close(resolve));
const name = `aicap-test-${process.pid}`;
function docker(args) { const r = spawnSync('docker', args, { encoding: 'utf8' }); if (r.status !== 0) throw new Error(r.stderr); return r.stdout.trim(); }
try {
  docker(['run','-d','--name',name,'-e','POSTGRES_PASSWORD=fixture-only','-e','POSTGRES_DB=fixture','-p',`127.0.0.1:${hostPort}:5432`,'postgres:17-alpine']);
  const port = docker(['port',name,'5432']).split(':').at(-1);
  const env = { ...process.env, S3_ENDPOINT:process.env.S3_ENDPOINT ?? 'http://127.0.0.1:28333',S3_BUCKET:`transcription-test-${process.pid}`,S3_ACCESS_KEY_ID:'local-only',S3_SECRET_ACCESS_KEY:'local-only', TEST_APP_PORT:String(appPort), DATABASE_URL: `postgres://postgres:fixture-only@127.0.0.1:${port}/fixture`, NODE_ENV: 'test', BETTER_AUTH_SECRET: 'isolated-fixture-secret-at-least-32-characters', BETTER_AUTH_URL: 'http://localhost:23001', TRUSTED_ORIGINS: 'http://localhost:23001', MAIL_TRANSPORT: 'capture', TEST_POSTGRES_CONTAINER: name };
  for (let i=0;i<60;i++) { const r = spawnSync('docker',['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres']); if (r.status === 0) break; await new Promise(r => setTimeout(r, 250)); }
  const migration = spawnSync(process.execPath,['--import','tsx','scripts/migrate.ts'], { env, stdio: 'inherit' });
  if (migration.status !== 0) throw new Error('Fixture migration failed');
  const child = spawn(process.execPath,['--import','tsx','--test',...(process.env.AICAP_TEST_PATTERN?['--test-name-pattern',process.env.AICAP_TEST_PATTERN]:[]),'--test-concurrency=1',...files], {env, stdio: 'inherit'});
  process.exitCode = await new Promise(resolve => child.on('exit', code => resolve(code ?? 1)));
} finally { docker(['rm','-fv',name]); }
