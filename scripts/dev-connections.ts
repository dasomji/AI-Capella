import type { Server, Socket } from 'node:net';

// A TCP handshake can succeed in the kernel while the child is already exiting.
// Acknowledge only sockets that this child's event loop has actually accepted.
export function acknowledgeDevelopmentConnections(server: Server) {
  const accepted = new Set<number>();
  const waiting = new Map<number, number>();
  const acknowledge = (id: number) => process.send?.({ type: 'accepted', id }, () => {});
  const onConnection = (socket: Socket) => {
    const port = socket.remotePort;
    if (!port) return;
    accepted.add(port);
    socket.once('close', () => accepted.delete(port));
    for (const [id, peer] of waiting) if (peer === port) {
      waiting.delete(id);
      acknowledge(id);
    }
  };
  const onMessage = (message: unknown) => {
    if (!message || typeof message !== 'object' || !('id' in message) || typeof message.id !== 'number') return;
    if ('type' in message && message.type === 'cancel-accept') waiting.delete(message.id);
    if ('type' in message && message.type === 'accept' && 'port' in message && typeof message.port === 'number') {
      if (accepted.has(message.port)) acknowledge(message.id);
      else waiting.set(message.id, message.port);
    }
  };
  server.on('connection', onConnection);
  process.on('message', onMessage);
  return () => {
    server.removeListener('connection', onConnection);
    process.removeListener('message', onMessage);
    accepted.clear();
    waiting.clear();
  };
}
