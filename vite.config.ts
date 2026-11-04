import { join } from 'node:path';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  build: { outDir: process.env.LIGHTSCORE_BUILD_ROOT ?? 'dist' },
  server: { port: 3000, strictPort: true },
  plugins: [
    {
      name: 'lightscore-offline-shell',
      generateBundle(_, bundle) {
        if (this.environment.name !== 'client') return;
        const entry = Object.values(bundle).find(b => b.type === 'chunk' && b.name === 'offline-entry');
        if (!entry) throw Error('Missing offline entry');
        const paths = Object.keys(bundle).filter(p => /^assets\/[^?]+\.(?:js|css|woff2?|ttf|zip|wasm|svg|png|mp3)$/.test(p)).map(p => '/' + p);
        const css = paths.filter(p => p.endsWith('.css')).map(p => `<link rel="stylesheet" href="${p}">`).join('');
        const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>LightScore</title>${css}</head><body><div id="app"></div><script type="module" src="/${entry.fileName}"></script></body></html>`;
        this.emitFile({type:'asset',fileName:'offline.html',source:html});

      },
      writeBundle() {
        if (this.environment.name !== 'client') return;
        // Vite removes empty CSS facade chunks after generateBundle. Enumerate finalized files.
        const clientDir=this.environment.config.build.outDir;
        const paths = readdirSync(join(clientDir,'assets')).filter(p => /^[^?]+\.(?:js|css|woff2?|ttf|zip|wasm|svg|png|mp3)$/.test(p)).map(p => '/assets/'+p);
        paths.push('/offline.html','/favicon.svg','/evening-rise.musicxml');
        for(let midi=33;midi<=96;midi+=3) paths.push(`/samples/piano/p${midi}.mp3`);
        const html=readFileSync(join(clientDir,'offline.html'),'utf8');
        const version=createHash('sha256').update(paths.join('')+html).digest('hex').slice(0,16);
        writeFileSync(join(clientDir,'sw.js'),readFileSync('public/sw.js','utf8').replace('/* PUBLIC_ASSETS */ []',JSON.stringify(paths)).replace('/* BUILD_ID */',version));
      },
    },
    tanstackStart(),
    react(),
    {
      name: "lightscore-node-host",
      async configureServer(server) {
        const [
          { getRequestListener },
          { api },
          { attachSockets },
          { setSocketAddress },
        ] = await Promise.all([
          import("@hono/node-server"),
          import("./server/http.server"),
          import("./server/socket.server"),
          import("./server/client-ip.server"),
        ]);
        if (!server.httpServer)
          throw new Error("A persistent HTTP server is required");
        const io = attachSockets(server.httpServer);
        server.httpServer.on("close", () => {
          void io.close();
        });
        const listener = getRequestListener((request, bindings) => {
          const headers = new Headers(request.headers);
          headers.set(
            "x-lightscore-socket-ip",
            String(bindings.incoming.headers["x-lightscore-socket-ip"] ?? ""),
          );
          return api.fetch(new Request(request, { headers }), bindings);
        });
        server.middlewares.use((req, res, next) => {
          setSocketAddress(req);
          if (/^\/(api\/|healthz(?:\?|$)|readyz(?:\?|$))/.test(req.url ?? "")) {
            void listener(req, res);
            return;
          }
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers))
            if (value)
              headers.set(key, Array.isArray(value) ? value.join(",") : value);
          void Promise.resolve(
            api.fetch(
              new Request(`http://localhost${req.url}`, {
                method: req.method,
                headers,
              }),
            ),
          )
            .then((response) => {
              for (const [key, value] of response.headers)
                res.setHeader(key, value);
              if (response.status !== 404) {
                res.writeHead(response.status);
                void response.text().then((text) => res.end(text));
              } else next();
            })
            .catch(next);
        });
      },
    },
  ],
});
