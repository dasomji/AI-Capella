import { createServer } from 'vite';
import { acknowledgeDevelopmentConnections } from './dev-connections';

const server = await createServer({ server: {
  host: '127.0.0.1', port: 0, strictPort: true,
  ...(!process.env.LIZARDTAIL_ORIGIN ? { hmr: { clientPort: Number(process.env.LIGHTSCORE_DEV_PORT) } } : {}),
} });
if (!server.httpServer) throw Error('Missing Vite TCP listener');
const stopAccepting = acknowledgeDevelopmentConnections(server.httpServer);
// Backend imports in vite.config.ts are config dependencies. Replace the whole
// child instead of re-evaluating stateful database/socket modules in one process.
server.restart = async () => { process.send?.({ type: 'restart' }); };
let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  stopAccepting();
  const deadline = setTimeout(() => process.exit(1), 2500);
  deadline.unref();
  void server.close().then(() => process.exit(0), () => process.exit(1));
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
process.on('disconnect', stop);
await server.listen();
const address = server.httpServer?.address();
if (!address || typeof address === 'string') throw Error('Missing Vite TCP listener');
process.send?.({ type: 'ready', port: address.port });
