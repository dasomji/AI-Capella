import { authorize, onMembershipChange, onLibraryChange } from './domain.server';
import { Server as HttpServer } from 'node:http';
import type { ServerType } from '@hono/node-server';
import { Server, type Socket } from 'socket.io';
import { env } from './env.server';
import { currentSession } from './auth.server';
import { pool } from './db/index.server';
import { onRevoked } from './revocation.server';
import { logError } from './logger.server';
export function attachSockets(server: ServerType) {
  if (!(server instanceof HttpServer)) throw new Error('HTTP/1 Node server required');
  const io = new Server(server, { connectTimeout: 10000, cors: { origin: env.TRUSTED_ORIGINS, credentials: true }, allowRequest: (req, callback) => callback(null, env.TRUSTED_ORIGINS.includes(req.headers.origin ?? '')) });
  const connected = new Set<Socket>();
  const authenticate = async (socket: Socket, next: (error?: Error) => void) => {
    try {
      if (!env.TRUSTED_ORIGINS.includes(socket.handshake.headers.origin ?? '')) return next(new Error('Untrusted origin'));
      const headers = new Headers({ cookie: socket.handshake.headers.cookie ?? '' });
      const session = await currentSession(headers);
      if (!session?.user.emailVerified) return next(new Error('Sign in again'));
      socket.data.userId = session.user.id;
      socket.data.token = session.session.token;
      socket.data.expiresAt = new Date(session.session.expiresAt).getTime();
      next();
    } catch { next(new Error('Sign in again')); }
  };
  for (const namespace of [io.of('/'), io.of('/rehearsal')]) {
    namespace.use(authenticate);
    namespace.on('connection', socket => { connected.add(socket);
      socket.on('ensemble:join', async (ensembleId: unknown, ack?: (result: unknown) => void) => {
        try { if (typeof ensembleId !== 'string') throw Error(); await currentSocketMembership(socket, ensembleId); await socket.join(`ensemble:${ensembleId}`); ack?.({ok:true}); }
        catch { ack?.({code:'not_found'}); }
      }); socket.on('disconnect', () => connected.delete(socket)); });
  }
  const unsubscribeMembership = onMembershipChange((ensemble, user) => {
    for (const socket of connected) if (!user || socket.data.userId === user) {
      if (!ensemble) socket.disconnect(true); else { socket.emit('membership:changed',{ensembleId:ensemble}); void socket.leave(`ensemble:${ensemble}`); }
    }
  });
  const unsubscribeLibrary = onLibraryChange(async (ensemble, changes) => {
    // Revalidate every recipient against the database; rooms alone never confer rights.
    for (const socket of connected) if (socket.rooms.has(`ensemble:${ensemble}`)) {
      try { await currentSocketMembership(socket,ensemble); socket.emit('library:changed',{ensembleId:ensemble,changes:changes.map((c:any)=>({pieceId:c.pieceId??c.id,revision:c.revision,versionNo:c.versionNo,contentHash:c.contentHash,...(c.deleted?{deleted:true}:{})}))}); }
      catch { await socket.leave(`ensemble:${ensemble}`); }
    }
  });
  const unsubscribe = onRevoked(token => { for (const socket of connected) if (socket.data.token === token) socket.disconnect(true); });
  let failures = 0, busy = false;
  const timer = setInterval(async () => {
    if (busy || !connected.size) return;
    busy = true;
    try {
      const result = await pool.query('select token from session where token = ANY($1::text[]) and expires_at > now()', [[...new Set([...connected].map(s => s.data.token))]]);
      const valid = new Set(result.rows.map(row => row.token)); failures = 0;
      for (const socket of connected) if (!valid.has(socket.data.token)) socket.disconnect(true);
    } catch (error) { logError('socket.session_check', error); if (++failures >= 3) for (const socket of connected) socket.disconnect(true); }
    finally { busy = false; }
  }, 15000);
  timer.unref();
  const close = io.close.bind(io);
  io.close = ((callback?: () => void) => { clearInterval(timer); unsubscribe(); unsubscribeMembership(); unsubscribeLibrary(); return close(callback); }) as typeof io.close;
  return io;
}

export async function currentSocketMembership(socket: Socket, ensembleId: string) {
 const session = await currentSession(new Headers({cookie:socket.handshake.headers.cookie??''}));
 if(!session?.user.emailVerified) throw new Error('Sign in again');
 return authorize(pool,session.user.id,ensembleId);
}
