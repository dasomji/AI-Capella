import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { assertDevSeedDatabase } from './dev-seed-guard';

// Guard before importing anything that can connect to a database or send mail.
assertDevSeedDatabase(process.env);
process.env.MAIL_TRANSPORT = 'capture';
const { hashPassword } = await import('better-auth/crypto');
const { pool } = await import('../server/db/index.server');
const { api } = await import('../server/http.server');
const { captureMail } = await import('../server/mail.server');
const { changeAdminRole } = await import('./admin-role');
const { flushBackground } = await import('../server/background.server');
const origin = process.env.BETTER_AUTH_URL!;
const accounts = [['admin@test.com', 'Admin'], ['user@test.com', 'Test User']];
const lock = await pool.connect();
const sessions: string[] = [];
try {
  await lock.query("select pg_advisory_lock(hashtextextended('seed:dev',0))");
  for (const [email, name] of accounts) {
    await lock.query('begin');
    try {
      const user = (await lock.query(`insert into "user"(name,email,email_verified) values($1,$2,true)
        on conflict(email) do update set name=excluded.name,email_verified=true,updated_at=now() returning id`, [name, email])).rows[0];
      const password = await hashPassword('password');
      const credential = await lock.query(`update account set password=$1,updated_at=now()
        where user_id=$2 and provider_id='credential'`, [password, user.id]);
      if (!credential.rowCount) await lock.query(`insert into account(id,account_id,provider_id,user_id,password)
        values($1,$2,'credential',$2,$3)`, [randomUUID(), user.id, password]);
      await lock.query('commit');
    } catch (error) { await lock.query('rollback'); throw error; }
  }
  await changeAdminRole(process.env.DATABASE_URL!, 'admin@test.com', true);
  await changeAdminRole(process.env.DATABASE_URL!, 'user@test.com', false);

  async function request(path: string, cookie = '', init: RequestInit = {}) {
    const response = await api.request(new Request(origin + path, {
      ...init, headers: { origin, cookie, 'x-lightscore-socket-ip': '127.0.0.1', ...init.headers },
    }));
    if (!response.ok) throw Error(`seed:dev ${path}: HTTP ${response.status}`);
    return response;
  }
  async function signIn(email: string) {
    const response = await request('/api/auth/sign-in/email', '', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'password' }),
    });
    const cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    if (!cookie) throw Error('Sign-in did not issue a session');
    sessions.push(cookie);
    return cookie;
  }
  const admin = await signIn('admin@test.com'), member = await signIn('user@test.com');
  const ensembles = await (await request('/api/ensembles', admin)).json();
  let ensemble = ensembles.find((e: { name: string; isLead: boolean }) => e.name === 'Testchor' && e.isLead);
  if (!ensemble) ensemble = await (await request('/api/ensembles', admin, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Testchor', kind: 'choir' }),
  })).json();
  const membership = (await lock.query(`select m.* from memberships m join "user" u on u.id=m.user_id where m.ensemble_id=$1 and u.email='user@test.com'`, [ensemble.id])).rows[0];
  if (!membership) {
    await request(`/api/ensembles/${ensemble.id}/invitations`, admin, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'user@test.com', capabilities: { manageMembers: false, editPieces: false, transcribe: false }, idempotencyKey: randomUUID() }),
    });
    const token = captureMail.messages.at(-1)?.text.match(/\/invite\/([^\s]+)/)?.[1];
    if (!token) throw Error('Invitation mail missing');
    await request(`/api/invitations/${token}/accept`, member, { method: 'POST' });
  } else if (membership.is_lead || membership.manage_members || membership.edit_music_pieces || membership.ai_transcription) {
    await request(`/api/ensembles/${ensemble.id}/members/${membership.id}`, admin, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ isLead: false, manageMembers: false, editPieces: false, transcribe: false }),
    });
  }
  const pieces = await (await request(`/api/ensembles/${ensemble.id}/pieces`, admin)).json();
  const samples = fileURLToPath(new URL('../public/', import.meta.url));
  for (const file of (await readdir(samples)).filter(name => name.endsWith('.musicxml'))) {
    const title = file === 'evening-rise.musicxml' ? 'Evening Rise' : file.replace(/\.musicxml$/, '').replaceAll('-', ' ');
    if (pieces.some((piece: { title: string }) => piece.title === title)) continue;
    await request(`/api/ensembles/${ensemble.id}/pieces`, admin, {
      method: 'POST', headers: { 'content-type': 'text/xml', 'x-score-title': encodeURIComponent(title), 'idempotency-key': `dev-sample:${file}` },
      body: await readFile(new URL(file, new URL('../public/', import.meta.url)), 'utf8'),
    });
  }
  console.info('Dev accounts ready: admin@test.com (sysadmin, Testchor lead), user@test.com (ordinary member).');
} finally {
  // Temporary seed sessions should not accumulate on repeat runs.
  for (const cookie of sessions) await api.request(new Request(origin + '/api/auth/sign-out', { method: 'POST', headers: { origin, cookie, 'x-lightscore-socket-ip': '127.0.0.1' } }));
  await flushBackground();
  await lock.query("select pg_advisory_unlock(hashtextextended('seed:dev',0))");
  lock.release();
  await pool.end();
}
