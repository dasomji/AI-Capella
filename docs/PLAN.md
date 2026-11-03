# Production version: phase plan

Spec: `docs/spec/AICAP-1.md` (epic) and its children. Working branch: `production-v1`.

## Scope of this implementation run

In scope (code, tests, local dev setup, docs, runbooks): AICAP-2 … AICAP-16, AICAP-19, AICAP-20.

Out of scope for this run:
- AICAP-17 (revision history / trash UI): explicit follow-up, not a release blocker.
- AICAP-18 (legacy endpoint exposure): concerns the live prototype, which stays untouched here.
  Needs an authorized operator with Firebase/GCP access.
- AICAP-21, AICAP-22: "Later" tickets.
- Anything that provisions or mutates real infrastructure: Railway deploys, production
  migration, Firebase/Audiveris retirement, real email, live paid AI evaluation. Tooling,
  runbooks and dry-runs against local fixtures are in scope.

## Phases

1. **Foundation**: TanStack Start app, server-only config, Drizzle + Postgres schema and
   migrations, Better Auth email/password with verification and recovery, mail adapter
   (Resend + test adapter), local Docker setup (Postgres, SeaweedFS, mail catcher), test harness
   against a running app, sentinel-secret build check. Existing client runs inside the new shell.
   (AICAP-2, 3 schema, 4, 15 harness)
2. **Ensembles, permissions, invitations, library**: ensemble CRUD, leads, capabilities,
   lead transfer, invitations via Resend, metadata/body split, revision-checked edits, atomic
   reorder, client switched off Firebase for library/ensembles. (AICAP-3, 5, 6, 15)
3. **Synchronized playback**: Socket.IO authoritative command protocol, clock calibration,
   reconnect/late join, revocation on live sockets; rehearsal controller extraction.
   (AICAP-8, 9, 15)
4. **Transcription**: private original storage (S3 interface, SeaweedFS dev), durable jobs,
   direct GPT-6.1 Sol transcription with stubbed provider, notation validation, metrics, upload
   bounds, Audiveris removal. (AICAP-11, 12, 13, 14, 19)
5. **Offline and sysadmin**: service-worker policy, scoped private caches, logout clearing;
   sysadmin oversight UI/API with audit. (AICAP-7, 20)
6. **Migration and operations**: Firestore export/import tooling with reconciliation and
   dry-run, CI workflow, health/readiness, graceful shutdown, Railway runbook, backup/restore
   verification, PROJECT.md update. (AICAP-10, 16)

Each phase: implementation (GPT-6.1 Sol, high) → code review (Claude Sonnet 5.5, high) →
fixes → independent verification (GPT-6.1 Sol, high).

## Phase 1 architecture decisions

- TanStack Start/React owns routing and SSR at `/`; `/app` authenticates on the
  server and mounts the existing vanilla client through a client effect. Musical
  modules are preserved. Firebase initialization is hard-disabled, including for
  callers that directly import the legacy integration module. Bundled samples and
  ephemeral local imports use a `LibraryRepository`; `PlaybackTransport` defines
  the replacement seam. Legacy service-worker registration is disabled until the
  private cache policy in Phase 5.
