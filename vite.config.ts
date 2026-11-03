import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  server: { port: 3000, strictPort: true },
  plugins: [tanstackStart(), react(), {
    name: 'lightscore-node-host',
    async configureServer(server) {
      const [{ getRequestListener }, { api }, { attachSockets }, {setSocketAddress}] = await Promise.all([
        import('@hono/node-server'), import('./server/http.server'), import('./server/socket.server'), import('./server/client-ip.server'),
      ]);
      if (!server.httpServer) throw new Error('A persistent HTTP server is required');
      const io = attachSockets(server.httpServer);
      server.httpServer.on('close', () => { void io.close(); });
      const listener = getRequestListener(api.fetch);
      server.middlewares.use((req, res, next) => {
        setSocketAddress(req);
        if (/^\/(api\/|healthz(?:\?|$)|readyz(?:\?|$))/.test(req.url ?? '')) { void listener(req, res); return; }
        const headers = new Headers(); for (const [key, value] of Object.entries(req.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(',') : value);
        void Promise.resolve(api.fetch(new Request(`http://localhost${req.url}`, { method: req.method, headers }))).then(response => {
          for (const [key, value] of response.headers) res.setHeader(key, value);
          if (response.status !== 404) { res.writeHead(response.status); void response.text().then(text => res.end(text)); } else next();
        }).catch(next);
      });
    },
  }],
});
