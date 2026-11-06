# LightScore private preview

Use the production checkout only; never the prototype or Firebase. The main
instance is deliberately registered on `production-v1`. All data/credentials live
in Lizardtail/rootless Docker or private host state, outside the checkout.

The host's installed Lizardtail source is current but its global `dist` is stale.
A separate compiled build is installed in
`~/.local/state/aicap-preview/tools/lizardtail`, with executable links and native
Mailpit in `~/.local/state/aicap-preview/tools/bin`. Put that bin directory first
on PATH. No project dependency or existing dev/build/migration command is wrapped.
Mailpit v1.27 was extracted from
`axllent/mailpit@sha256:e22dce5b36f93c77082e204a3942fb6b283b7896e057458400a4c88344c3df68`.
Its supervised process binds only loopback HTTP and a mode-600 SMTP Unix socket.
Lizardtail has no general container-service declaration; native supervision lets
its process ownership checks protect the Mailpit UI port.
On this CLI version, a fresh PostgreSQL container may pass its readiness probe
during initdb's temporary server and then reject migration/clone during restart.
If startup reports that PostgreSQL is starting/shutting down, inspect `doctor`
and retry `up` after initialization; preserve the initialized volume.

The CLI allocates ports by service name, so `web` consumes `${port.web}` and the
`app` endpoint routes to it. Database migration finishes before managed services
start; storage initializes before web/worker. The generated storage secret also
supplies Better Auth's 48-character secret from private Lizardtail credentials.
Each instance owns a separate SeaweedFS store/bucket, even though its bucket name
is `assets`. Signed downloads use the independent HTTPS storage origin without
rewriting paths; ordinary S3 calls use loopback.

The managed Caddy route receives requests over a Unix socket and does not supply
a usable client-IP chain. Leave AUTH_IP_HEADERS/AUTH_TRUSTED_PROXIES empty:
authentication counts the loopback socket peer, so preview users share IP budgets.
Trusting X-Forwarded-For here would make auth return client_ip_unavailable.

For verification, run `npm run typecheck`,
`npx vitest run tests/preview-config.test.ts`, `npm test`, `npm run build`,
`npm run check:secrets`; then seed twice via `lizardtail exec` and check sign-in,
ensemble membership/pieces, ordinary and synchronized playback, sysadmin access,
mail capture, secure cookies, storage signatures, assets and HMR. Keep browser
evidence outside Git. The repository does not yet have the shared ladder
`check:fast`/`check:full`/`verify:app` contract; these commands and recorded browser
evidence are the task-specific checks, not receipts for those missing rungs.

Check both the internal Caddy gateway with the expected Host and the real HTTPS
tailnet URL. Some Tailscale versions cannot hairpin to hosted Services. A local
host-resolution override exercises HTTPS browser behavior, but does not establish
remote ACL/advertisement access. Report that distinction and any missing approval.
Do not retag the host or change tailnet ACLs as a startup fix.