- **One plain Drizzle membership model**, referencing Better Auth users. The
  organization plugin's additional member fields can represent capabilities
  ([official documentation](https://better-auth.com/docs/plugins/organization)),
  but its role-driven member/invitation endpoints would also need wrappers/hooks
  to enforce three independent capability grants, invitation token hashing and
  last-lead transfer. Plain domain tables keep those future operations explicit
  without exposing a second authorization surface or duplicating memberships.
  No organization/admin plugin is installed; platform roles are separate rows,
  and impersonation/destructive global endpoints do not exist. Phase 2 must use
  these tables transactionally rather than introduce another membership store.
- Start's documented fetch entry is hosted by Hono's Node HTTP adapter in the
  build; Vite's HTTP server is used in dev. Socket.IO is attached to that same
  HTTP/1 server in both modes. The hosting test runs the actual npm commands and
  authenticates sockets with real cookies. No separate socket port, proxy or
  deployment platform adapter is required. One process initially; no replicas.
- All application instants and auth timestamps are `timestamptz`; central runtime
  configuration validates `APP_TIME_ZONE` (UTC default). No local calendar logic
  is introduced. Tests cover an offset-qualified DST instant under Honolulu TZ.

## Progress log

### Phase 1 — 2026-11-03

Landed Start shell and bilingual account UI; persistent Node/Socket.IO hosting;
server-only validated configuration; integrated Better Auth Drizzle tables and
email/password verification/recovery/session handling; Resend/SMTP/capture mail
adapters; 15-table domain foundation and versioned SQL; rootless Docker local
services; health/readiness; local-only musical client and repository/transport
seams. No external infrastructure, prototype access, paid AI or real email.

Setup: see `docs/DEVELOPMENT.md` (`docker compose up -d`, `.env` from example,
`npm run db:migrate`, `npm run dev`). Production artifacts: `npm run build` then
`NODE_ENV=test npm start` for isolated local SMTP testing; unqualified `npm start`
defaults to production safeguards and requires real production configuration.

Verification: `npm run db:generate`, `npm run db:migrate`, `npm run typecheck`,
`npm test` (3 passing), `npm run build`, `npm run test:integration` (4 passing
scenarios, real Postgres and HTTP), `npm run check:secrets` (passing, browser
artifacts and source maps). Hosting scenarios cover actual dev/start commands
with Mailpit verification and authenticated WebSocket upgrade. Main auth scenario
uses in-process capture, real accounts, multiple devices, password recovery,
sign-out/expiry rejection by HTTP/socket, existing socket disconnect, wrong-origin
rejection, and non-UTC timestamptz persistence. Production bypass refusal tested.

Known gaps: no interactive browser/audio/PDF smoke test in this implementation
run; musical engine/render/export source is unchanged, and import fixtures/local
repository behavior are tested. Socket revocation polling has a bounded ~1 second
latency; per-command/membership authorization arrives in Phase 3. Local imports
are intentionally memory-only until Phase 2. SeaweedFS runs with persistent data
and local credentials; object API/bucket validation belongs to Phase 4. Legacy
`omr-service` and `rules-test` files/scripts are unchanged and were not rerun.
`npm audit` reports inherited Firebase/grpc and drizzle-kit/esbuild advisories;
no force upgrade was applied to the retained legacy dependency graph. Separate
review and independent verification belong to the parent orchestration run.

## Open questions

No Phase 1 credential or product blocker. Before release, run the interactive
musical smoke scenarios, triage retained dependency advisories, and configure
verified production sender/HTTPS origins through an authorized operator. This
phase deliberately provisions nothing.

### Phase 1 fixes — 2026-11-03

Review remediation is in progress on `production-v1`. Added migration 0001 rather
than replacing 0000 because 0000 has been applied to local databases. Domain tables
were empty; 0001 requires that precondition for new non-null tenant/version fields.
The migration preserves user/auth data. No production migration was performed.

Schema ownership: the current-version composite FK is SQL-managed and DEFERRABLE
INITIALLY DEFERRED, allowing a piece/version pair to be created in one transaction.
The SQL migration also owns `sort_key COLLATE "C"`, email-normalization triggers and
updated-at triggers; retain those on future Drizzle migrations. Drizzle declarations
provide equivalent ORM update hooks. Text IDs default to `gen_random_uuid()::text`.

Phase 2 account closure MUST first pass last-lead protection. All lead removal,
transfer, demotion and account closure paths must begin a transaction, lock the
ensemble row (`SELECT id FROM ensembles WHERE id = $1 FOR UPDATE`), then check
remaining lead memberships and mutate under that same lock. For closure spanning
ensembles, acquire ensemble locks in sorted ID order. Membership/role cascades are
storage semantics, not authorization to bypass this check. Originals/jobs remain
owned by the ensemble when their initiating account is deleted.
