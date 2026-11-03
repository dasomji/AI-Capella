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

Phase 1 fixes verification: restored theme selection/pre-paint shell metadata;
account/session controls now use the player's existing menu and sheet; no fixed
sign-out overlay. Firebase config and SDK are removed from the client graph.
Theme/CSS implementation files are unchanged from the Phase 1 baseline (the
separate prototype checkout predates its parchment/revival additions); the dark
palette retains prototype `#0d0c16` / `#efe7da` and stored device choices work.
Server fixes include sanitized UTC/request-ID logs, hashed reset identifiers,
background mail, duplicate-account notification/recovery, cleanup command,
explicit origin checks, persistent rate limits and configurable proxy trust,
namespace authentication, immediate socket revocation hooks and 15-second batched
checks tolerating two consecutive database failures. Liveness survives database
loss, readiness returns 503 and recovers. Shutdown has a 10-second forced exit.
Cache policy and security headers apply through shared dev/built middleware;
public hashed assets are immutable, public source maps are refused, and the
secret scanner proves detection using a VITE positive control before a clean build.

Validation: typecheck; four unit tests; build; seven integration scenarios in an
owned disposable Postgres container (including stop/start, pooled backend
termination, connected-socket revocation, polling cookies, pending migrations,
hostile/missing origins, reset expiry/replay/garbage, schema constraints, cookie
flags and production refusals); secret check; and rules-test npm ci. No development
database fixtures or external infrastructure changes. Browser evidence under
`/tmp/aicap-p1-fix/`: built start → signup/verification/sign-in → sample → actual
AudioContext playback → staff view → PDF by mouse → account-menu sign-out →
reset/sign-in; dark, light and stored-dark screenshots. PDF 121433 bytes; zero
browser errors or Firebase requests. Screenshot files include
`shots/start-sample.png`, `shots/start-playing.png`, `shots/start-staff.png`,
`shots/start-light-sample.png`, and `shots/start-stored-papier.png`.

Supersedes the original Phase 1 known gaps above concerning browser smoke,
one-second socket polling, Firebase dependency retention and development-DB test
fixtures. Verification links remain Better Auth's signed JWTs: replay is
idempotent and creates no session. Reset tokens are hashed, expiring and single
use. Cleanup scheduling and production rollout remain operator work; neither
was deployed. Phase 2 still supplies durable library persistence and ensemble
permissions; local imports remain intentionally ephemeral.

### Phase 2a — 2026-11-03 (server)

Domain API uses Hono `/api` routes, shared Zod input contracts in
`src/api/domain.ts`, and one DB-backed authorization helper (also used by socket
commands). Platform sysadmins receive no implicit ensemble privileges. Every
multi-row write uses a transaction; ensemble rows serialize lead protection,
invitation lifecycle and library mutations. Importing a transcription result in
Phase 4 **requires editPieces**, independently of transcribe.

| Method | Path (under `/api`) | Required capability |
| --- | --- | --- |
| GET / POST | `/ensembles` | verified account (create becomes lead) |
| PATCH | `/ensembles/:ensemble` | lead |
| GET | `/ensembles/:ensemble/members` | manageMembers |
| PATCH | `/ensembles/:ensemble/members/:member` | lead |
| DELETE | `/ensembles/:ensemble/members/:member` | self, or manageMembers (lead targets require lead) |
| DELETE | `/account` | own account; last-lead guard |
| GET / POST | `/ensembles/:ensemble/invitations` | manageMembers (grants require lead) |
| POST | `/ensembles/:ensemble/invitations/:invitation/resend` | manageMembers |
| DELETE | `/ensembles/:ensemble/invitations/:invitation` | manageMembers |
| GET | `/invitations/:token` | public, masked preview |
| POST | `/invitations/:token/accept` | verified intended email |
| GET / POST | `/ensembles/:ensemble/pieces` | member / editPieces |
| GET / PATCH / DELETE | `/ensembles/:ensemble/pieces/:piece` | member / editPieces / editPieces |
| GET | `/ensembles/:ensemble/pieces/:piece/versions/:numberOrHash` | member |
| POST | `/ensembles/:ensemble/pieces/:piece/versions` | editPieces, expectedRevision |
| POST | `/ensembles/:ensemble/reorder` | editPieces |

