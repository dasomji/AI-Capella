# Railway deployment configuration

Configuration only; nothing has been provisioned. An authorized operator creates a
separate fork project/environment, Postgres plugin and private Railway object-storage
bucket. Do not reuse the prototype's credentials or data. Select repository root as
build context and `railway.web.toml` / `railway.worker.toml` as each service's config
file. These files configure existing services; they do not create databases/buckets.
See [Railway config reference](https://docs.railway.com/config-as-code/reference)
and [pre-deploy commands](https://docs.railway.com/deployments/pre-deploy-command).

| Service | Image/start | Exposure and dependencies |
|---|---|---|
| web | Dockerfile; node --import tsx server/entry.ts | public HTTPS + Socket.IO on Railway PORT; one replica; Postgres + S3 + Resend |
| worker | Dockerfile.worker; node --import tsx server/transcription-worker.ts | no domain/public port; Postgres + S3 + OpenAI |
| PostgreSQL | Railway plugin | private DATABASE_URL; migration role needs pg_trgm installation privileges |
| objects | Railway S3-compatible bucket | private; browser-reachable HTTPS endpoint for short-lived signed downloads |

One web replica owns in-memory playback ordering, sessions and admission limits.
A dedicated PostgreSQL connection holds advisory lock `(714083,1)`; a replacement
can serve HTTP before acquiring it. `/healthz` is process liveness; `/readyz` is the Railway deploy healthcheck and database/migration readiness, reporting sandbox and
rehearsal booleans. `/readyz/rehearsal` is 503 on standby, for ownership monitoring,
not deploy admission. During overlap there must be only one owner. Expect a short
Together outage until old sockets drain and the lock transfers. Clients reconnect,
join, recheck membership and obtain paused/reconciled snapshots. No commands queue
offline. Check `/readyz/rehearsal` after admission to confirm ownership handoff. Standbys poll
the lock every second; only genuine errors use exponential backoff.

Web pre-deploy runs `npm run db:migrate`: only DATABASE_URL is required by that
script; advisory lock 17031501 serializes concurrent migrators. Worker has no
migration hook: deploy web/migrations first. Keep schema changes backward compatible
with the previous web and worker while both may be running. Railway drain windows
are 15s web / 25s worker; application hard deadlines are 10s / 20s. Direct Node
commands ensure SIGTERM reaches the application rather than an npm wrapper.

| Variable | web | worker | Classification / example |
|---|---|---|---|
| NODE_ENV | yes | yes | public setting: production |
| DATABASE_URL | yes | yes | secret; private Postgres connection reference |
| BETTER_AUTH_SECRET | yes | absent | secret; generated >=32 chars, never VITE_* |
| BETTER_AUTH_URL | yes | absent | public origin: https://scores.example.org |
| TRUSTED_ORIGINS | yes | absent | public exact comma-separated HTTPS origins, same origin normally |
| MAIL_TRANSPORT | resend | absent | public setting |
| MAIL_FROM | yes | absent | public verified sender: LightScore <scores@example.org> |
| RESEND_API_KEY | yes | absent | secret; domain-scoped mail key |
| OPENAI_TRANSCRIPTION_MODEL | yes | yes | gpt-6.1-sol default; must be identical on web and worker; effective model/prompt logged at startup |
| S3_FORCE_PATH_STYLE | optional | optional | true by default for SeaweedFS/dev; verify bucket addressing on first deploy |
| OPENAI_API_KEY | absent | yes | secret, worker only |
| S3_ENDPOINT | yes | yes | public HTTPS endpoint, not browser credentials |
| S3_REGION | yes | yes | public region from bucket settings |
| S3_BUCKET | yes | yes | private configuration, bucket name |
| S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY | yes | yes | secrets, bucket-scoped |
| APP_TIME_ZONE | yes | yes | public setting: UTC (explicit IANA zone) |
| PORT | injected | absent | web only; Railway assigns |
| AUTH_IP_HEADERS | yes | absent | x-forwarded-for only after proxy verification below |
| AUTH_TRUSTED_PROXIES | yes | absent | verified edge socket-peer IP/CIDRs, never 0.0.0.0/0 or ::/0 |
| TRANSCRIPTION_EMERGENCY_STOP | yes | yes | 0 normally, 1 forces processing stop |
| TRANSCRIPTION_WORKER_CONCURRENCY | yes | yes | 2; keep same global capacity everywhere |
| TRANSCRIPTION_PRICE_TABLE | optional | optional | public JSON USD/million tokens; absent prices mean unknown cost |
| DB_POOL_MAX | optional | optional | 10; size combined pools below DB connection budget |

Worker startup selects worker-only env validation before importing shared modules.
The migrator requires only DATABASE_URL.
Additional limits/defaults are in `.env.example` and `server/env.server.ts`: PDF
50 MiB, photo 20 MiB, max 60 pages / 40M pixels, ensemble storage 5 GiB, native/XML
score 20 MiB; user/ensemble active jobs 2/4, page lease 30s, timeout 180s, max attempts 3.
Do not raise limits without memory/CPU/load testing. Temporary staging is ephemeral;
originals live only in private S3, never a service filesystem volume.

Use a single HTTPS origin for app, API and sockets. Better Auth derives secure,
HttpOnly, SameSite=Lax cookies from production HTTPS baseURL; cookies are host-only
(no cross-subdomain domain). No COOKIE_DOMAIN env setting exists. Keep trusted
origins explicit; CORS is not authorization. Do not add wildcard origins.

Proxy setup is a first-deploy gate: observe the socket peer and Railway's actual
forwarding chain in a controlled request, verify spoofed X-Forwarded-For values
cannot choose the effective client IP, then set both AUTH_IP_HEADERS and
AUTH_TRUSTED_PROXIES together. Code walks the chain right-to-left to the first
untrusted hop. Do not guess broad private-network CIDRs. Leaving both empty uses
the socket IP safely but can group all visitors behind an edge and over-limit them;
resolve this before public release. Preserve the private header overwrite at the
Node boundary. Test sign-in throttling and websocket upgrade through the real edge.

In Resend, add the sender domain and install its supplied SPF/DKIM records, verify
them, review DMARC alignment and choose MAIL_FROM on that domain. Set domain-scoped
key only in server variables. Send one explicitly authorized verification/recovery/
invitation message on first deploy; routine tests use Mailpit/capture.

Both images install python3, libseccomp2 and poppler-utils and run as node. Run
`npm run ops:canary` in each deployed image before enabling transcription. The canary
uses the real Python launcher, applies 1536 MiB address-space / CPU / file limits,
and proves socket creation is denied (EPERM). Then upload a tiny known PDF through
the authenticated flow: inspect, preview and render it, check resource limits,
job cancellation and temporary-file cleanup. No paid call without separate approval.
Railway seccomp/nested restrictions and address-space behavior remain **unverified
until this first-deploy smoke test**. If unavailable, keep worker stopped and set
TRANSCRIPTION_EMERGENCY_STOP=1 on both; sandbox gates fail closed for inspection
and transcription while ordinary account/library/playback HTTP stays available.
Do not bypass seccomp. Move processing to a compatible isolated runtime only after
separate review and rehearsal.

CI only tests/builds; it never deploys, pushes images, contacts paid APIs or uses
repository secrets. Legacy functions/rules/omr-service remain excluded from images
and app CI pending migration plus separately authorized retirement.

Both images use a full-dependency build stage and a production-only runtime stage.
Migration export tooling runs from an operator machine/CI with full dependencies;
firebase-admin and development tools are excluded from both runtime images.

First-deploy bucket gate: verify the supplied region and endpoint, whether the bucket
requires virtual-hosted addressing (`S3_FORCE_PATH_STYLE=false`) or path-style (`true`),
and browser reachability/CORS for short-lived signed links. Run
`npm run ops:canary -- --s3` with the selected bucket credentials on each service:
it uploads/downloads known bytes using signed URLs and removes only its unique test key.
Without complete credentials it reports skipped; this is not bucket verification.
