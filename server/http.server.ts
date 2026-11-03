import { Hono } from 'hono';
import { auth, currentSession } from './auth.server';
import { pool } from './db/index.server';
import { env } from './env.server';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { logError, withRequestLog } from './logger.server';
export const api = new Hono();
api.onError((error, c) => { logError('http.error', error, c.res.headers.get('x-request-id') ?? undefined); return Response.json({ error: 'Service unavailable. Please try again.' }, { status: 500 }); });
api.use('*', async (c, next) => {
  const requestId = crypto.randomUUID(); c.header('X-Request-ID', requestId);
  c.header('X-Frame-Options', 'DENY'); c.header('X-Content-Type-Options', 'nosniff'); c.header('Referrer-Policy', 'no-referrer');
  if (env.NODE_ENV === 'production') c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  {
    c.header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws: wss:; media-src 'self' blob: data:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) && !env.TRUSTED_ORIGINS.includes(c.req.header('origin') ?? '')) return c.json({ error: 'Untrusted origin' }, 403);
  if (c.req.path.startsWith('/assets/')) c.header('Cache-Control', 'public, max-age=31536000, immutable');
  else if (/^\/(?:api(?:\/|$)|healthz$|readyz$|app$|_serverFn(?:\/|$))/.test(c.req.path) || c.req.path === '/') c.header('Cache-Control', 'no-store');
  await next();
  if (c.res.headers.get('Content-Type')?.includes('text/html')) c.header('Cache-Control', 'no-store');
});
api.get('/healthz', c => c.json({ status: 'ok' }));
api.get('/readyz', async c => {
  try {
    const expected = readMigrationFiles({ migrationsFolder: './drizzle' });
    const result = await pool.query('select hash from drizzle.__drizzle_migrations order by created_at');
    if (result.rows.length !== expected.length || expected.some((m, i) => m.hash !== result.rows[i]?.hash)) return c.json({ status: 'migrations pending' }, 503);
    return c.json({ status: 'ready' });
  } catch (error) { logError('database.readiness', error); return c.json({ status: 'not ready' }, 503); }
});
api.use('/app', async (c, next) => {
  const session = await currentSession(c.req.raw.headers);
  if (!session?.user.emailVerified) return c.redirect('/?state=expired');
  await next();
});
api.on(['GET', 'POST'], '/api/auth/*', async c => {
  const response = await withRequestLog(c.res.headers.get('x-request-id') ?? crypto.randomUUID(), () => auth.handler(c.req.raw));
  if (response.status >= 500) logError('auth.http_failure', undefined, c.res.headers.get('x-request-id') ?? undefined);
  return response.status >= 500 ? c.json({ error: 'Service unavailable. Please try again.' }, 503) : response;
});
api.get('/api/me', async c => {
  const session = await currentSession(c.req.raw.headers);
  if (!session || !session.user.emailVerified) return c.json({ error: 'Sign in again', code: 'SESSION_EXPIRED' }, 401);
  return c.json({ user: { id: session.user.id, name: session.user.name, email: session.user.email } });
});
