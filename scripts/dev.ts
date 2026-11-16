import { fork, type ChildProcess } from 'node:child_process';
import { createServer, connect, type Socket } from 'node:net';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

// Keep the externally supervised listener alive across Vite/backend restarts.
// A TCP relay preserves HTTP streaming, headers and WebSocket upgrades unchanged.
export async function startDevelopment({ port, host = '127.0.0.1', childPath = fileURLToPath(new URL('./dev-vite.ts', import.meta.url)) }: {
  port: number; host?: string; childPath?: string;
}) {
  let child: ChildProcess | undefined;
  let target: number | undefined;
  let stopping = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const sockets = new Set<Socket>();
  const pending = new Map<Socket, ReturnType<typeof setTimeout>>();
  const relay = (socket: Socket) => {
    if (!target || socket.destroyed) return;
    clearTimeout(pending.get(socket));
    pending.delete(socket);
    const upstream = connect(target, '127.0.0.1');
    socket.once('close', () => upstream.destroy());
    upstream.on('error', () => socket.destroy());
    upstream.once('close', () => socket.destroy());
    socket.pipe(upstream).pipe(socket);
  };
  const server = createServer(socket => {
    sockets.add(socket);
    socket.on('error', () => socket.destroy());
    socket.once('close', () => {
      sockets.delete(socket);
      clearTimeout(pending.get(socket));
      pending.delete(socket);
    });
    // Bound connections waiting for a compile/restart, including failed startups.
    if (target) relay(socket);
    else pending.set(socket, setTimeout(() => socket.destroy(), 15000));
  });
  const restart = () => {
    if (!child || deadline) return;
    target = undefined;
    child.kill('SIGTERM');
    deadline = setTimeout(() => child?.kill('SIGKILL'), 3000);
  };
  const launch = () => {
    if (stopping) return;
    child = fork(childPath, [], {
      execArgv: ['--import', 'tsx'],
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      env: { ...process.env, LIGHTSCORE_DEV_PORT: String(port) },
    });
    child.on('message', (message: unknown) => {
      if (!message || typeof message !== 'object') return;
      if ('type' in message && message.type === 'restart') restart();
      if ('type' in message && message.type === 'ready' && 'port' in message &&
          typeof message.port === 'number' && !deadline && !stopping) {
        target = message.port;
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
