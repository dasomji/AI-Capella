import { Hono } from 'hono';
import { auth, currentSession } from './auth.server';
import { pool } from './db/index.server';
import { env } from './env.server';
import { readMigrationFiles } from 'drizzle-orm/migrator';
export const api = new Hono();
api.onError(() => Response.json({ error: 'Service unavailable. Please try again.' }, { status: 500 }));
api.use('*', async (c, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) && !env.TRUSTED_ORIGINS.includes(c.req.header('origin') ?? '')) return c.json({ error: 'Untrusted origin' }, 403);
  await next();
  c.header('Cache-Control', 'no-store');
});
api.get('/healthz', c => c.json({ status: 'ok' }));
api.get('/readyz', async c => {
  try {
    const expected = readMigrationFiles({ migrationsFolder: './drizzle' });
    const result = await pool.query('select hash from drizzle.__drizzle_migrations order by created_at');
    if (result.rows.length !== expected.length || expected.some((m, i) => m.hash !== result.rows[i]?.hash)) return c.json({ status: 'migrations pending' }, 503);
    return c.json({ status: 'ready' });
  } catch { return c.json({ status: 'not ready' }, 503); }
});
api.use('/app', async (c, next) => {
  const session = await currentSession(c.req.raw.headers);
  if (!session?.user.emailVerified) return c.redirect('/?state=expired');
  await next();
});
api.on(['GET', 'POST'], '/api/auth/*', async c => {
  const response = await auth.handler(c.req.raw);
  return response.status >= 500 ? c.json({ error: 'Service unavailable. Please try again.' }, 503) : response;
});
api.get('/api/me', async c => {
  const session = await currentSession(c.req.raw.headers);
  if (!session || !session.user.emailVerified) return c.json({ error: 'Sign in again', code: 'SESSION_EXPIRED' }, 401);
  return c.json({ user: { id: session.user.id, name: session.user.name, email: session.user.email } });
});
