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
seconds, including the upstream TCP handshake. The last ready child can stop
accepting connections before its exit notification reaches the parent. A failed
handshake therefore retires that child and holds the client for its replacement;
client bytes stay paused until a connection to the current ready child succeeds.
TCP success alone is insufficient: the kernel can finish a handshake while its
process is exiting. Before forwarding bytes, the parent also requires an IPC
acknowledgement from the child's connection handler for that specific socket.
Connections not yet accepted by the child's event loop remain in the queue if
that child exits. Acknowledgements are scoped to the child and cancelled when
their upstream socket closes.
The original deadline spans all attempts and returns an HTTP 503 with
`Retry-After: 1` on timeout. Once bytes have been forwarded, streams are not
replayed: doing so could duplicate a write or corrupt an upgrade. Shutdown allows
three seconds for the child before killing it. Compile
failures lasting beyond Lizardtail's fixed 30-second readiness grace can still
stop the preview: supervisor retry/grace policy belongs upstream.

Separately, the development HTTP close listener must run once: Socket.IO's close
also closes HTTP. A recurring listener recursively called subscription cleanup
and `pg.Client.end()`, producing the observed MaxListenersExceededWarning. Raising
the listener limit would hide this cleanup bug.
