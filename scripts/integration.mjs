import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
const reservation = createServer(); await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
const hostPort = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
const name = `aicap-test-${process.pid}`;
function docker(args) { const r = spawnSync('docker', args, { encoding: 'utf8' }); if (r.status !== 0) throw new Error(r.stderr); return r.stdout.trim(); }
try {
  docker(['run','-d','--name',name,'-e','POSTGRES_PASSWORD=fixture-only','-e','POSTGRES_DB=fixture','-p',`127.0.0.1:${hostPort}:5432`,'postgres:17-alpine']);
  const port = docker(['port',name,'5432']).split(':').at(-1);
  const env = { ...process.env, DATABASE_URL: `postgres://postgres:fixture-only@127.0.0.1:${port}/fixture`, NODE_ENV: 'test', BETTER_AUTH_SECRET: 'isolated-fixture-secret-at-least-32-characters', BETTER_AUTH_URL: 'http://localhost:23001', TRUSTED_ORIGINS: 'http://localhost:23001', MAIL_TRANSPORT: 'capture', TEST_POSTGRES_CONTAINER: name };
  for (let i=0;i<60;i++) { const r = spawnSync('docker',['exec',name,'pg_isready','-U','postgres']); if (r.status === 0) break; await new Promise(r => setTimeout(r, 250)); }
  const migration = spawnSync(process.execPath,['--import','tsx','scripts/migrate.ts'], { env, stdio: 'inherit' });
  if (migration.status !== 0) throw new Error('Fixture migration failed');
  const child = spawn(process.execPath,['--import','tsx','--test','--test-concurrency=1','tests/integration.test.ts','tests/hosting.test.ts'], {env, stdio: 'inherit'});
  process.exitCode = await new Promise(resolve => child.on('exit', code => resolve(code ?? 1)));
} finally { docker(['rm','-fv',name]); }
