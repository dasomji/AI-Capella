# Development reload process boundary

Vite's config imports the HTTP API and Socket.IO backend. Backend modules therefore
belong to its config dependency graph: editing them restarts the entire Vite HTTP
server. Lizardtail's installed monitor treats a missing listener as an immediate
ownership failure and terminates the whole preview. Its HTTP-readiness grace does
not cover missing listeners, and it offers no per-service restart policy.

`npm run dev` now keeps a TCP listener in a small parent and runs Vite in a child
on an ephemeral loopback port. Vite's config-restart hook requests a fresh child
instead of re-evaluating stateful backend modules in the same process. The parent
keeps the port while the child exits/starts, waits for readiness over IPC and
relays TCP unchanged, including streaming HTTP and WebSocket upgrades. Unexpected
child exits retry too. This is framework development behavior, independent of
Lizardtail; the manifest still invokes the ordinary dev command.

A fresh process clears module globals, database pools and subscriptions together.
In-place module replacement would need disposal contracts across those modules.
The trade-off is a brief compile/startup delay and loss of existing child
connections; HMR/Socket.IO clients reconnect. New connections wait at most 15
seconds. Shutdown allows three seconds for the child before killing it. Compile
failures lasting beyond Lizardtail's fixed 30-second readiness grace can still
stop the preview: supervisor retry/grace policy belongs upstream.

Separately, the development HTTP close listener must run once: Socket.IO's close
also closes HTTP. A recurring listener recursively called subscription cleanup
and `pg.Client.end()`, producing the observed MaxListenersExceededWarning. Raising
the listener limit would hide this cleanup bug.
