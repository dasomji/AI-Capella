# Final CI/harness fixes — local verification (2026-11-04)

Production checkout, branch `production-v1`, starting at `23c9924`. No push,
deployment, paid AI call, or real email. Owned Docker fixtures use dynamically
allocated loopback ports. Existing containers and services were left alone.

## Foundation diagnosis

The original report recorded five generic HTTP 401 console errors without URLs;
its request list alone cannot establish which responses failed. A fresh instrumented
reproduction completed the UI assertions and exited 1 with ten such errors. All ten
responses were `GET /api/me` (same application origin). The fixed rerun confirmed
all ten were requested in the signed-out phase and paired each console message
with its response URL. Thus the reproduced failure is unauthenticated session
probing, with a timing-dependent count, rather than an authenticated API failure.
The first five failed response URLs were all `http://localhost:45259/api/me`.
The subsequent phase-aware run used `http://localhost:33389/api/me`.

Only exact generic 401 resource messages with a corresponding same-origin
`/api/me` or `/api/auth/get-session` response requested while signed out are
accepted. Sign-in submission ends this allowance; sign-out begins it again.
All page errors and other console errors fail, as do unexpected HTTP errors.
Negative controls passed for signed-in 401, other paths/origins, missing URLs,
500s, custom errors and duplicate console errors without matching responses.

## Commands and evidence

Local evidence: `.review-evidence/ci-fixes/`, including command exit statuses and
durations in `results.jsonl`, individual logs, screenshots and `network-errors.json`.
`foundation-repro-network.json` retains the initial HTTP failure inventory.
The initial browser launch failed because Chromium's Unix socket path exceeded
its limit; a shorter ignored `.t` directory within the checkout resolved it.
System Poppler was unavailable: checks used the prior verification's extracted
Poppler executable/libraries; application source and assertions were unchanged.

Workflow validation used Python PyYAML parsing plus manual action/schema review
(actionlint unavailable); assertions checked global strict bash defaults and both
Mailpit port mappings. Local control under `bash -euo pipefail` returned 17 from
`(exit 17) 2>&1 | tee ...`, preserving the failing producer's status.

Completed checks (all exit 0):

- `npm ci`, `npm ci --prefix rules-test`, `npm run typecheck`.
- `TZ=UTC npm test`, `TZ=America/New_York npm test`: 271 tests each.
- `npm run build`; `npm run check:secrets` and `NODE_ENV=test npm run check:secrets`:
  positive control detected, isolated build directories, no client leaks/maps.
- `npm run db:migrate`; `npm run db:generate` plus tracked/untracked drift checks:
  fresh database migrated, no schema drift.
- `npm run test:integration`: 90/90 with owned S3 and pinned Mailpit on custom ports.
- `npm run eval:transcription -- --dry-run`: 8/8 recorded cases, no paid calls.
- `npm run test:migration`: 17/17 with demo Firestore emulator and rollback.
- `npm run test:backup`: full isolated restore, parsed score and matching object
  bytes; corruption and database-reference mismatch rejected.
- `npm run test:ops`: drain, leases, owner release and hard deadlines.
- `docker build -t aicap-ci-fixes-web -f Dockerfile .` and corresponding
  `aicap-ci-fixes-worker` / `Dockerfile.worker`; both images passed
  `docker run --rm <image> npm run ops:canary` (sandbox and PDF support).

Browser commands run with `CHROMIUM_PATH=/usr/bin/google-chrome`, owned local
S3, and per-suite `BROWSER_EVIDENCE` directories (all exit 0):

- `npm run test:browser`: account/themes, Phase 5a offline/logout, two-account
  Together, and sync acceptance a–n (also covers `test:browser:sync`'s script).
- `npm run test:browser:transcription`: Phase 4c acceptance.
- `BROWSER_SCRIPT=scripts/browser-admin.mjs npm run test:browser`: 35 screenshots,
  AA text contrast >= 4.5.
- `BROWSER_SCRIPT=scripts/browser-final-offline.mjs npm run test:browser`:
  final offline regressions.
- `BROWSER_SCRIPT=scripts/browser-final-polish.mjs npm run test:browser`:
  35 screenshots, AA text contrast >= 4.5.
- `npm run test:browser:foundation`, invoked inside the disposable browser harness
  via an ignored npm-command wrapper: UI/password-reset/PDF/five-theme assertions,
  ten correlated signed-out `/api/me` 401s and no unexpected errors. The same
  script also passed directly through the harness after the fix.

The final full-sequence foundation rerun also passed (ten expected signed-out
`/api/me` responses, no unexpected errors). All 24 final check results exited 0.
Owned service containers, image tags and the short Chromium temporary directory
were removed; evidence remains in the checkout. Workflow validation was local;
no GitHub-hosted CI run was triggered.
