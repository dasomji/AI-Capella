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

Integration tests require migrated local Postgres and Mailpit, plus a current
build. They launch real HTTP servers and the actual npm dev/start commands on
23001–23003. Fixtures use real accounts and session cookies, in-process capture
or SMTP to Mailpit, never an auth bypass, Resend or an AI provider. They create
uniquely named fixture accounts in the local development DB. The time scenario
runs with `TZ=Pacific/Honolulu`. The secret check rebuilds with sentinel runtime
credentials and scans all browser artifacts, including source maps.

`npm run db:generate` generates versioned SQL after schema changes;
`npm run db:migrate` applies committed migrations. `/healthz` is liveness;
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
against PostgreSQL. Existing sockets recheck sessions every second and disconnect
on revocation/expiry; no rehearsal commands or ensemble rooms exist yet.

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
