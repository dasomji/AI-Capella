import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { api } from "./http.server";
import { env } from "./env.server";
import { pool } from "./db/index.server";
import { attachSockets } from "./socket.server";
import { logError } from "./logger.server";
import { flushBackground } from "./background.server";
import { setSocketAddress } from "./client-ip.server";
console.log(JSON.stringify({event:"web.transcription_config", model:env.OPENAI_TRANSCRIPTION_MODEL, promptVersion:"transcription-v1", at:new Date().toISOString()}));
const app = new Hono();
app.onError((error, c) => {
  logError("host.error", error);
  return c.json({ error: "Service unavailable. Please try again." }, 500);
});
app.route("/", api);
app.use("*", async (c, next) => {
  if (decodeURIComponent(c.req.path).endsWith(".map")) return c.notFound();
  await next();
});
const buildRoot = resolve(process.env.LIGHTSCORE_BUILD_ROOT ?? "./dist");
app.use("*", serveStatic({ root: join(buildRoot, "client") }));
// Runtime import: Start's Vite build owns the server entry.
const entryPath = pathToFileURL(join(buildRoot, "server/server.js")).href;
const { default: start } = await import(entryPath);
app.all("*", (c) => start.fetch(c.req.raw));
let stopping = false;
export const server = serve({
  fetch: (request, bindings) => {
    if (stopping)
      return new Response("Restarting", {
        status: 503,
        headers: { Connection: "close", "Retry-After": "2" },
      });
    setSocketAddress(bindings.incoming);
    const headers = new Headers(request.headers);
    headers.set(
      "x-lightscore-socket-ip",
      String(bindings.incoming.headers["x-lightscore-socket-ip"] ?? ""),
    );
    return app.fetch(new Request(request, { headers }), bindings);
  },
  port: env.PORT,
});
export const io = attachSockets(server);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => process.exit(1), 10000);
    deadline.unref();
    for (const ns of io._nsps.values())
      ns.emit("server:restarting", { reconnectAfterMs: 2000 });
    // Socket.IO closes its HTTP listener after closing connections; the rehearsal hook releases ownership.
    io.close(() => {
      void flushBackground()
        .then(() => pool.end())
        .then(() => process.exit(0))
        .catch((error) => {
          logError("host.shutdown", error);
          process.exit(1);
        });
    });
  });
