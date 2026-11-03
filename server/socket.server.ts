import { Server as HttpServer } from 'node:http';
import type { ServerType } from '@hono/node-server';
import { Server } from 'socket.io';
import { env } from './env.server';
import { currentSession } from './auth.server';
export function attachSockets(server: ServerType) {
  if (!(server instanceof HttpServer)) throw new Error('HTTP/1 Node server required');
  const io = new Server(server, { cors: { origin: env.TRUSTED_ORIGINS, credentials: true }, allowRequest: (req, callback) => callback(null, env.TRUSTED_ORIGINS.includes(req.headers.origin ?? '')) });
  const rehearsal = io.of('/rehearsal');
  rehearsal.use(async (socket, next) => {
    try {
      if (!env.TRUSTED_ORIGINS.includes(socket.handshake.headers.origin ?? '')) return next(new Error('Untrusted origin'));
      const headers = new Headers();
      headers.set('cookie', socket.handshake.headers.cookie ?? '');
      const session = await currentSession(headers);
      if (!session?.user.emailVerified) return next(new Error('Sign in again'));
      socket.data.userId = session.user.id;
      socket.data.sessionHeaders = headers;
      next();
    } catch { next(new Error('Sign in again')); }
  });
  rehearsal.on('connection', socket => {
    // Phase 3 adds ensemble authorization and the real command protocol.
    const timer = setInterval(async () => {
      try { if (!(await currentSession(socket.data.sessionHeaders))) socket.disconnect(true); }
      catch { socket.disconnect(true); }
    }, 1000);
    socket.on('disconnect', () => clearInterval(timer));
  });
  return io;
}
