import { fork, type ChildProcess } from 'node:child_process';
import { createServer, connect, type Socket } from 'node:net';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

// Keep the externally supervised listener alive across Vite/backend restarts.
// A TCP relay preserves HTTP streaming, headers and WebSocket upgrades unchanged.
export async function startDevelopment({
  port, host = '127.0.0.1',
  childPath = fileURLToPath(new URL('./dev-vite.ts', import.meta.url)),
  readinessTimeoutMs = 15000,
}: {
  port: number; host?: string; childPath?: string; readinessTimeoutMs?: number;
}) {
  let child: ChildProcess | undefined;
  let target: { port: number; child: ChildProcess } | undefined;
  let stopping = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const sockets = new Set<Socket>();
  const pending = new Map<Socket, { timeout: ReturnType<typeof setTimeout>; upstream?: Socket }>();
  let nextConnection = 0;
  const acknowledgements = new Map<number, { child: ChildProcess; accepted: () => void }>();
  const relay = (socket: Socket) => {
    const waiting = pending.get(socket);
    if (!target || !waiting || waiting.upstream || socket.destroyed) return;
    const destination = target;
    const upstream = connect(destination.port, '127.0.0.1');
    waiting.upstream = upstream;
    let relaying = false;
    let connectionId: number | undefined;
    const closeUpstream = () => upstream.destroy();
    upstream.on('error', () => { if (relaying) socket.destroy(); });
    upstream.once('close', () => {
      socket.removeListener('close', closeUpstream);
      if (connectionId !== undefined) {
        acknowledgements.delete(connectionId);
        if (destination.child.connected) destination.child.send({ type: 'cancel-accept', id: connectionId }, () => {});
      }
      if (relaying || pending.get(socket) !== waiting) return;
      waiting.upstream = undefined;
      // A child can close its listener before its exit/IPC reaches the parent.
      // No client bytes have been forwarded: hold them for a fresh ready child.
      if (target === destination) restart();
      relay(socket);
    });
    const accepted = () => {
      if (connectionId !== undefined) acknowledgements.delete(connectionId);
      connectionId = undefined;
      if (target !== destination || stopping || socket.destroyed || upstream.destroyed || upstream.readableEnded || pending.get(socket) !== waiting) {
        upstream.destroy();
        return;
      }
      relaying = true;
      clearTimeout(waiting.timeout);
      pending.delete(socket);
      socket.once('close', closeUpstream);
      socket.pipe(upstream).pipe(socket);
    };
    upstream.once('connect', () => {
      if (target !== destination || stopping || socket.destroyed || pending.get(socket) !== waiting) {
        upstream.destroy();
        return;
      }
      // TCP may connect to a dying child's kernel backlog. Keep bytes paused
      // until its event loop confirms accepting this particular connection.
      connectionId = ++nextConnection;
      acknowledgements.set(connectionId, { child: destination.child, accepted });
      destination.child.send({ type: 'accept', id: connectionId, port: upstream.localPort }, error => {
        if (error) upstream.destroy();
      });
    });
  };
  const server = createServer(socket => {
    sockets.add(socket);
    socket.on('error', () => socket.destroy());
    socket.once('close', () => {
      sockets.delete(socket);
      const waiting = pending.get(socket);
      pending.delete(socket);
      clearTimeout(waiting?.timeout);
      waiting?.upstream?.destroy();
    });
    // Keep one deadline from acceptance through upstream connection, even if
    // multiple children fail. Only connected streams leave the waiting queue.
    const timeout = setTimeout(() => {
      const waiting = pending.get(socket);
      pending.delete(socket);
      waiting?.upstream?.destroy();
      const body = 'Development server is restarting. Try again shortly.\n';
      socket.resume();
      socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n' +
        'Content-Type: text/plain; charset=utf-8\r\nRetry-After: 1\r\n' +
        `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
      socket.setTimeout(1000, () => socket.destroy());
    }, readinessTimeoutMs);
    pending.set(socket, { timeout });
    relay(socket);
  });
  const restart = () => {
    if (!child || deadline) return;
    target = undefined;
    child.kill('SIGTERM');
    deadline = setTimeout(() => child?.kill('SIGKILL'), 3000);
  };
  const launch = () => {
    if (stopping) return;
    const launched = fork(childPath, [], {
      execArgv: ['--import', 'tsx'],
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      env: { ...process.env, LIGHTSCORE_DEV_PORT: String(port) },
    });
    child = launched;
    launched.on('message', (message: unknown) => {
      if (!message || typeof message !== 'object') return;
      if ('type' in message && message.type === 'accepted' && 'id' in message && typeof message.id === 'number') {
        const acknowledgement = acknowledgements.get(message.id);
        if (acknowledgement?.child === launched) acknowledgement.accepted();
      }
      if ('type' in message && message.type === 'restart') restart();
      if ('type' in message && message.type === 'ready' && 'port' in message &&
          typeof message.port === 'number' && !deadline && !stopping) {
        target = { port: message.port, child: launched };
        console.log(`[dev] ready child=${child?.pid} at ${new Date().toISOString()}`);
        for (const socket of pending.keys()) relay(socket);
      }
    });
    child.on('error', error => console.error('[dev] child error', error.message));
    child.once('exit', (code, signal) => {
      console.log(`[dev] child exited (${code ?? signal}) at ${new Date().toISOString()}`);
      target = undefined;
      clearTimeout(deadline);
      deadline = undefined;
      child = undefined;
      if (!stopping) retry = setTimeout(launch, 200);
    });
  };
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => { server.removeListener('error', reject); resolve(); });
  });
  launch();
  return {
    server,
    async close() {
      stopping = true;
      clearTimeout(retry);
      for (const socket of sockets) socket.destroy();
      const closed = new Promise<void>(resolve => server.close(() => resolve()));
      if (child) {
        const exited = new Promise<void>(resolve => child!.once('exit', () => resolve()));
        restart();
        await exited;
      }
      await closed;
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: {
    host: { type: 'string', default: '127.0.0.1' },
    port: { type: 'string', default: process.env.PORT ?? '3000' },
    strictPort: { type: 'boolean' },
  } });
  const dev = await startDevelopment({ port: Number(values.port), host: values.host });
  let closing = false;
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
    if (closing) return;
    closing = true;
    void dev.close().then(() => process.exit(0));
  });
}
