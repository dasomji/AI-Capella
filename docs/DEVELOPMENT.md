# Development

Use Node >=22.22 and Docker with local-container access. Install python3, libseccomp2,
poppler-utils for inspection/render tests; install Playwright Chromium with
`npx playwright install --with-deps chromium`. Ensure `pdftoppm` is on PATH.

```sh
npm ci
cp .env.example .env
# Use local-only credentials/URLs from compose.yaml; replace placeholders.
docker compose up -d
npm run db:migrate
npm run dev
```

Compose exposes Postgres 25432, SeaweedFS S3 28333, Mailpit SMTP 21025/UI 28025.
MAIL_TRANSPORT=smtp delivers only to local Mailpit. `capture` is an in-process test
adapter. Production requires HTTPS + Resend. Development worker uses a real provider
unless deliberately injected; routine tests run NODE_ENV=test with FakeProvider.
Never use production keys or invoke paid AI accidentally.

```sh
npm run typecheck
npm test
TZ=America/New_York npm test
npm run build
npm run test:integration
npm run check:secrets
npm run test:browser
npm run test:browser:transcription
npm run eval:transcription -- --dry-run
npm run db:generate
npm run test:backup
npm run test:ops
```

Integration owns disposable Postgres and launches actual HTTP/dev/start servers;
SeaweedFS and Mailpit must be running at the compose endpoints. Browser harnesses
own disposable DB/mail and separate build roots, use real account sessions and
exercise account/theme, offline/logout, sync/restart and transcription flows.
CHROMIUM_PATH overrides the executable. Evidence defaults to `.review-evidence/<suite>` (the standard harness uses `browser`);
set `BROWSER_EVIDENCE` to select a directory, including for admin/final suites;
never use these harnesses against existing users/production services. They stub
external AI/mail boundaries, not authorization. The foundation browser suite is
available separately with `test:browser:foundation` against a local built server
(`BROWSER_BASE`, `MAILPIT_URL`). It records HTTP/request failures in
`network-errors.json` and accepts only same-origin session-check 401s issued while
signed out; all other console errors fail. Concurrent build/test runs should
use `LIGHTSCORE_BUILD_ROOT="$PWD/.review-evidence/my-build"` so hashed chunks remain
consistent. Browser harnesses choose per-process build roots; check:secrets uses
a unique mkdtemp directory under .review-evidence unless LIGHTSCORE_BUILD_ROOT is set.
An explicit build root is caller-owned and must not be shared with concurrent runs.

`db:generate` should produce no diff unless schema was intentionally changed.
Review generated SQL + metadata; do not edit applied migrations. `db:migrate` only
requires DATABASE_URL and serializes via advisory lock 17031501. Backups/restore
require Docker, write sensitive artifacts outside Git and own their disposable
containers; see RUNBOOK.md. `npm run ops:canary` needs no database or secrets.

Built local serving: `npm run build`, then `NODE_ENV=test npm start` with local
SMTP/test config. General /readyz verifies DB and committed migrations; it reports
sandbox and rehearsal state independently. /readyz/rehearsal is owner-only and must
not gate rolling-deploy admission. Exactly one web process owns shared rehearsal;
a standby can serve ordinary HTTP. Socket.IO attaches to the same HTTP server.

For uploads start `npm run worker` separately, with private S3 configuration on both
services. Development alone may initialize a missing bucket; production never does.
Configured public browser origin must reach S3 for signed downloads. Preserve originals
indefinitely; cleanup removes transient artifacts and explicitly deleted ensemble data.

CI runs on PRs and main/production-v1 pushes, builds app/worker Docker images without pushing and
has no deployment permissions. It runs typecheck, UTC/non-UTC unit suites, build,
sentinel scanner, disposable integration + browser suites, fresh migrations/drift,
eval replay, backup and graceful operations; Phase 6a migration tests are mandatory; missing scripts fail CI. CI installs the
rules-test dependencies, Java 21 and caches Firebase emulator jars. SeaweedFS is launched by a workflow Docker step because
GitHub service definitions cannot set its server command; Postgres and Mailpit use service containers. Integration hosting tests require
Mailpit SMTP on 21025 and API on 28025 (MAILPIT_URL overrides the API URL);
each browser harness owns its separate mail fixture. No paid APIs or repository secrets. The legacy standalone rules suite is superseded by app authorization tests, but
the migration suite uses the local Firestore emulator and its rules-test tooling. Legacy files stay
for migration/retirement evidence. See DEPLOYMENT.md and SYSADMIN.md for operations.

Migration export/import runs on an operator machine or a dedicated CI job with full
dependencies. Production images omit firebase-admin, Vite, Vitest, Playwright and drizzle-kit.
`test:ops` requires `npm run build` first and fails immediately without dist.
