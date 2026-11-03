# Local development

Use Node 22.22+ and the existing rootless Docker context. All commands run from
`/home/dev/Development/AI-Capella-production` on `production-v1`. Never configure
this fork with the prototype's Firebase project, scan endpoint or credentials.

```sh
npm ci
cp .env.example .env
# Replace BETTER_AUTH_SECRET with a random value of at least 32 characters.
docker compose up -d
npm run db:migrate
npm run dev
```

Open http://localhost:3000. Register, open the verification email in Mailpit at
http://localhost:28025, verify, and sign in. English/German follows the stored
`ai-capella-lang` preference or the browser language; the account records the
language chosen at registration. Imported scores remain in memory until reload.
The bundled Evening Rise and local MusicXML/MXL/MIDI import run without Firebase.
The audio engine, rendering and PDF export implementations are preserved.
Shared playback and transcription are unavailable until later phases.

Compose owns an isolated project (`lightscore-foundation`), persistent PostgreSQL
and SeaweedFS volumes, and loopback-only ports 25432, 21025, 28025 and 28333.
SeaweedFS uses explicitly local credentials from `scripts/s3-local.json`; it is
not a production configuration. Bucket creation/object APIs arrive in Phase 4.
`docker compose down` preserves data; `docker compose down -v` deliberately
removes **only this compose project's** local data. Do not run that against any
other project. No external services are provisioned by these commands.

```sh
npm run typecheck
npm test
npm run build
npm run test:integration
npm run check:secrets
```

Integration tests require Docker, local Mailpit, and a current build. The harness
creates, migrates, stops/restarts, and removes its own disposable PostgreSQL
container and volume; it never uses the development database. They launch real HTTP servers and the actual npm dev/start commands on
23001–23003. Fixtures use real accounts and session cookies, in-process capture
or SMTP to Mailpit, never an auth bypass, Resend or an AI provider. They create fixture accounts only in the disposable database. The time scenario
runs with `TZ=Pacific/Honolulu`. The secret check rebuilds with sentinel runtime
credentials and scans all browser artifacts, with a VITE positive control, forbidden server/prototype markers, and no public source maps.

`npm run db:generate` generates versioned SQL after schema changes;
`npm run db:migrate` applies committed migrations using only DATABASE_URL and a
Postgres advisory lock (17031501) to serialize migrators. `/healthz` is liveness;
`/readyz` verifies DB connectivity and the complete committed migration hashes.
Database/schema/repository modules are server-only (`*.server.ts`). Never add
server credentials to `VITE_*`, router loaders or browser configuration.

To exercise the built artifact locally without sending real mail:

```sh
npm run build
NODE_ENV=test npm start
```

`npm start` defaults to production safeguards. Real production requires HTTPS
Better Auth URL/trusted origins, a strong secret, database access, and configured
Resend. Production refuses auth bypass flags and nonproduction mail transports.
Do not provision/deploy as part of this phase. Runtime Node dependencies must be
installed, including `tsx`, used to run the typed persistent host. One HTTP/1
Node server serves Start and Socket.IO; use one instance until Phase 3 specifies
ordering/fanout across replicas. Secure cookies are HTTP-only, SameSite=Lax and
Secure in production. Cookie caching is disabled so session revocation is checked
against PostgreSQL. Session-deletion hooks immediately disconnect existing sockets on sign-out,
revocation and password reset. A single batched query every 15 seconds checks
expiry/external deletion and tolerates two consecutive database failures; no rehearsal commands or ensemble rooms exist yet.

Legacy suites remain separate and unchanged:

```sh
npm --prefix omr-service ci
npm --prefix omr-service test
npm --prefix rules-test ci
npm --prefix rules-test test
```

The rules suite uses its `demo-ls` emulator project and requires Java. Do not point
these suites at any real Firebase project. Scan service migration belongs to a
later phase; this application does not call it.


Auth rate limits use PostgreSQL (`rate_limit`), enabled in all modes: sign-in and
signup allow 60/minute plus 10/minute per normalized email; password reset and verification resend allow 5/minute.
The general limit is 100/minute. Without proxy configuration, the Node socket supplies the client IP. For Railway, configure `AUTH_IP_HEADERS` (for
example `x-forwarded-for`) and `AUTH_TRUSTED_PROXIES` (comma-separated actual proxy
IPs/CIDRs). Only trust headers overwritten by the ingress; restrict direct origin
access to that ingress. The Node host checks the immediate socket peer against those proxies before
interpreting the header chain; missing client headers from a trusted peer fail closed. Do not trust broad client-accessible private ranges.
Tests keep origin checks and rate limiting enabled. NODE_ENV=test requires a
loopback Better Auth URL; unset/unknown environments do not relax production
safety. There is one process-global pool and auth instance across native/Vite
module graphs, guarded by symbol keys and verified by duplicate-module tests.

Run `npm run accounts:cleanup` daily via the eventual deployment scheduler to
delete unverified accounts older than seven days. Scheduling is documented only;
no task has been deployed. This command logs only UTC capture time and count.
Production account closure requires the Phase 2 last-lead transaction guard
specified in PLAN.md. Mail runs in background tasks with sanitized error logs;
there is no durable mail queue yet, so failed delivery requires requesting a link
again. Verification JWT replay is idempotent and never creates a session; reset
identifiers are hashed and reset tokens are single-use and expire.

Built-mode browser smoke: create a disposable database on loopback port 25435,
migrate it, then start with NODE_ENV=test, PORT=3005, BETTER_AUTH_URL and
TRUSTED_ORIGINS=http://localhost:3005, and MAIL_TRANSPORT=smtp. Run
`PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node scripts/browser-smoke.mjs`.
Run `npm run test:browser` (optionally `CHROMIUM_PATH=/path/to/chromium`). The script uses Playwright Chromium by default, writes evidence in a temporary directory, and exercises the production CSP (also enforced in test mode).
Remove the fixture container with `docker rm -fv` when finished. Never point this
script at an existing account or real mail service.

Phase 2b: accounts now create ensembles or browse Samples from the title screen.
Ensemble repertoire persists through the authenticated API; ordinary members may
open local MusicXML/MXL/MIDI files privately without uploading them. Together uses
the local transport until Phase 3. No service worker is installed.

`npm run test:browser` runs the two-context Phase 2b workflow; the retained musical,
auth/recovery/PDF and full theme harness is `npm run test:browser:foundation`.
Install Chromium with `npx playwright install chromium`, or set CHROMIUM_PATH.
Both require the disposable built-mode server and Mailpit described above.
Phase 2b evidence defaults to `/tmp/aicap-p2b/shots/` (override BROWSER_EVIDENCE);
BROWSER_BASE defaults to `http://localhost:3005`. The implementation run used an
owned `aicap-p2b-client` Postgres container on loopback port 25436; it never used
or altered development database fixtures. Remove only your owned fixture container
after stopping its server. SMTP must target the local Mailpit, never Resend.

Phase 3 prerequisite changes: score POST bodies are raw MusicXML (`text/xml`) or
native Score JSON (`application/json`), with percent-encoded `X-Score-Title`,
`Idempotency-Key` and version replacement `X-Expected-Revision` headers. Verification
email links now ask for the password the user chose; link navigation alone no
longer verifies an account. Unknown passwords must use the recovery flow.
Account mail shares a recipient budget of 3/hour and 10/24 hours. Sign-in email
budgets count failures, with a bounded global delay rather than global lockout.
Playback remains local until the remaining Phase 3 protocol work lands.
