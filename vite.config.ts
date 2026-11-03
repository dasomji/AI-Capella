import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  server: { port: 3000, strictPort: true },
  plugins: [tanstackStart(), react(), {
    name: 'lightscore-node-host',
    async configureServer(server) {
      const [{ getRequestListener }, { api }, { attachSockets }, { currentSession }] = await Promise.all([
        import('@hono/node-server'), import('./server/http.server'), import('./server/socket.server'), import('./server/auth.server'),
      ]);
      if (!server.httpServer) throw new Error('A persistent HTTP server is required');
      const io = attachSockets(server.httpServer);
      server.httpServer.on('close', () => { void io.close(); });
      const listener = getRequestListener(api.fetch);
      server.middlewares.use((req, res, next) => {
        if (/^\/app(?:\?|$)/.test(req.url ?? '')) {
          const headers = new Headers(); headers.set('cookie', req.headers.cookie ?? '');
          void currentSession(headers).then(session => {
            if (!session?.user.emailVerified) { res.writeHead(302, { Location: '/?state=expired' }); res.end(); } else next();
          }).catch(() => { res.writeHead(503); res.end('Service unavailable'); });
        } else if (/^\/(api\/|healthz(?:\?|$)|readyz(?:\?|$))/.test(req.url ?? '')) void listener(req, res);
        else next();
      });
    },
  }],
});