Capabilities in the public API are manageMembers/editPieces/transcribe; storage
retains the Phase 1 column names. Transfers use a member PATCH with
`isLead: true, stepDown: true`. Invitations require a per-attempt idempotencyKey;
retries reuse it, new sends use a new key. Expiry is exactly 336 elapsed hours,
not local calendar arithmetic. Send intent commits as not_sent before email delivery; failures remain visible
with rotated retry links. No recoverable raw token is persisted. Native score schemaVersion
is 1; MusicXML preserves raw input and rejects entity declarations. Default score
limit is 20 MiB (`SCORE_MAX_BYTES`). Reorder accepts the complete ID list and
assigns padded integer keys under the ensemble lock. `replace` replaces saved
configuration only and requires expectedRevision; other settings update individual
JSONB paths. Null removes a path. Versioned bodies use private immutable caching.

Socket namespaces support authenticated `ensemble:join` with acknowledgement;
`library:changed` events contain only changed IDs/revisions/version hashes. Each
recipient is rechecked against the session and membership before emission;
permission changes remove room subscriptions immediately (clients rejoin).

Phase 1 leftovers: host derives IP from the socket by default; trusted proxy
headers are interpreted only from a configured trusted peer. Production rejects
partial proxy configuration. Session listing/revocation uses opaque IDs. Signup
returns the same acknowledgement for new/existing accounts. Per-IP sign-in/signup
limit is 60/minute plus hashed per-email 10/minute. Auth errors and checked-out
Postgres clients use the redacting logger; socket close cleans up listeners;
shutdown awaits background tasks for up to 5 seconds. Readiness accepts newer
migration suffixes and has a bounded query. CSP restricts connect/form to self.
Inline scripts remain required by Start hydration and inline styles by the legacy
renderer; replace script unsafe-inline with a per-response Start-compatible nonce
when the shell/renderer move in Phase 2b (do not blindly remove hydration scripts).
Browser smoke supports CHROMIUM_PATH or Playwright default and writes os.tmpdir()
evidence via `npm run test:browser`.

Rules-test invariants ported: anonymous/nonmember denial, membership-dependent
library access, guessed cross-ensemble piece/body/member/invitation denial,
no platform-role escalation through capability input, session-authenticated socket
isolation, revoked membership loses access. The legacy broad member edit success
is deliberately replaced by default edit denial. Firebase-only reusable code,
leader-code/session-write semantics are superseded by invitations and the future
Phase 3 playback protocol; rules-test remains unchanged.

Phase 2a open questions: ensemble deletion is intentionally absent. Account
closure preserves ensemble-owned original/job rows. The invitation accept page
and auth/client routing belong to Phase 2b; the server supplies a trusted-origin
callbackURL preserving `/invite/:token` through verification. A process crash after intent commit leaves a visible not_sent invitation;
retry rotates the hash and link. Automatic retry cannot reconstruct the raw token
by design. A crash after provider acceptance may leave an ambiguous not_sent
status; explicit retry safely rotates the link. No real mail or infrastructure changes were made.

Additional implementation choices: the 0002 migration and snapshot were generated
before any persistent database applied them; only disposable fixture databases
were migrated here. User-scoped advisory transaction locks serialize account
closure with new ensemble creation/invitation acceptance, before sorted ensemble
locks. Native JSON uses deterministic key ordering for hashing and body delivery.
Invitation send attempts retain all request keys (maximum five), and Resend receives
a per-attempt idempotency key. Existing recipients' stored language is the default
when the inviter supplies none. List responses include the caller's membershipId
so ordinary members can leave without member-list privileges. Reordering and new
piece keys use serialized numeric ordering; no client-provided sort keys are accepted.

