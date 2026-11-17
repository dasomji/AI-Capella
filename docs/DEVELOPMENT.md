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
unless `TRANSCRIPTION_PROVIDER=fake`; routine tests run NODE_ENV=test with FakeProvider.
Never use production keys or invoke paid AI accidentally.

## Private Lizardtail preview

From `/home/dev/Development/AI-Capella-production` on the development host:

```sh
# This host's PATH CLI has stale compiled output; use the isolated current build.
export PATH="$HOME/.local/state/aicap-preview/tools/bin:$PATH"
lizardtail plan --instance main
lizardtail up --instance main
lizardtail exec --instance main -- npm run seed:dev
lizardtail down --instance main  # preserves data and stable URLs
```

Use the HTTPS app/mail/storage URLs printed by `up`. `admin@test.com` and
`user@test.com` both use password `password`, with verified emails. Admin is a
sysadmin and Testchor lead; Test User is an ordinary member without capabilities.
The idempotent seed resets those credentials, imports bundled MusicXML through the
normal piece API, and refuses production mode or non-loopback databases. Never use
it in production. The manifest provides fresh isolated Postgres 17/SeaweedFS,
generated host-state secrets, FakeProvider, secure HTTPS cookies and native Mailpit
v1.27 (extracted from compose's pinned image; installed on the host PATH, no relay).
Mailpit stores mail and its private SMTP socket outside Git in host state. New
signups' verification mail appears in its browser UI. `SMTP_SOCKET_PATH` is a
development alternative to SMTP_URL; `S3_PUBLIC_ENDPOINT` controls only signed
browser downloads while `S3_ENDPOINT` stays internal. `npm run dev` owns a stable
TCP listener and runs Vite/the backend in a child process. Server/config changes
replace only that child; client edits still use Vite HMR. Requests arriving during
restart wait up to 15 seconds for the child. Existing requests/WebSockets may
disconnect and reconnect; Postgres, mail, storage, Caddy and the worker stay up.
Worker or dev-runner changes still require `down`/`up`. The dev CLI accepts
`--host`, `--port` and `--strictPort` and always refuses occupied ports. This also
works outside Lizardtail; built `npm start` is unchanged. Lizardtail's own
30-second HTTP-readiness failure policy still applies if the app cannot compile
or boot for an extended period. Named Tailscale Services need
host advertisement approval and client ACL grants; local checks cannot prove
another device's access. See [preview verification](agents/preview.md).

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

CI ([layout, failures and caches](#ci)) runs only when a PR is opened, updated, reopened or
marked ready (plus manual reruns), never after merge; see docs/DEPLOYMENT.md. It builds
app/worker Docker images without pushing and has no deployment permissions, paid APIs or
repository secrets. Phase 6a migration tests are mandatory; missing scripts fail CI. The legacy
standalone rules suite is superseded by app authorization tests, but the migration suite uses the
local Firestore emulator and its rules-test tooling. Legacy files stay for migration/retirement
evidence. See DEPLOYMENT.md and SYSADMIN.md for operations.

Migration export/import runs on an operator machine or a dedicated CI job with full
dependencies. Production images omit firebase-admin, Vite, Vitest, Playwright and drizzle-kit.
`test:ops` requires `npm run build` first and fails immediately without dist.

## CI

Workflow `.github/workflows/deploy.yml` ("Production CI (no deployment)"). All jobs start
together. Superseded runs of the same PR are cancelled.

| Job (check name) | What it runs | Fixtures |
|---|---|---|
| `checks (typecheck)` … `checks (design-tokens)` (9) | typecheck; unit (runner UTC + `TZ=America/New_York`); build; check:secrets; eval dry run; build + test:migration (Java 21, Firestore emulator); test:backup; docker (web + worker images, ops:canary in each); design token + utility guards | own containers where needed |
| `integration (…)` | db:migrate on a fresh database, schema drift, build (hosting tests serve `dist/`), test:integration | Postgres + Mailpit services, SeaweedFS |
| `browser (power hint; accounts …)` | power hint, Phase 2b | harness-owned Postgres/Mailpit/build per script, SeaweedFS |
| `browser (offline …; Together sync …)` | Phase 5a, Together sync, sync acceptance, then build + test:ops | same; **timing-sensitive sync runs alone on this runner, sequentially** |
| `browser (admin parity; auth flows; transcription …)` | admin parity, auth flows, transcription | same |
| `design (design-system showcase; theme extension)` | theme extension, design-system showcase, component forms | Vite dev server only |
| `design (keyboard parity; renderer themes)` | keyboard parity, renderer themes | Vite dev server only |
| `integration-browser` | gate + run overview + coverage guard | none |

Required checks are the nine `checks (…)` and `integration-browser`. The gate fails when any
integration/browser/design job fails or is cancelled or skipped, so those jobs need not be required
individually. Without `BROWSER_SCRIPT`, `npm run test:browser` runs five scripts in one fixture.
CI runs each one as `BROWSER_SCRIPT=<script> npm run test:browser` with its own fresh fixture;
every script creates its own accounts. `scripts/ci/check-coverage.mjs` (run by the gate) fails if a
script is added to that default sequence, or any `test*`/`check:*` npm script exists, that CI
doesn't run. Documented exceptions are listed in the script. Timeouts are 10 min for checks, 20 min
for the other jobs and 5 min for the gate, about 3× the observed maximum.

**Reading a failure.** Every suite step runs through `scripts/ci/run-suite.mjs`. It keeps the full
log and parses node:test TAP, Vitest, tsc and uncaught Node/Playwright errors.

1. The run's **Summary** page starts with the *CI overview* from `integration-browser`. Under
   "What failed" it names the job, the suite, the first assertion with `file:line`, and the
   artifact.
2. The failed job's own section on the same page gives the command, the command to re-run it
   locally, each parsed failure (test name, assertion, location), the last 40 log lines and the
   evidence count.
3. `::error` annotations (max. 5 per suite) appear on the run page and at `file:line` in the PR's
   *Files changed* view.
4. Artifact **`failure-<job>`** (14 days) holds per-suite logs in `.review-evidence/ci/logs/<suite>.log`,
   screenshots, Playwright traces in `.review-evidence/playwright/*.zip` (open with
   `npx playwright show-trace <zip>`) and `seaweedfs.log`. All browser-isolated suites record traces.
   The Vite design suites keep their own screenshots/JSON evidence.

A green run shows only the overview table: per job its duration, setup time outside suites,
per-suite time and cache hit/miss. Outside Actions the runner works the same way, for example
`node scripts/ci/run-suite.mjs --id x --title X -- npm test`, writing to `.review-evidence/ci/`.

**Caches.** These caches are exact-key; a miss re-downloads and saves:

- npm download cache via setup-node, keyed on `package-lock.json`. `npm ci` still installs clean.
- Playwright Chromium in `~/.cache/ms-playwright`, keyed on the installed Playwright version
  rather than the lockfile.
- Firebase emulator jars, keyed on `rules-test/package-lock.json`.
- `rules-test/node_modules`, keyed on Node version + `rules-test/package-lock.json`. On a hit,
  `npm ci --prefix rules-test` is skipped.

GitHub scopes caches per branch. A PR reads its own caches and those of `main`, but CI never runs on
`main`, so the first run of a new PR is cold (see the cold/warm numbers in
CI_HARNESS_VERIFICATION.md). App `node_modules`, Docker layers and apt packages are deliberately
not cached. `scripts/ci/install-system-deps.sh` skips `apt-get update` unless the cached package
index fails.

