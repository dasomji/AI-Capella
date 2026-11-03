import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { api } from './http.server';
import { env } from './env.server';
import { pool } from './db/index.server';
import { attachSockets } from './socket.server';
const app = new Hono();
app.route('/', api);
app.use('*', serveStatic({ root: './dist/client' }));
// Runtime import: Start's Vite build owns the server entry.
const entryPath = '../dist/server/server.js';
const { default: start } = await import(entryPath);
app.all('*', c => start.fetch(c.req.raw));
export const server = serve({ fetch: app.fetch, port: env.PORT });
export const io = attachSockets(server);
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { void io.close(() => { server.close(); void pool.end().then(() => process.exit(0)); }); });