Verification: `npm run typecheck`, `npm test` (4 unit cases), `npm run build`,
`npm run test:integration` (13 passing scenarios with real sessions/Postgres),
`npm run check:secrets` (positive control and clean browser-artifact scan), and
`npm run db:generate` (no schema drift). Production tests use real forwarded headers
and separate local socket source addresses, with spoofed private headers overwritten.
Integration coverage includes simultaneous granular edits, concurrent lead demotions,
full verification callback retention, exact native/XML body hashes, delivery failure,
re-invitation, older retry keys, and member removal stopping live events. Tests use
an injected clock across DST and midnight under a non-UTC process zone. No new
interactive browser smoke run in Phase 2a; the browser script is portable and the
Phase 1 musical behavior checks remain intact. Parent review/verification and the
Phase 2b client migration remain separate work.

### Phase 2b — 2026-11-03 (client)

Replaced prototype code/PIN ensembles with authenticated account memberships and
account-scoped last-ensemble/last-place storage. Title, create-ensemble sheet,
heading switcher (including bundled read-only Samples), rename/leave protection,
and bilingual member/invitation management use the existing menus, sheets and
parchment themes. Member managers cannot grant capabilities; leads can delegate
three independent capabilities, promote/demote leads and remove members with
confirmation. Library and player menus expose account/device sessions and logout.

The repertoire now lists server metadata, fetches immutable version bodies lazily
and caches promises by content hash. Cover parsing remains queued. Authenticated
WebSocket library events fetch only changed metadata; reconnect reconciles the
metadata list. Selection ahead of the list uses the single-piece endpoint.
Edits use granular operations plus expectedRevision, conflicts reload and show a
pencil notice, and dragging submits the complete order to the atomic endpoint.
Edit controls follow current capability grants. Private local imports remain
memory-only, open/play locally and carry a persistent pencil notice. Together
continues through the local playback transport pending Phase 3.

`/invite/:token` preserves the trusted callback through signup, verification and
sign-in, then accepts and selects the invited ensemble. It explains wrong account,
revoked/expired/unavailable and already-used links. Public preview remains masked.

Minimal server response changes required by the client: membership responses add
ensembleId (acceptance destination); session listing adds current (device mark);
sockets emit membership:changed before removing subscriptions. Clients recheck
membership, rejoin, hide revoked controls, or return to the title with an
explanation. A three-second account/membership check backs up socket delivery.
No schema/database migration, infrastructure change, real email or paid provider.

Validation: npm run typecheck; npm test (6 passing); npm run build;
npm run test:integration (13 passing, disposable Postgres); npm run check:secrets
(positive control and clean client artifacts); npm run test:browser (two isolated
headless Chromium contexts against built start + disposable Postgres + Mailpit).
Browser scenarios cover creation/import, signup/verification/invitation acceptance,
read-only playback/private import, live capability grant and rename, revision
conflict preserving concurrent data, wrong-account/revoked links, removal fallback,
current-device mark and library-menu logout. Evidence: /tmp/aicap-p2b/shots/,
including title-empty-{dark,light}, title-ensemble-{dark,light},
members-{dark,light}, invite-{dark,light}, invite-wrong-account, invite-revoked,
and player-{dark,light}.png. Dark defaults to Papier. The retained foundation
browser harness also exercises real audio, staff rendering, PDF and all five
stored/system theme combinations.

Phase 2b open questions / explicit limits: a first-time signed-out registration
cannot prefill the full invitation email from the deliberately masked public
preview; the invitee enters it. Exposing the full address would weaken the Phase
2a privacy contract. Cross-device verification works because the callback carries
the token and the invitation page restarts sign-in. CSP nonce migration from the
Phase 2a notes remains a shell/security follow-up; this change preserves the
existing Start/legacy renderer and its inline scripts. Offline persistence remains
Phase 5. Public invitation-expiry/already-used explanations are implemented;
revoked and wrong-account states have explicit browser coverage, while time-based
expiry remains covered by domain integration tests.
