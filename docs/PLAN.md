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
3. **Synchronized playback — complete (Phase 3f)**: Socket.IO authoritative command protocol, clock calibration,
   reconnect/late join, revocation on live sockets; rehearsal controller extraction.
   (AICAP-8, 9, 15)
4. **Transcription — complete (local verification)**: private original storage (S3 interface, SeaweedFS dev), durable jobs,
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

### Phase 2 review fixes — 2026-11-03

Review B1/B2 and S1–S11 were verified against the Phase 2a server and Phase 2b
client. This entry supersedes the earlier account-closure, resend-limit and
reorder decisions above.

- Invitation limits use durable send-intent rows across every invitation state:
  five per recipient/ensemble in a rolling 24 hours, at least 60 seconds apart.
  Ensemble and inviter budgets default to 50 and 100 per rolling day. Revoking,
  expiring, deleting an issuer, or recreating an invitation cannot reset history.
  Expired pending invitations can renew once their window clears. Mutation and
  ensemble-creation limits are DB-backed (120/minute and 10/rolling day by default).
- Body middleware bounds auth/settings requests at 16 KiB and score requests at
  SCORE_MAX_BYTES + 64 KiB before JSON parsing. The decoded score still has the
  SCORE_MAX_BYTES cap. Granular settings follow the client's boolean split map,
  treble/treble8/bass clefs, saved bpm/transpose/sections/played and percussion map;
  values, keys, nesting and stored map counts are bounded.
- Pending invitations are revoked atomically when their issuer loses authority,
  leaves, is removed, or closes their account. Acceptance independently checks
  issuer authority and clamps a manager's grants to none. Manager resends preserve
  an existing lead's pending grants. Rotated hashes return `superseded`, with a
  translated client explanation. Co-leads remain equals: they may demote/remove
  one another, with audited mutations and last-lead protection.
- Replays bind normalized payload hashes to ensemble/user/key and operation.
  Invitation create/resend share a key scope. Mismatches return 422. Piece replay
  records survive piece deletion for 24 hours. `accounts:cleanup` also removes
  expired replay/send records and old superseded hashes. These tables deliberately
  retain opaque ids independently of deleted domain rows for their retention window.
- Ensemble create/rename include membershipId, isLead and capabilities. Reorder
  requires `expectedOrder` and returns 409 `stale_order` plus current ids on conflict;
  it updates sort keys without changing content revisions. The client sends its
  cached order. Real HTTP responses are parsed against shared Zod schemas in tests.
- Version downloads use attachment disposition, sandbox CSP and nosniff; MusicXML
  uses application/octet-stream. The unchanged fetch-based parsing/playback works
  in the browser smoke. Score validation/hashing precedes the ensemble transaction.
  Transactions set 5-second lock and 15-second statement timeouts, preserve the
  original error after a failed rollback, and discard broken clients. DB_POOL_MAX
  configures pool size. Migration 0003 adds delivery-state CHECK and deferred lead
  constraint triggers (including newly created ensembles); keep the handwritten
  trigger SQL when maintaining migrations.
- Capability events target only the affected member and preserve subscriptions;
  removal alone evicts. Library emission runs after commit in tracked background
  work, batches recipient membership/session checks, and logs transient failures
  without evicting sockets or changing the HTTP result. Version, metadata-op,
  account deletion and bounded denied-mutation audits contain ids/op names only.
- Account closure computes sole-member ensembles under locks. DELETE requires an
  exact explicit `deleteEnsembleIds` list; mismatch returns 409 with current ids.
  Sole-member ensembles and their pieces are deleted. Last leads of shared
  ensembles receive 409 with the relevant ids and must hand over first. Sessions
  older than ten minutes require password re-entry. The existing account sheet
  now previews deletions and provides confirmation/password controls in EN/DE.
- Duplicate signup on an unverified account sends password recovery rather than
  verification; completing recovery verifies the email, changes the password and
  revokes sessions. Original signup verification remains available. Unverified
  sign-in no longer sends a plain verification link. Failed sign-ins are scoped
  to email + IP, with a looser global email budget; IPv6 clients share /64 buckets.
  Every successful JSON auth response removes session tokens before JS receives it.
- Playwright was already present in devDependencies at the reviewed HEAD. The
  browser command now owns disposable Postgres, Mailpit and a built server, uses
  free ports by default, and cleans them up. BROWSER_PORT, BROWSER_DB_PORT,
  BROWSER_SMTP_PORT and BROWSER_MAIL_PORT can pin ports; BROWSER_EVIDENCE and
  CHROMIUM_PATH are supported. Missing Playwright Chromium is installed under
  ignored .review-evidence/browsers. Standalone browser scripts accept BROWSER_BASE
  and MAILPIT_URL (compose defaults localhost:3000 and 127.0.0.1:28025).

Verification results are recorded below after the final runs. No push, deployment,
production data access, or real email delivery was performed.

Final verification: `npm run typecheck` passed; `npm test` passed (6 unit tests);
`npm run build` passed; `npm run test:integration` passed (20 scenarios, disposable
Postgres, real HTTP/session/socket boundaries); `npm run check:secrets` passed
(positive control detected, client artifacts clean); `npm run test:browser` passed
from fresh disposable DB/Mailpit/server, including the account-deletion sheet;
`npm run db:generate` reported no schema changes. Regressions include chunked body
limits, change-password token omission, post-commit emitter failure, transient
socket membership reads, original-error preservation after rollback failure,
issuer acceptance clamps, deny audits, creation/mutation/email budgets, stale
order/revision separation, legacy invitation budget backfill and pre-hijack
password recovery. The migration conservatively ages legacy send counts from
last_sent_at because older per-send instants were not stored. Windows are elapsed
UTC durations rather than calendar-day rules; new stored instants use timestamptz.

Implementation commits: a1655aa (auth/HTTP), 14981de (domain/schema), 2b200a6
(upgrade budgets and confirmation), ad935a4 (client), 76a817c (browser harness).
All commits remain on production-v1; no push or PR.

### Phase 2 design pass — 2026-11-03

AICAP-24: account and invitation routes now share the title's ink wordmark and
voice ribbons on the selected ground, without a form card. Added Bodoni/Atkinson
form typography, ruled fields, password visibility controls, persistent DE/EN
buttons, quiet secondary navigation, email acknowledgement/resend controls and
masked invitation-address guidance. The wordmark stays mounted across auth modes;
its animation resources are disposed when the stage unmounts.

Members sheets now separate members, invitations and invite form; use compact
row menus, lead tags and accessible capability switches; and omit forbidden
controls. The last lead sees one explanatory line. Manager capability states are
read-only. Title empty-state actions are centered; device controls use the sheet's
visual language. Toasts sit above the sheet.

Browser evidence: `/tmp/aicap-p2-design/shots/index.html`. The harness uses fresh
contexts with persisted design/language choices, asserts light/dark computed
background differences and checks AA text contrast. Matrix covers DE/EN, 390/1440,
auto dark/light, Papier, explicit parchment and Samt. Edge-state invitations and
auth mail acknowledgements, empty-ensemble responses and ordinary-member UI
capabilities use explicitly labeled visual fixtures; real isolated
accounts exercise acceptance, role editing, playback and device/account actions.
Title captures wait for the written wordmark and finite entrance animations.
Ordinary members cannot fetch the member list under the existing server contract;
the matrix verifies their menu omits that sheet and captures their title, library
and devices instead. No server permissions were broadened.

Validation: `npm run typecheck` passed; `npm test` passed (6 tests);
`npm run build` passed; `npm run test:integration` passed (20 scenarios);
`npm run check:secrets` passed (positive control plus clean browser artifacts);
`BROWSER_EVIDENCE=/tmp/aicap-p2-design npm run test:browser` passed, including
contrast/theme assertions and the full visual matrix. Integration/build checks
were run sequentially after browser capture to avoid replacing active chunks.
The contact sheet indexes 567 screenshots. No push or infrastructure changes.

### Phase 3 — Part A remediation checkpoint (2026-11-03)

This checkpoint implements the Phase 3 prerequisite security/client leftovers.
**Authoritative synchronized playback (Part B / AICAP-8, AICAP-9, controller work
in AICAP-15) is still outstanding. Phase 3 is not complete.** The retained local
playback seam and legacy sync implementation have not yet been replaced. No
ensemble playback timing tolerance has been measured or claimed.

- Score create/version uploads authorize membership and editPieces before the
  HTTP body-limit middleware reads the stream, and reauthorize under the ensemble
  transaction. Request bodies are raw `text/xml` or native-score
  `application/json`; metadata uses percent-encoded `X-Score-Title`,
  `Idempotency-Key`, and `X-Expected-Revision`. The byte ceiling applies to the
  actual score. Two reusable worker threads validate/parse/canonicalize/hash
  scores, with eight waiting jobs, 30-second execution deadlines and idle
  retirement. Replay hashes use the content digest rather than serializing the
  score again on the event loop. An exact 20 MiB valid upload sustained 70 health
  probes with a measured maximum latency of 50.5 ms (local disposable fixture;
  regression ceiling 500 ms, not a production latency guarantee).
- Sign-in counts failures per normalized hashed email and email/IP. Global
  email pressure adds a progressive delay capped at one second; it never imposes
  a global hard lock. The existing per-IP and per-email/IP protections remain.
  Regression: 14 IPs × 9 failed passwords, then the correct password on a new IP.
- All verification and recovery mail, including internal duplicate-signup
  recovery calls, shares a transactional per-recipient budget of three messages
  per elapsed hour and ten per elapsed 24 hours. Duplicate signup sends one
  recovery message instead of a notification plus recovery message.
- Verification links open a password-confirmation page. Verification requires
  the signed link AND proof of the current account password; clicking alone
  never verifies. Someone who did not choose that password is instructed to use
  password recovery (which sets their password, verifies and revokes sessions).
  Successful password confirmation also revokes all sessions. Confirmation has
  its own five-failure/15-minute user/IP limit. This chooses the brief's permitted
  password-proof design rather than changing passwords on every verification.
- Account deletion has a separate five-failure/15-minute password budget and
  inline password errors. Only explicit SESSION_EXPIRED errors trigger expiry
  navigation. Closure purges the user's idempotency records and invitation-send
  records (including recipient-email matches). Cleanup prunes rate-limit rows
  older than 48 elapsed hours. These windows are durations, not calendar days;
  existing timestamp columns remain timestamptz and logs remain UTC.
- Manager refreshes preserve the original inviter and grants. Permission audits
  record old/new isLead and stored capability flags, including the actor's
  step-down during lead transfer; payloads contain no names/emails. Invitation
  acceptance checks the user again after acquiring the account-deletion lock.
- NUL text is rejected with 422. Saved-setting schema lookup uses own properties.
  Score-derived PDF SVG is parsed as XML and stripped of executable elements,
  event handlers, external/script URLs and unsafe style content before insertion.
  Staff rendering uses canvas; its source does not insert score-derived HTML.
- Invitation acceptance always requires an explicit click after authentication.
  Stored tokens clear after acceptance success/failure, invalid previews and
  sign-out. Reorder broadcasts one metadata batch, applied without per-piece GETs.
- Account/membership sockets and rename notifications refresh state on changes;
  reconnect and visibility restore refresh it too. The former three-second
  account/ensemble poll is now a 60-second fallback. Global rename notifications
  are restricted to subscribed ensemble rooms.
- Returning to the title rerenders the dedication, ensemble alternatives and mode
  actions. Capability tracks use a gold fallback in every theme, with contrasting
  right-hand knobs when checked. Browser assertions cover visible title choices
  and computed track/knob/position differences in the theme matrix.

Remaining Phase 3 work: shared Zod command protocol; canonical persisted state;
per-ensemble ordering/idempotency/revision/expiry; cached socket authorization and
revocation; rehearsal-controller extraction; calibrated scheduled audio transport;
late joins, sleep/reconnect/offline behavior; natural end/restart handling; all
playback unit/integration/two-context timing tests. For that implementation retain
one process: replicas will require sticky transport routing, a Socket.IO Redis or
Postgres fanout adapter, and single-owner ordering per ensemble. No replica
infrastructure was implemented here. This is a scope checkpoint, not a product
or credential blocker.

Part A verification: `npm run typecheck` passed; `npm test` passed (8 tests);
`npm run test:integration` passed (23 scenarios, disposable real Postgres, HTTP,
sessions and sockets); `npm run db:generate` reported no drift. Final browser and
secret-check results are recorded below. Browser fixtures now prove the password
before sign-in and click invitation acceptance explicitly. The isolated browser
harness checks TCP Postgres readiness to avoid its temporary bootstrap server.
Implementation commits: `4ac6911` (server/auth/upload boundaries) and `8111ccd`
(client consent/events/rendering and regression harness). No push or PR.

The final full browser run passed all Phase 2b scenarios and the complete
DE/EN × mobile/desktop × five-theme matrix, including dedication opacity,
reduced-motion mask visibility, mode-button visibility and differing settled
capability track/knob styles. Finite CSS transitions are finished before comparing
styles, consistently with screenshot settlement. Intentional sign-out/deletion
now suspends account refresh and disconnects the account socket until completion;
failed requests restore it. This prevents revocation fanout from replacing the
signed-out page with an expired-session redirect. Normal revocation still expires
other devices. Browser fixtures cleaned up their own database/mail/server.

The retained musical smoke also passed against that isolated built server after
updating its selectors for the existing language buttons, password-toggle form,
and verification/recovery result pages: actual AudioContext playback, staff view,
PDF export (121435 bytes), recovery and theme changes; zero browser errors or
forbidden requests. Evidence: `.review-evidence/browser/shots/index.html` and
`.review-evidence/foundation/`. These are ignored local fixture artifacts.

Additional implementation commits: `b29de61` (localized verification/elapsed
cleanup), `48ea7ba` (verification route variants), `ac27aa5` (intentional sign-out
race and settled style assertions). Authoritative playback remains pending as
stated above; none of these results measures inter-device rehearsal timing.

Final Part A checks: `npm run build` passed; `npm run check:secrets` passed
(positive control detected, browser artifacts clean, no public source maps);
`npm run test:browser` passed; `npm run typecheck` and `npm test` passed (8 tests);
`npm run test:integration` passed (23/23); `npm run db:generate` reported no schema
changes. Foundation browser smoke additionally passed as described above.

### Phase 3a — authoritative playback server and pure controller (2026-11-03)

One session per ensemble; every current member controls it, independent of
editPieces. No conductor lock. Saved piece configuration is never written by
playback. Mute/solo/view/zoom stay local. Client/audio/UI migration is Phase 3b;
`src/sync.ts` remains because `main.ts` still imports its legacy state seam.

Shared contracts: `src/rehearsal/contract.ts` exports strict Zod command,
envelope, canonical-state, acknowledgement and join schemas and inferred types.
Commands are nested under `command` with a `type` discriminator. Envelope also
contains ensembleId, UUID commandId, baseRevision and clientSentAt (estimated
server epoch milliseconds). All canonical fields are present on every update.
BPM matches the current UI; internally it scales the tempo map by bpm/baseBpm.
Selecting a piece resets transient BPM to the source tempo, transpose to zero,
loop and pre-roll preferences. Saved defaults remain an independent library API.

| Commands | Requires current revision | Reason |
| --- | --- | --- |
| play, seek | yes | Depend on selected piece, position and transport state |
| pause | no | Idempotent pause at effective position |
| setLoop, playStartingTones | yes | Depend on selected piece/range |
| selectPiece | no | Absolute piece and version selection |
| stop | no | Unconditional stop and rewind |
| setTempo, setTransposition | no | Absolute transient setting bound to pieceId/versionNo |
| setMetronome, setCountIn, setStartingTones | no | Absolute preference |

A future baseRevision is always stale. Checked commands require equality;
unchecked commands accept older revisions. Expiry is 5 seconds (also rejects
client timestamps over 5 seconds ahead). Accepted command IDs are remembered per
ensemble for 10 minutes, capped at 1000, in process memory; restart clears that
window, so reconnect MUST discard pending commands. Per-socket token bucket:
20 command burst, refill 5/second, including invalid inputs. The same limit
also applies per user; ensembles allow burst 100/refill 50 per second.
Join/snapshot have separate socket/user (20/5) and ensemble (100/50) buckets.
At most four requests per socket are in flight, ten sockets per user, and
32 mutations per ensemble are queued; excess requests return rate_limited.

Authenticated `/rehearsal` events (callback acknowledgements):
- `rehearsal:join {ensembleId}` and `rehearsal:snapshot {ensembleId}` return
  `{state}` or `{code}` and subscribe to `rehearsal:<ensembleId>`.
- `rehearsal:command <Envelope>` returns `{commandId,status,revision? ,code?}`.
  Accepted state commits to rehearsal_sessions before `playback:state` fanout to
  every room subscriber, including the sender. Concurrent commands share one
  per-ensemble promise queue; deletion and end transitions use it too. Snapshots
  bypass this queue and read the last committed in-memory state.
- `clock:ping` takes just a callback, returning `{serverTime}` from
  performance.timeOrigin + performance.now().

Membership is cached on each socket, invalidated by existing membership events;
removal leaves the playback room and rejects subsequent controls. Auth revocation
continues to disconnect sockets immediately through the existing hook. Session
expiry is checked locally for every control; the existing batched session poll
remains a fallback. A command does not reload the auth session from Postgres.
Piece/version tenant ownership is checked server-side. Score timing is extracted
at import/version creation and stored in score_versions.timing (JSONB). Existing
versions lazily backfill via the bounded two-worker/eight-waiter validation pool
with a 30-second timeout; validation_busy falls back to paused during recovery,
and returns retryable unavailable for commands. New selectPiece is a lookup. Derived timing promises are cached by content hash
(maximum 100). MusicXML uses the existing parser in worker-local JSDOM; the
controller/timeline/clock modules themselves have no DOM or Node dependencies.

**Timing:** PLAYBACK_LEAD_MS defaults to 400 (configurable 0–5000). New anchors
and settings take effect at server now + lead. Clients retain their previous
schedule up to that instant; a snapshot describes the schedule from its anchor
onward, not historical playback before that anchor. Tempo changes sample position
at the effective time and re-anchor there, avoiding a lead-time jump. Score tempo
marks use the shared quarter-unit metronome conversion extracted from the parser;
MusicXML sound-tempo changes are preserved too. The existing AudioEngine uses
constant-BPM math, not a tempo-map converter: 3b must use this timeline in its
scheduler. No existing tempo-map converter was available to reuse.

Loop wrap integrates score time within [startBeat,endBeat). Play optionally
schedules 2 seconds of starting tones followed by configured count-in bars at the
anchor's local tempo/time signature. Active count-in/starting-tone timestamps
survive metronome/count-in/starting-tone preference and transposition changes.
Tempo changes preserve pre-roll and scale remaining count-in at the effective
instant to the new tempo. Play/pause/stop/seek/selectPiece/setLoop explicitly
reset pre-roll timestamps; preference fields remain explicit. Standalone
playStartingTones pauses and schedules tones without starting music. End timers
persist a stopped state at the final beat with a new revision and broadcast;
stop rewinds to zero. Piece deletion clears the selection and stops with a new
revision. All protocol times are numeric epoch-ms instants per this contract;
DB row timestamps retain timestamptz and logs UTC (the numeric transport is the
explicit exception to the engineering rule preferring ISO text boundaries).

**Restart:** startup gates joins/commands on recovery. Persisted playing or
countingIn sessions become paused at positionAt(state, recovery time), with
revision bumped and active pre-roll/end timestamps cleared. No auto-resume.
Nonmoving states retain their revision. Recovery isolates every row: missing or
invalid timing pauses at its persisted beat with cleared pre-roll/end timestamps;
unparseable states reset to initial state at persisted revision + 1. Logs preserve
a redacted diagnostic JSON copy. A failed row cannot reject all healthy joins. Snapshot after reconnect is the durable truth; broadcasts are not a
durable event log, and a crash between commit and fanout is repaired by snapshot.

**Phase 3b must wire:**
- Implement RehearsalTransport (snapshot, command, subscribe, ping) using these
  events, fresh authenticated connections per account, UUIDs and latest revisions.
  Await join/snapshot before enabling controls; drop disconnected buffered commands.
- `estimateClock(samples)` needs at least 8 valid {t0,tServer,t1} samples; it uses
  the lowest RTT quartile (minimum 3), returns offsetMs, uncertaintyMs, sampleCount
  or null. Offset is server minus client. Refresh periodically and on wake;
  keep shared controls disabled if unavailable or uncertainty exceeds 100 ms.
  Asymmetry cannot be measured away: uncertainty conservatively covers RTT half
  plus observed scatter; do not promise sample accuracy across output devices.
- `timingFromScore`, `secondsAt`, `beatAt`, `positionAt(state,serverTime,timing)`
  are the musical timeline. `apply(state,envelope,{now,leadTimeMs,pieceTiming,
  userId})` is the deterministic controller, returning complete state or {code}.
  Use `lateJoin(state,now,timing,offsetMs)` for beat, localTime and remaining
  pre-roll timestamps; skip expired pre-roll. `restartPaused` is server recovery.
- Map canonical piece/version, BPM, transpose, loop, metronome and pre-roll
  preferences into the existing UI. Replace legacy sync and transport imports
  only after the controller/audio wiring compiles. Fetch the selected immutable
  version, schedule at accepted anchors, apply output-latency compensation, and
  preserve the previous audio schedule until a future effective anchor.
- Wire actual tempo-map note/metronome scheduling, starting-tone pitches from the
  selected score, AudioContext resume, uncertainty handling, offline/sleep recovery,
  ensemble/account switching, local mute/solo and error feedback.
- Browser tests with multiple contexts must measure sync tolerance, suspended
  audio, sleep/reconnect and account isolation; 3a makes no browser timing claim.

**Scaling beyond one server (not implemented):** sticky sessions for transport,
Socket.IO fanout adapter, and per-ensemble ownership/serialization across replicas.
Shared dedupe and restart/recovery ownership must move with that serialization;
adding an adapter alone does not serialize writes or make timers single-owner.

Validation results will be recorded after the sequential full-check run. The
first combined run exposed fixed-port collision and concurrent dist rebuilds;
the integration harness now allocates its app port and can filter scenarios via
AICAP_TEST_PATTERN. New socket fixtures force fresh managers to isolate cookies.
Targeted real Postgres/socket and real process-restart checks passed. No push.

Phase 3a final verification: `npm run typecheck` passed; `npm test` passed
(27 tests), also under TZ=America/New_York; `npm run build` passed;
`npm run test:integration` passed (24/24 scenarios with disposable real Postgres,
real sessions, three socket clients and an actual server-process restart).
A targeted rerun after optimizing timing-cache body reads passed, including
MusicXML parsing in the worker. `npm run check:secrets` passed (positive control
and clean browser artifacts); `npm run test:browser` passed all existing Phase 2b
flows and the full theme/language/device/capability matrix; `npm run db:generate`
reported no schema changes. `git diff --check` passed. No client scheduled-audio
or inter-device timing claims: those remain the explicit Phase 3b work above.
All changes committed on production-v1; no push, PR or external provisioning.

### Phase 3b — review remediation and client seams (2026-11-03, partial)

**This is not the completed Phase 3b player migration.** Part A is implemented;
Part B has independently tested transport/clock/scheduling seams, with the player
integration and measured multi-client acceptance still open. `main.ts`,
`audioEngine.ts` and legacy `sync.ts` have not been switched to these seams.
No push, production access, real mail or paid-provider calls.

Part A:
- A-B1: changing auth mode clears verification/token state; verification offers
  password recovery. Built-start Playwright victim scenario resets an unknown
  attacker password and signs in with the recovered password. Existing real-auth
  reset coverage verifies email ownership and session revocation.
- A-S1: process-global and per-user admission before bodyLimit/score body reads;
  defaults 4/1 (`SCORE_UPLOAD_GLOBAL_MAX`, `SCORE_UPLOAD_USER_MAX`). Immediate
  503/429 with Retry-After: 2; slots held through validation/persistence and
  released in finally. Real streaming requests cover both limits and release.
- A-S2: invalid percent encoding in score-title headers returns 422 invalid_text.
- A-S3: separate verification/reset recipient intervals (60 s), rolling 24-hour
  recipient ceiling 100/kind, requester-IP share 5/kind/recipient. Suppressed
  attempts do not consume or extend budgets. Sanitized suppression logging and
  visible resend seconds; generic public responses remain. Internal duplicate
  signup recovery inherits the originating requester through async context.
  HTTP regression covers three-request attack and a different requester's
  recovery after an attacker's share is exhausted.
- A-S4: reject NUL/non-well-formed strings and object keys before JSONB, including
  native-score worker parsing and decoded headers. Added ES2024.String types for
  isWellFormed, already supported by the required Node 22 runtime.
- A-S5: non-queuing in-flight email/email+IP guards span password evaluation and
  failure accounting. 80 concurrent wrong passwords yield at most 10 evaluations;
  distributed legitimate recovery remains available. Like Phase 3a queues, these
  guards assume one application process; replicas require shared admission.
- A-S6: SVG-namespace element/attribute allowlists from actual Verovio 6.3 output;
  only internal use references, known renderer CSS and embedded notation-font
  declarations. Arbitrary styles, namespaces, animation, DOCTYPE/entities and
  CSS-escaped URLs are excluded. 18 malicious payloads plus entity case pass;
  every sample page's DOM is preserved exactly after equivalent import. Built
  browser audio/staff/PDF smoke passed, exported PDF 121434 bytes, no page errors.
- A-N1: copy invite capabilities before preserving existing grants on refresh;
  same manager request retries successfully without another send.
- A-N2: socket metadata compares revision/version; deletion tombstones reject
  stale resurrection; fetched event metadata is checked again after await.
- A-N3: creation/acceptance emit membership notifications after commit. Account
  sockets serialize room refreshes and join additions/leave removals before
  notifying the client. Real socket regression covers a newly created room,
  immediate library fanout and membership removal.
- A-N4: one existing-signup recovery branch; early auth/permission errors return
  readable JSON without Connection: close. Rejected bodies are discarded as
  bounded streaming chunks (2 s / score-size bound), not retained. This fixes
  the adapter's delayed cleanup closing a reused HTTP/1 connection; the original
  large upload/idempotent retry scenario passes again.

Part B delivered seams (not yet installed in main):
- `src/rehearsal/socket-transport.ts`: SocketPlaybackTransport implements the 3a
  canonical RehearsalTransport, not the old patch-based PlaybackTransport.
  Authenticated socket supplied by its owner; volatile emissions, disconnect
  rejection, bounded acknowledgements, snapshot application awaited before
  readiness, latest revision command construction, stale-triggered snapshot,
  notice/readiness callbacks and disposal. Unit tests use a fake socket.
- `src/rehearsal/client-clock.ts`: eight-ping estimateClock rounds, 30-second
  refresh, visible/online/sleep triggers, explicit reconnect/resume refresh,
  <=100 ms uncertainty gate and diagnostics. Monotonic performance epoch maps
  accepted server times to output timestamps; latency fallback is tested.
- `src/rehearsal/schedule.ts`: pure future/late/effective-time/pre-roll decisions
  using positionAt/lateJoin and score tempo integration. Unit regressions cover
  past offset, expired pre-roll and effective-time tempo continuity.

**Measured synchronization tolerance:** not measured. No two-client scheduled
AudioContext starts were tested; mean/max over 10 runs are unavailable. No timing
claim follows from the pure-function tests or the single-client musical smoke.

**Drift correction approach (still to implement):** retain the old audio schedule
until the canonical effective instant, then compare expected musical score time
(positionAt integrated through secondsAt) against actual audible output once per
second. Correct sustained errors over 30 ms by scheduling a replacement at a
future anchor, with a short gain ramp/crossfade where the preserved AudioEngine
boundary permits. Do not repeatedly hard-retrigger sustained notes for clock
estimate scatter. Measure this with real output timestamps before selecting the
final correction/crossfade policy.

**Remaining required work:** B1 adapter/UI installation and localized notices;
B2 clock/readiness gating wired to the actual account/ensemble socket lifecycle;
B3 actual AudioEngine scheduling of notes/metronome against the full tempo map,
starting-tone pitches, future pause/stop/seek and drift recovery; B4 resume banner
and recalibration/rejoin; B5 all Together-mode controls, immutable selected score
versions, arriving/arriveAt/arriveDirectly and stale-device-place suppression;
B6 remove Firestore sync only after replacement is installed; B7 real multi-client
browser scenarios (a–g), >=10-run tolerance measurements and full acceptance.
Mute/solo/view/zoom must remain local. Existing single-client smoke covers musical
preservation, not completion of B7.

Timing decisions preserve 3a's explicit numeric epoch-ms transport exception;
beats/durations are not calendar instants. DB timestamp types stay timestamptz.
UTC logs and rolling elapsed-time mail windows introduce no calendar-day logic.

Validation for this partial handoff: `npm run typecheck` passed; `npm test`
passed 34 tests (also `TZ=America/New_York npm test`); `npm run build` passed
through the built-browser/secret harnesses; `npm run test:integration` passed
33/33 scenarios, plus the subsequently added five-account global-upload scenario
passed targeted. `npm run check:secrets` passed its positive control and clean
build. `npm run test:browser` passed the complete Phase 2b functional and
five-theme/language/viewport/capability matrix. The final built server also passed
`scripts/browser-recovery.mjs`, explicitly waiting for the password-proof form
before requesting reset. `BROWSER_SCRIPT=scripts/browser-smoke.mjs npm run
test:browser` passed audio, staff, PDF and reset/sign-in smoke. `npm run
db:generate` reported no schema changes; `git diff --check` passed. Logs and
screenshots are untracked under `.review-evidence/`. Earlier failing evidence is
retained alongside the passing runs. The existing integration fixture now ages
only the mail interval record before testing a second legitimate recovery;
new attack tests exercise the interval without that adjustment.


### Phase 3c — synchronized protocol review remediation (2026-11-03)

Server/controller and Phase 3b seams only; player UI and audio remain unwired.
This entry supersedes earlier Phase 3a behavior where it differs.

Additional command semantics (for Phase 3d):

| Case | Revision / behavior |
| --- | --- |
| play while playing/countingIn, no fromBeat | Accepted original state/revision; no retrigger |
| play with fromBeat while moving | Seek without pre-roll; requires pieceId/versionNo |
| seek, setLoop, setTempo, setTransposition | Require selected pieceId/versionNo; mismatch is stale |
| pause | Unchecked; accepts older revision; repeated paused state is an accepted no-op |
| play at/after end, loop off | Restarts at beat zero |
| seek at/beyond end | Clamps to totalBeats, status stopped |
| restart past natural end | Stopped at totalBeats; otherwise paused, including countingIn |
| enable loop outside [startBeat,endBeat) | Anchor snaps to startBeat |
| seek outside enabled loop | Explicitly disables loop |
| duplicate accepted commandId | Returns original acknowledgement, no broadcast/revision |
| stale | Includes current revision and full state; client applies without another snapshot |

Loop anchors represent the true wrapped position. Base BPM is tempos[0].bpm,
without rounding (round only for display); the whole tempo map scales against it.
Canonical countingIn can remain after countInUntil: consumers MUST use lateJoin
(or playbackSchedule) to obtain current effective status and skip elapsed pre-roll.

Errors: invalid = malformed input; not_found = missing/foreign piece/version;
forbidden = membership/room denial; stale = revision/selection mismatch;
expired = command clock window; session_expired = socket login expired;
rate_limited = admission/queue limit; unavailable = retryable DB/worker busy,
timeout, ownership or persistence conflict. Clients retry unavailable with bounded
100/200/400 ms backoff using the SAME envelope/commandId, never reconnect replay.
Join/snapshot acknowledgements have exported snapshotAckSchema/joinAckSchema.
Session polling refreshes expiresAt when the auth session is extended.

After PLAYBACK_IDLE_MS (default 600000) without room sockets, pause at the current
position, including wrapped loops; evict the ensemble dedupe map. End timers retry
failed commits with capped exponential backoff (250 ms to 30 s); clients also use
lateJoin to stop locally while persistence is unavailable.

Scaling: one active rehearsal owner holds a dedicated PostgreSQL session advisory
lock (714083,1) across recovery, controls and timers; overlapping deployments fail
rehearsal requests with unavailable. This is fail-closed ownership, not replica
routing. Revision upserts only accept strictly newer revisions; conflict reloads
state and returns unavailable. Replicas still require owner routing and shared
admission/fanout. New command writes check at least min(50 ms, configured lead)
remains after the write before committing; an exhausted lead rolls back and
returns unavailable. Durable commit-to-fanout failures recover via snapshots.
Timing and piece/version metadata caches are bounded to 100 entries each.

Phase 3d must bind controls to the immutable selected piece/version, coalesce
seek gestures (one latest target, avoid emitting per pointer move), respect
rate_limited backoff, disable readiness on session_expired, handle idle pause,
and retain the prior audio schedule through effective time. UI, audio, drift
correction and measured multi-device timing remain the next phase.


Pre-roll settings preserve the entire musical anchor. Canonical `effectiveAt`
records when the changed settings take effect independently of that anchor;
playbackSchedule consumes it. The field is optional only when reading legacy
persisted snapshots (fallback: anchor.serverTime); new controller states emit it.

Phase 3c verification (local production-v1; no push):
- `npm run typecheck`: passed.
- `npm test`: 67 tests passed, including deterministic injected-clock/fake-timer
  recovery, 5000-snapshot isolation (<50 ms legitimate command), per-user budget,
  ownership exclusion/loss, idle loop pause, end retry, timer/command ordering,
  stale selection, revocation race, worker backfill/error mapping, exhausted
  persistence lead and transaction-client release regressions.
- `npm run test:integration`: 34 tests passed. Real Socket.IO lifecycle compares
  full broadcasts, saved piece settings/revision before/after, foreign existing
  piece rejection, commands without join, original duplicate acknowledgements,
  unchecked pause, natural end, deletion and restart behavior.
- `npm run build`: passed (also rebuilt by the final secret scan).
- `npm run check:secrets`: passed; positive control detected and built client
  artifacts clean, no public source maps.
- `npm run test:browser`: passed in isolation (Phase 2b scenarios/theme matrix).
  An earlier concurrent-build run timed out on landing-page Create account;
  the isolated rerun passed without UI changes.
- `npm run db:generate`: no schema changes after migration 0004; no drift.

No player UI/audio integration or measured inter-device synchronization is
claimed. Phase 3d remains as described above; no protocol review item is deferred.
The ownership connection reserves one database-pool slot; keep enough remaining
pool capacity for ordinary requests and command transactions.

### Phase 3d — player integration (2026-11-03)

Together now owns an authenticated `PlayerSession` (SocketPlaybackTransport plus
PlaybackClock) for the active account/ensemble. Solo constructs no rehearsal
socket and keeps the existing local transport. Mode/title/badge choices retain
the prototype's reload/arrival behavior; the obsolete conductor menu is hidden
because every current member controls the canonical session. Leaving the mode,
ensemble, page or account disposes the socket/clock; membership/session expiry
uses the existing removal/expiry flows.

Piece selection sends the selected immutable version; play/pause/stop, all seek
entry points, loop ranges/whole-piece loops, tempo, transposition, metronome,
count-in bars and starting-tone preference send typed commands. Piece-dependent
commands bind to the accepted pieceId/versionNo. Seek gestures retain one latest
target, emit at most once per 150 ms and flush on pointer release. No command is
sent while unready/offline. Only canonical state mutates shared transport UI;
local voices, duck volume, zoom and view stay local. Stale applies the included
state and a pencil notice; unavailable retries with the same command envelope at
100/200/400 ms, rate_limited drops with a notice. Temporarily unavailable joins
also retry with bounded backoff. New copy uses the existing bilingual dictionary.

Canonical application fetches the exact version body and uses `lateJoin`,
`positionAt` and `playbackSchedule`. A separate AudioEngine scheduling entry
point is necessary because the preserved Solo scheduler assumes constant BPM.
It reuses existing note/voice factories, mixer, output and fade cancellation;
notes and clicks integrate the shared tempo map, including loop wraps. Old voices
remain until effectiveAt, independently of the musical anchor. Future pause,
stop, seek and tempo/key replacements cancel at the mapped AudioContext instant.
Late states start from the current musical offset; expired pre-roll is skipped.
Count-in uses the measure's denominator; starting tones use score pitches within
the canonical two-second window. Solo's scheduling path remains intact.

Clock readiness gates controls until the post-connect snapshot has applied.
Calibration starts on connection, spaces volatile pings and retries an unusable
round (a real browser run exposed join/ping contention). Existing clock triggers
cover visible/online/reconnect and detected sleep; a usable recalibration relays
the schedule. The existing sound banner has bilingual Together copy, resumes on
a gesture, recalibrates and snapshots before relaying at the current position.
Together arrival hides the repertoire until canonical selection is loaded (8 s
maximum fallback), restores only local settings for the matching piece and never
calls Solo's comeBackToPlace to publish a stored transport position.

Drift checks every two seconds compare actual audible AudioContext position with
positionAt in integrated musical milliseconds. Loop comparisons use the shortest
wrapped distance. Errors over 30 ms schedule a replacement 80 ms ahead, preferring
the next beat if it is 80–300 ms away; the existing 10 ms fade bounds discontinuity.
`?debug=sync` exposes offset, uncertainty, drift and revision plus the read-only
`window.__lightscoreSync` diagnostic getter (also available in test builds), with
last scheduled server/audio start times and current position. This uses the
existing explicit numeric epoch-ms protocol exception; no calendar/DB semantics
or server protocol were redesigned.

Minimal measured browser result: two separate authenticated accounts/contexts in
one ensemble, A selects and plays while B is already Together, both scheduled
starts differ by **0 ms in server time**; A's pause reaches B; B's subsequent Solo
play emits no rehearsal command. This is one scheduled-start measurement, not an
acoustic/device-output or ten-run tolerance claim. The default browser harness
now includes `scripts/browser-sync.mjs`; fake-output-clock unit regressions cover
actual engine scheduling, tempo-map offsets, future cancellation, late pre-roll,
loop refill and drift, alongside command bindings and seek coalescing.

Validation (all passed): `npm run typecheck`; `npm test` (74 tests, also
under TZ=America/New_York); `npm run build`; `npm run test:integration` (34/34);
`npm run check:secrets` (sentinel positive control and clean browser artifacts);
`npm run test:browser` (existing full design/capability matrix and the new
Together scenario); `npm run db:generate` (no schema changes); `git diff --check`.
The final focused `BROWSER_SCRIPT=scripts/browser-sync.mjs npm run test:browser`
rerun again measured 0 ms with both AudioContexts running. Solo musical smoke via
`BROWSER_SCRIPT=scripts/browser-smoke.mjs npm run test:browser` passed real audio,
staff rendering, PDF export (121432 bytes), reset/sign-in and player themes,
with zero browser errors or Firebase requests. Evidence and preserved initial
readiness-failure logs are ignored under `.review-evidence/phase3d-*.log`; the
measured timestamps are in `.review-evidence/browser/sync-starts.json`.
No schema, deployment or external infrastructure changes.

Phase 3e still owns removal of the retained legacy sync code/imports and the full
multi-client timing browser suite: repeated tolerance measurements, mobile sleep,
offline/reconnect races, autoplay suspension, pre-roll, live tempo/key/loop edits,
account isolation and physical output uncertainty. No push, PR, external
provisioning, paid AI or real email was performed.

### Phase 3e-1 — review remediation (2026-11-04)

- Password admission now exclusively reserves email/IP pairs. Only IPs with recent
  failures share the email's four-attempt concurrency cap; fresh IPs retain access.
  Concurrent real-auth attacker/victim regression passes, alongside 80-guess admission.
- Rehearsal acquisition/recovery retries with capped exponential backoff. Owner
  connections use TCP keepalive and a 5-second bounded heartbeat. Connection loss
  stops timers, destroys the owner connection, clears cached states, reacquires
  and repeats recovery. `/readyz` requires rehearsal ownership and recovery.
  Join/command readiness waits are bounded to 500 ms, then return unavailable.
  Deployment requires direct PostgreSQL or PgBouncer session pooling: transaction
  pooling breaks session advisory locks and is unsupported. This remains one active
  owner, not replica routing; the inactive instance must not receive rehearsal traffic.
- Recovery commits paused/stopped state in memory before attempting persistence;
  failed persistence retains that recovered state for retry and keeps readiness off.
  Unit takeover/recovery probes and real pg_terminate_backend recovery pass.
- Client join retries continue with capped backoff on unavailable/timeouts, and join
  awaits usable calibration. Partial rounds accept four good samples; failed rounds
  retain the previous estimate. Reconnect invalidates older rounds. Each listener is
  isolated; invalid broadcasts request a snapshot. Wall/performance delta mismatch
  over two seconds invalidates calibration before commands or scheduling.
- Clamp base/tempo marks to 1–1000; validate every persisted/broadcast state and
  reject invalid derived states. PostgreSQL class 22 errors map to invalid; version
  numbers cannot exceed int4. Pausing stopped remains stopped, and explicit play
  outside a paused loop disables the loop.
- Audio timestamps require a running context and a stamp within one second. Each
  scheduling batch maps once and adds relative audio offsets (already in 3d).
  Device-local output latency correction (−500…500 ms) is in the existing settings
  menu, EN/DE; positive means schedule earlier. Drift correction at 30 ms requires
  uncertainty under 15 ms. True pre-roll origins, status, endsAt and loop data are
  exposed by playbackSchedule; preference changes preserve the count-in grid.
- Exact-version `?timing=1` metadata carries stored timing and content hash. The
  client logs a derivation mismatch and uses server timing for all shared sync
  math. Timing derivation version 2 triggers bounded lazy recomputation on change.
- Rehearsal sockets already force WebSocket in 3d: volatile join/snapshot/ping
  frames therefore cannot be dropped during the polling-to-WebSocket upgrade.
  Acknowledgements still time out and joins retry. Server-initiated disconnects
  do not reconnect blindly; socket-cap closure has its own notice, while revoked
  sessions use the existing sign-in flow.
- Shared secure-random UUID fallback covers client call sites on insecure dev LANs.
  Ensemble admission follows authorization; rejected upload slots drain bodies.
  Pings are throttled per socket; idle committed snapshots are evicted; session
  expiry polling builds a token lookup once instead of scanning per socket.
- Mail recipient limits now count individual sends in a rolling 24-hour window;
  requester shares are two per kind/recipient/day. Twenty IPs cannot consume the
  100-send recipient ceiling. Old fixed-window usage is conservatively retained
  until it expires. Remaining risk: sufficiently many requester IPs can exhaust
  the ceiling or compete for the one-minute interval; this is mitigation, not
  proof of requester identity. Account creation/recovery replies stay generic.
- SVG attribute CSS rejects every backslash or comment opener, preventing parser
  differentials including invalid Unicode escapes; renderer preservation passes.
- The generated largest upload fixture is 20 MiB including timing extraction. A
  real upload probe asserts completion under the worker's 30-second deadline;
  the stable run measured about 2.8 seconds, with <50 ms health response latency.

Verification results follow. Initial red probes,
failed expectation updates and invalidated concurrent-build runs remain under
ignored `.review-evidence/phase3e-*`; no failed evidence was concealed or deleted.

The ownership audit additionally reproduced an in-flight end callback rearming
its retry after lock loss. Timer scheduling/retries and idle admission now require
current ownership; its deterministic regression distinguishes the single ownership
retry timer from an unwanted second rehearsal timer.

Verification on the implementation:
- `npm run typecheck`: passed; `npm test`: 93 tests passed.
- `npm run build`: passed; `npm run check:secrets`: positive control and clean
  client artifacts passed. No public source maps.
- `npm run test:integration`: 38/38 passed, including all 30 correct-password
  attempts under 12 concurrent looping attacker IPs, real owner termination,
  timing backfill/versioning, rolling mail windows and 20 MiB upload with timing
  in 2682 ms (maximum health probe latency 40.1 ms). Final ownership/timer follow-up
  checks are also recorded in `.review-evidence/phase3e-ownership-final.log`.
- `BROWSER_SCRIPT=scripts/browser-sync.mjs npm run test:browser`: passed the
  two-account Together scenario, 0 ms scheduled server-start difference, pause,
  Solo isolation, and device-local latency persistence through reload. The added
  reload probe explicitly re-enters Together because this harness deliberately
  clears the saved arrival state on each page load.
- `BROWSER_SCRIPT=scripts/browser-smoke.mjs npm run test:browser`: passed audio,
  staff rendering, PDF export (121435 bytes), reset/sign-in, zero browser errors
  and no forbidden external calls.
- `npm run db:generate`: no schema changes/no drift; `git diff --check`: passed.

These are scheduled-clock and local browser checks, not an acoustic measurement
of Bluetooth/Safari hardware output. The existing wider Phase 3e multi-device
acceptance work remains outside this review-fix task.

- Final complete `npm run test:browser`: passed both the full Phase 2b
  theme/language/capability matrix and the extended Phase 3d two-account scenario.
  The final Together scheduled-start difference was 0 ms; latency persistence
  remained local to the browser/device. No page errors.
- Final timing and ownership follow-ups pass against disposable PostgreSQL;
  timing-version backfill is checked through both metadata and rehearsal selection.

All listed review findings and requested nice-to-haves are addressed. Changes
remain local on production-v1; no push, PR, deployment, provisioning, paid AI or
real email. The wider Phase 3e work noted above remains separate.

The final sleep guard also gates periodic AudioEngine refill directly on clock
usability; controls and explicit scheduling were already gated. A regression
asserts no new voices are queued until calibration becomes usable. After this
last change, typecheck, all 93 unit tests, secret scanning, Together/latency
browser checks and musical smoke were rerun. Real PostgreSQL timing selection
also forces a stale derivation version and verifies the lazy update is persisted.

### Phase 3e-2 — legacy retirement and browser acceptance (2026-11-04)

Work is confined to the production fork, branch `production-v1`. Removed the
Firestore playback listener/patch paths, per-device clock-ping implementation,
legacy channel selection and unreferenced storage stubs. `src/sync.ts` now only
contains the Solo compatibility model/helpers. `src/firebase.ts` and the remaining
`legacy-store.ts` exports are still referenced by retained scan/feedback code;
those services are not migrated here. PIN-gate and ensemble code hashing were
already absent. `rules-test/`, `functions/` and `omr-service/` remain untouched.
The client grep audit is `.review-evidence/phase3e2-legacy-audit.txt`.

`npm run test:browser:sync` uses a built `start` server, disposable PostgreSQL and
Mailpit, three real accounts and a 20-bar score with tempo marks at bars 1 and 5.
B/C have no capabilities. The default browser command includes the acceptance
suite in addition to the existing design and sync checks. Server restart uses a
local harness IPC request, not a test HTTP endpoint. The diagnostic hook remains
read-only and adds cloned canonical state/timing, scheduled count-in clicks and
AudioEngine drift. No command injection API is exposed to browser code.

A deterministic regression found that a simultaneous wall/performance clock jump
left calibration usable until the next timer. The clock now invalidates on a
monotonic gap over three seconds as well as mismatched clock deltas, before a
control or scheduling operation can use it. The new unit regression failed before
the fix and passes after it (`303d229`).

Browser actions use bounded condition waits (15 s default, 20 s calibration),
server-time boundary waits and revision convergence. Mail/server startup poll
bounded external readiness. There are no scenario retries or fixed settling
sleeps. Initial harness failures (invitation key, responsive control selectors,
and checking the library's connecting status while the player was open) remain
in `.review-evidence/phase3e2-browser-*.log`; they are not application defects.

Final scenario measurements and complete validation results follow below.

The bounded offline browser probe also found that Chromium retained the existing
WebSocket on `context.setOffline(true)` and the client remained ready. Failure
state is preserved in `.review-evidence/phase3e2-offline-red.json`. PlayerSession
now explicitly disconnects on the browser offline event and reconnects on online,
with listener cleanup at disposal and a navigator guard on sends. Reconnect still
requires calibration and an authorized snapshot; no offline commands are queued.

A final reference audit also removed `src/playback-transport.ts` (its local pub/sub
had no subscribers), its obsolete leader-clear patch and the unused Firebase
configuration flag. No Firebase SDK dependency remains in the client.

The shared-tablet browser regression caught two logout leftovers: the account's
ensemble key survived, and `pagehide` recreated its deleted playback-place key
while navigating away. `noteSeen`/`notePlace` now stop writing once account exit
begins; successful signout also removes the account's ensemble key. The captured
failure is `.review-evidence/phase3e2-logout-red.json`. B then signs in in the same
context; assertions check A's room closed, its diagnostic owner disappeared,
A-keyed storage is gone, B's identity is active, and A's private ensemble is absent.

Inspection of the first fully passing browser evidence found a musical boundary
bug: a one-bar 4/4 count-in scheduled only three clicks. Repeated subtraction of
fractional pulse lengths at epoch-ms magnitude rounded the downbeat just below
its lower bound. The engine now generates click times by integer pulse index from
the canonical end, with a 0.001 ms numeric boundary tolerance. A unit regression
checks four clicks, the exact downbeat and late-join clipping; browser scenario f
now requires all four scheduled clicks before checking their shared grid and
survival through a metronome toggle.

Measured focused acceptance after all four fixes (headless Chromium, this local
machine; **scheduled starts, not acoustic output**):

| Scenario | Result / measured evidence |
| --- | --- |
| a — three-client start, 10 runs | mean/p95/max pairwise scheduled-start difference **0/0/0 ms** (limit 50 ms); reported start uncertainties **3.01–3.12 ms** |
| b — ordinary member controls | pause, seek to bar 6 and tempo accepted; valid rename rejected **403**, stored title unchanged |
| c — concurrent controls | commands dispatched **0.10 ms** apart; identical complete state/revision on all three clients |
| d — late join | bar 6, after the tempo mark; AudioEngine position difference **9.80 ms**; no count-in clicks replayed |
| e — effective tempo change | sampled after effective time +1 s; position difference **1.21 ms** |
| f — count-in + starting tones | **4 clicks**, identical server-time grid; metronome toggle retains future clicks and pre-roll origins; position difference **7.84 ms** |
| g — loop bars 3–4 | actual positions sampled on both sides of **2 wraps**; pairwise differences **12.94 / 16.14 ms** |
| h — offline | connecting badge, disabled controls, **0 offline commands**; A's stop applied on reconnect; paused position difference **0 ms** |
| i — sleep/audio resume | suspension banner/tap, hidden→visible, wall-only and simultaneous wall/performance 10-minute jumps; **0 immediate sleep commands**; position differences **5.06 / 7.83 ms** |
| j — real server restart | connecting→paused, recovery beat matches the previous timeline at recovery time; paused position difference **0 ms**; play works afterward |
| k — revocation | C leaves Together, sees membership-removal explanation; **0 further commands** |
| l — shared device | A's room closes; A owner/global and account-keyed storage absent; B signs in, with no A-private ensemble |
| m — Solo isolation | B plays, seeks and changes tempo; **0 commands**, A's canonical state unchanged |
| n — natural end | all stop at beat **80**, position difference **0 ms**; fresh join sees stopped |

Position measurements compare each actual AudioEngine position with the shared
musical timeline at its sampled server time, then compare those score-time errors
between clients (maximum **16.14 ms** in this focused run). Each client must first
be within 25 ms of the canonical timeline; pairwise differences must be ≤50 ms.
Raw starts, uncertainties, clicks, positions and dispatch span are saved in
`.review-evidence/browser/sync-acceptance.json` (replaced by each successful run).
The 0 ms scheduled-start result means clients chose the same future instant; it
does not imply zero loudspeaker skew.

Limitations: no microphone/acoustic measurement, Safari/iOS device run, Bluetooth
output test or arbitrary network-asymmetry guarantee. Output hardware and room
acoustics still require device-local latency adjustment and physical validation.
Visibility/clock jumps use explicit browser overrides and AudioContext suspension;
they are deterministic lifecycle simulations, not an operating-system sleep test.
No scenario remains deferred in this suite. No scenario retry was needed.

Final complete `npm run test:browser` also passed the existing design/capability
matrix and the original two-account sync test, then all a–n acceptance scenarios.
The late-join scenario was strengthened to play an actual count-in/starting-tone
window before C joins; neither pre-roll is replayed. Final full-run measurements:

| Measurement | Result |
| --- | --- |
| 10 three-client scheduled starts, mean / p95 / max | **0 / 0 / 0 ms** |
| Reported uncertainties during those starts | **2.96–3.14 ms** |
| Late join in changed-tempo section, pairwise position | **5.72 ms** |
| Tempo change, after effective time +1 s | **10.25 ms** |
| Four-click count-in grid difference | **0 ms** |
| Loop, first / second wrap position difference | **4.26 / 2.46 ms** |
| Sleep recovery, wall-only / both-clock jump | **10.47 / 6.24 ms** |
| Maximum pairwise AudioEngine position difference across samples | **10.47 ms** |
| Concurrent-control dispatch separation | **0.10 ms** |

These are local headless Chromium schedule/position measurements with a 50 ms
acceptance ceiling, not acoustic-output measurements. The earlier focused table
above is retained as a separate run rather than silently replacing its values.

The final musical smoke initially exposed an old test assumption after password
reset: it tried to click the previously open sample without choosing the sample
library again. The new logout privacy behavior correctly clears that saved place.
The smoke now explicitly clicks “View samples” after reset/sign-in; its original
failure is retained in `.review-evidence/phase3e2-musical-smoke.log`. Playback,
notation and PDF export had already passed before that selector failure.

Final checks (all passed):

- `npm run typecheck`.
- `npm test`: **95/95**; also **95/95** with `TZ=America/New_York`.
- `npm run build`: built `start` artifacts through the browser harness and secret
  scanner; final positive-control builds passed.
- `npm run test:integration`: **38/38**, no skips, including real process recovery,
  auth/tenant boundaries and large-score timing extraction.
- `npm run test:browser:sync`: all **14 scenarios a–n** passed after the fixes.
- `npm run test:browser`: full design/language/device/capability matrix, existing
  two-account scenario and the strengthened three-account acceptance suite passed.
- `BROWSER_SCRIPT=scripts/browser-smoke.mjs npm run test:browser`: playback,
  staff, PDF (**121435 bytes**), reset/sign-in and player themes passed; zero
  browser errors and zero forbidden external requests.
- `npm run check:secrets`: positive control detected; client artifacts clean;
  no public source maps.
- `npm run db:generate`: no schema changes / no migration drift.
- `git diff --check`: passed. Retirement directories unchanged.

All work is committed locally on `production-v1`. No push, PR, deployment,
external provisioning, paid provider call or real email delivery was performed.

### Phase 3f — final synchronized-playback review remediation (2026-11-04)

Reviewed against production-v1 at f3b00dc, including the Phase 3e-2 fixes that
postdated the c0cae91 review. All changes are confined to this production fork.
Phase 3 is closed after the validation recorded below.

- B1: scheduler uses milliseconds relative to its effective anchor and carries
  the musical cursor explicitly through refills and loop wraps. Epoch rounding
  can no longer strand it immediately below the loop end. Regression covers
  80 seconds (at least five wraps), 77.7/113/133.3 BPM, 60–180 in steps of seven,
  and three loop lengths. The pre-fix failure is retained in
  `.review-evidence/phase3f-loop-red.log`.
- S1: Phase 3e-2 already fixed indexed count-in generation fully for ordinary
  one/two-bar count-ins. Added the complete integer 40–200 and fractional sweep,
  three meters, exact first-click boundary and actual oscillator accent checks.
  Browser count-in now runs at 90 BPM with four clicks.
- S2: drift compares live output-clock mapping with the original scheduling
  mapping. Visual light/compressor compensation cannot cause audio corrections.
  Tests cover perfect clocks over ten seconds with 0/25/80/150 ms offsets.
  Routine calibration also retains schedules whose mapping remains stable.
- S3: every AudioContext transition to running rebuilds shared playback from the
  current canonical instant, including ordinary taps away from the banner.
  Drift over one second bypasses the small-drift uncertainty threshold; unusable
  clocks still require calibration before any shared scheduling.
- S4: failed snapshot application keeps readiness false and leaves the revision
  unapplied. Rejoin retries the same revision with backoff, without a new command.
- N1: replacement clicks/tones start no earlier than the new effective instant;
  old pre-roll survives only until that boundary. Expired tones are skipped.
- N2: `/readyz` means DB/migration-ready HTTP and reports rehearsal ownership as
  a boolean. `/readyz/rehearsal` requires ownership/recovery. Railway admission
  should use `/readyz`; rehearsal ownership remains a separate monitoring probe.
  This supersedes the ownership-dependent readiness notes above. Deployment
  remains one process initially; replicas need owner-aware socket routing.
- N3: deleted-piece invalidations survive unavailable ownership and are drained
  on acquisition before snapshots are served.
- N4: actual ZodError instances/names map to `invalid`.
- N5: missing/nonpositive/nonfinite score metadata tempo falls back to 100 BPM;
  explicit valid tempo marks retain the clamp.
- N6: persisted pageshow recreates the disposed PlayerSession and rejoins.
- N7: clearing a selected loop explicitly sends `enabled:false`.
- N8: unavailable/rejected/failed loop commands restore the canonical preview.
- N9: suspended shared audio only offers “Tap to listen in” for moving sessions.
- N10: reconnect/recovery uses one join loop per socket epoch.
- N11: three consecutive heartbeat failures are required to discard ownership;
  successful probes reset the count. Queries are single-flight and failures stay
  logged. Connection error events still invalidate ownership immediately.
- N12: production `?debug=sync` is deliberately read-only, scoped to the signed-in
  device's own state; its scope and removal are documented in DEVELOPMENT.md.

The acceptance suite extends g to four wraps each at 113 and 77.7 BPM, checks an
80 ms output offset for ten seconds without a rebuild, rejoins with suspended
audio for five seconds before a tap elsewhere, and simulates persisted page
lifecycle recovery. Fractional custom tempo entry preserves tenths of a BPM.
All timestamp arithmetic remains typed epoch milliseconds or relative durations;
no schema or business/calendar-time behavior changed. UTC logging is preserved.

Known limitations: browser checks measure scheduled/score-time alignment, not
loudspeaker/acoustic output. Safari/iOS, Bluetooth and real OS sleep still need
physical validation. Network asymmetry cannot be eliminated by clock estimation.
The heartbeat policy tolerates stalls but can take roughly 15–17 seconds to detect
a silent owner failure. No new deployment, provisioning, push or PR is included.

Final validation (production fork, local disposable services):

- `npm run typecheck`: passed.
- `npm test`: 107/107; `TZ=America/New_York npm test`: 107/107.
- `npm run build`: passed, including fresh built-mode browser harness builds.
- `npm run test:integration`: 39/39, no skips, including standby HTTP readiness.
- `npm run check:secrets`: positive control detected, client artifacts clean,
  no public source maps.
- `npm run db:generate`: no schema changes / no migration drift.
- `npm run test:browser:sync`: all a–n plus offset stability and persisted
  page lifecycle recovery passed. Four wraps each at 113 and 77.7 BPM,
  90 BPM count-in oscillator frequencies 1500/1000/1000/1000 Hz, suspended
  join/tap-elsewhere recovery, 80 ms output offset without rescheduling for ten
  seconds. Focused run: ten scheduled starts mean/p95/max 0/0/0 ms; maximum
  pairwise score-time error 15.05 ms (50 ms acceptance ceiling).

The earlier extended-browser failures are retained in the Phase 3f logs and
`phase3f-loop-browser-*-red.json`: harness setup reset the loop position, then
exact bar seeking disabled a pointer-derived region whose start was slightly
above beat eight. Re-selecting after the tempo popover also failed to produce
a revision. The final scenario retains the playing loop and derives boundaries
from each accepted tempo anchor. No application retry masks these failures.

Final full `npm run test:browser` passed the entire design/language/device/
capability matrix, the original two-account rehearsal check, and the extended
three-account a–n suite plus offset and bfcache checks. Zero page errors. Ten
scheduled-start differences mean/p95/max **0/0/0 ms**; maximum pairwise score-time
error **11.13 ms**. Four wraps at both tempos, the accent, ten-second offset
stability, five-second suspended join and persisted session recreation all passed.
Raw final evidence is `.review-evidence/browser/sync-acceptance.json`; the
separate focused pass is `phase3f-focused-sync-green.json`. All results are local
Chromium scheduling/position measurements, not acoustic-output measurements.

`BROWSER_SCRIPT=scripts/browser-smoke.mjs npm run test:browser` also passed on a
fresh build: playback, staff, PDF export (121433 bytes), reset/sign-in and player
themes; zero browser errors and zero forbidden external requests. Final
`git diff --check` passed. Phase 3 synchronized playback is complete with the
hardware/operational limitations documented above. Every review item has its
own local commit; follow-up test/harness commits preserve the intermediate
failure evidence. All commits remain on `production-v1`; nothing was pushed.

### Phase 4a — private originals and durable transcription

Storage uses a server-only S3 adapter, private scoped random keys, a maximum
60-second signed GET, and ensemble/hash deduplication for ready originals.
`stored_objects.kind` separates indefinite originals from disposable derivatives.
A durable object-deletion outbox supports ensemble deletion without losing keys.
No infrastructure has been provisioned. Plane MCP is unavailable in this session.

Phase 4a implementation details:

- Storage layout: `ensembles/{ensembleId}/originals/{uuid}`. Keys are never
  credentials. Originals are magic-sniffed, hashed during streaming, staged on
  private local disk and inspected in a worker with a 192 MiB JS heap and a
  10-second deadline. PDF parsing is bounded, without rendering; photo metadata
  has a 40-million-pixel guard. Native parser memory also depends on worker-image
  resource limits. HEIC requires libvips HEIF support. Ordered photo source sets
  are the job's immutable `provenance.sources` array; each page stores its source
  ID/page number and zero-based job order. One PDF or up to 60 photos per job.
- API: POST `/api/ensembles/:ensemble/originals` accepts a raw streamed body and
  `X-Original-Filename`; response returns an object ID. GET `originals/:object`
  streams an attachment, or `?signed=1` redirects to a signed GET valid at most
  60 seconds. Each authorized access is audited without content. Current
  transcribe/lead is required. Signed links are bearer grants for their short
  lifetime and cannot enforce a revocation that occurs after issuance.
- POST `transcriptions`, with `Idempotency-Key`, `{sourceObjects:[ids], options}`
  creates and queues the job in the original destination ensemble. Options are
  currently limited to language. GET `transcriptions/:job`, GET `:job/result`,
  POST `:job/cancel`, POST `:job/retry` recheck current transcribe/lead. POST
  `:job/import` requires **editPieces alone**, by the explicit Phase 4a import
  decision; importer need not initiate the job. It uses the existing score
  validator, timing derivation, version insert and library notification path.
  Ensemble + job locks and imported-piece reference make imports idempotent.
- State machine (persisted):
  `queued -> running -> completed | failed | cancelled`
  `failed | cancelled -> queued` (explicit retry, retain completed pages)
  Pages: `queued -> running(lease) -> completed | failed | queued(backoff)`;
  expired running leases can be reclaimed; a unique claim token fences stale
  workers. Cancellation invalidates claims and keeps already complete pages.
  A bounded worker loop performs repeatable assembly and checkpoints final XML.
  Emergency stop overlays `processing_paused` on queued/running progress;
  in-flight calls may finish, but assembly and new provider calls pause.
- `npm run worker` runs a separate process; `TranscriptionWorker.tick()` is also
  callable in dev/tests. PostgreSQL `FOR UPDATE SKIP LOCKED`, timestamptz leases,
  heartbeat and claim tokens provide crash recovery without Redis. Pages within
  one job are sequential for previous-page context; different jobs run in
  parallel. Admission is serialized per initiator and ensemble (2/4 active jobs
  by default), with 2 globally active pages, a 20-second provider timeout and
  at most 3 automatic attempts with capped exponential backoff. Upload admission
  uses the Phase 3b UploadSlots implementation and configured limits.
- Every worker provider step rechecks the initiating user's current capability.
  Departed/deleted initiators fail permission checks; ensemble ownership remains.
  Cancellation and failed attempts have distinct stored reasons. The only shipped
  provider is FakeProvider: no OpenAI client, paid call, model substitution or
  Audiveris fallback. Fake assembly produces a demonstrative MusicXML score.
- `TRANSCRIPTION_EMERGENCY_STOP=1` always pauses. A sysadmin-only PUT
  `/api/admin/transcription/control` with `{paused:boolean}` controls a DB toggle
  and writes an audit event; leads have no implicit platform rights. Resume
  preserves all work. GET `/api/admin/transcription/metrics?from=...&to=...`
  requires sysadmin and offset-qualified instants, using half-open ranges.
- Page metrics record attempts, retries, latency, model/prompt, usage, estimated
  USD and result uncertainties; jobs record summary metrics. Price table entries
  use `{input,output}` USD/million tokens, keyed by model. Fake usage/cost is zero.
- Originals have no age-based expiry. Account closure deleting a sole-member
  ensemble transactionally queues its object keys for physical deletion; all
  other account closures leave originals with the ensemble. Worker cleanup
  drains unreferenced deletion-outbox keys after a one-hour safety interval.
  Derived cleanup selects only `kind='derived'`; originals cannot match it.
  Failed uploads enqueue orphan keys before storage upload; private staging
  files are removed on normal success/failure. Crash-left local staging is cleaned in bounded batches after one hour by the
  worker; this staging directory never contains retained object-store originals.
- Socket `transcription:progress` events (stage and page states) cross worker/API processes through
  PostgreSQL NOTIFY. Recipients are rechecked for valid session and current
  transcribe/lead; HTTP supplies durable progress after missed notifications.

4b plugs in `TranscriptionProvider`, `PageRenderer` and `JobAssembler`: real model
ID/access verification, bounded PDF rasterization, faithful musical assembly,
notation validation and evaluation. 4c consumes the APIs and socket progress events
for upload/progress/review/import UI; no transcription UI is introduced here.
The fake XML checks are deliberately limited to the fake contract; they are not
musical quality validation.

Phase 4a verification (2026-11-04): `npm run typecheck` passed; `npm test`
passed 107 tests; `npm run build` passed (also rebuilt by the browser/secret
harnesses); `npm run test:integration` passed 49 scenarios against disposable
Postgres and a dedicated SeaweedFS bucket, with real verified sessions;
`npm run test:browser` passed the account/library/theme suite plus synchronized
playback and acceptance scenarios; `npm run db:generate` reported no drift.
The final `npm run check:secrets` passed its positive control and clean-client
artifact scan. New migration 0005 is committed; no production migration occurred.

The new integration scenarios cover sniffing, streaming size enforcement,
page/pixel limits, deduplication, authorized downloads and signed URL expiry,
source-order preservation, immutable tenant destination, provider failures,
bounded retries, completed-page reuse, SIGKILL/reclaim under a frozen clock and
non-UTC TZ, cancellation checkpoints, current permission revocation, user and
ensemble admission limits, concurrent import, edit/transcribe independence,
emergency DB/env stops, admin metrics/authorization, private socket progress,
derived cleanup exclusion of originals, and account-closure deletion outbox.
Temporary check logs are in gitignored `.transcription-tmp/`; browser evidence is
in gitignored `.review-evidence/`. No push, provisioning, paid AI or real mail.
Separate read-only review and independent verification belong to the parent run.

### Phase 3g — focused synchronized-playback fix pass (2026-11-04)

Loop scheduling clamps the half-open end and tracks actual wraps, clearing a loop
removes its bounds, and all failed client state applications initiate single-flight
snapshot repair (then reconnect if needed). Regression coverage includes clicks and
notes within 5 ms over eight wraps for every integer 60–180 BPM plus 133.3 BPM,
and stale acknowledgements whose listener fails once without an invalid toast.

Browser scenario a now maps each client's scheduled AudioContext start back to
server time using its live output timestamp/currentTime and calibrated offset.
The previous 0/0/0 ms start figures in Phases 3e-2 and 3f compared canonical target
instants and are retained as historical consistency checks, not independent
scheduling measurements. The positionAtServerTime spread is likewise only a
canonical consistency check; AudioEngine drift supplies the position measurement.
Scenario g records non-click oscillator and buffer-source starts and requires new
notes after each of four wraps at both 113 and 77.7 BPM on all three clients.
All measurements are scheduling/position measurements in headless Chromium,
not acoustic measurements. Final measured results and validation follow below.

Removed obsolete leader/follower UI branches and the legacy sharedAnchor/relay
scheduler; Solo keeps its local loop path and Together keeps the canonical engine.
Timing derivation version is now 3; an integration regression loads stored v2
scores with tempo 0/-20 and verifies recomputation to the 100 BPM fallback.

Final validation: `npm run typecheck`, `npm test` (**111/111**), `npm run build`,
`npm run test:integration` (**49/49**, no skips), `npm run check:secrets`
(positive control detected, clean client artifacts, no public source maps), and
`npm run db:generate` (no schema/migration drift) all passed.
`npm run test:browser` passed the complete design/language/capability matrix,
two-account sync, and all three-account a–n scenarios plus offset/bfcache checks;
zero page errors. Ten independently mapped starts: mean **0.099 ms**, p95/max
**0.167/0.167 ms**; maximum pairwise AudioEngine position error **11.521 ms**.
All **24 client/wrap checks** observed non-click starts (four wraps × two tempos
× three clients; minimum one source per check). The canonical position spread
remains a separate consistency check, not a measured client scheduling difference.
`BROWSER_SCRIPT=scripts/browser-smoke.mjs npm run test:browser` passed playback,
staff, PDF export (**121433 bytes**), reset/sign-in and player themes; zero
browser errors and zero forbidden external requests. Evidence is retained in
`.review-evidence/phase3g-*.log` and `.review-evidence/browser/sync-acceptance.json`.
The initial wrap regression failed before the fix. Initial browser failures
exposed an overly short whole-note observation window and a concurrent secrets
build replacing served assets; the final complete browser run passed without
concurrent builds. Physical/acoustic output, Safari/iOS and Bluetooth remain
outside this headless check. No production resources changed; no push or PR.

### Phase 4a fixes

B1: source inspection now executes in a separate Linux process with a 1.5 GiB
address-space limit (including native allocations), 5/6-second CPU limits,
10-second parent kill deadline, and inherited seccomp network denial. Failure to
install the sandbox fails closed. Phase 4b rasterization must use this same
launcher, never an API worker thread. The Railway deployment image must install
Python 3 and libseccomp2; these Linux process controls require no privileged
container/cgroup access. No Railway deployment was performed or verified here.

S1: added an independent provider_calls ledger, written at call entry and on
settlement before result fencing. Expired leases mark running calls abandoned
with lease_expired; stale returns retain their usage. Heartbeats abort on lost
ownership, cancellation and pause. Admin metrics aggregate the ledger.

S2: only explicit authorization DomainError 403/404 becomes permission_revoked;
unknown/render/storage/database errors use bounded infrastructure_error retries.

S3: assembly exceptions fail only their job (assembly_failed); deleted-job and
nullable-metrics guards added. Cleanup/recovery have independent error boundaries;
worker slots each claim again immediately after their own completion.

S8: explicit progress fields exclude XML, metrics, raw options and request hashes;
page context/assembly reads result_xml separately. The result endpoint alone
returns the final XML. Model and prompt pins must match the worker; mismatches
fail model_unavailable and can be manually retried after a matching deployment.
Socket progress is projected once and per-recipient failures are isolated.

S7: claim, heartbeat, expiry and retry backoff use PostgreSQL now() and SQL
interval arithmetic. Tests expire fixture leases directly in SQL; skewed worker
JS clocks cannot steal live leases. No production clock override is exposed.

S5: signed downloads override MIME and disposition to inert attachments. Results
have attachment, octet-stream, sandbox/default-src none and nosniff headers.
Assembly uses shared score validation, which rejects DOCTYPE/entities and roots
other than score-partwise/timewise.

S4: object PUT precedes the short ensemble transaction, protected by a committed
orphan outbox key; concurrent hash dedupe leaves redundant keys for cleanup.
Original storage has an operational ceiling, TRANSCRIPTION_STORAGE_MAX_BYTES
(default 5 GiB per ensemble), enforced under the lock; this is not a money budget.
Uploads allow 30 seconds idle and 10 minutes total; filenames strip bidi controls.

S6: HEIC/HEIF and AVIF return unsupported_image_format; HEIC is not supported
server-side. Pickers explicitly accept PDF/JPEG/PNG/WebP for iOS conversion;
German/English errors explain JPEG export. Multi-frame images return
animated_image, encrypted PDFs encrypted_pdf, mixed PDF/photo sources mixed_sources.

Retry policy: start/retry/cancel checks the ACTING user's current permission.
Billable steps and assembly require transcribe for started_by, the user who last
started/retried the job. A current authorized retrier replaces a departed initiator
for this purpose. Explicit retries are unbounded except active-job admission;
no monetary budgets exist. Retry emits durable progress. Pauses return the page
attempt to the queue without consuming the automatic attempt allowance.

Regression additions reproduce reviewer cancellation/lease/crash/authorization/
assembly probes, assert exact automatic retry counts, and seed a live original's
aged outbox entry to make original-retention cleanup coverage non-vacuous.

Time-rule review: ledger instants use timestamptz; lease/backoff arithmetic uses
PostgreSQL now(), metrics keep half-open instant ranges, and regression fixtures
run under America/New_York with explicit SQL lease expiry and JS skew.

The bundled Evening Rise MusicXML sample now omits its external DTD declaration
so it remains importable under the shared DOCTYPE rejection policy; musical
content is unchanged. The first browser run caught this compatibility issue.

Deployment prerequisite (not provisioned): Railway supports supplying a custom
[Dockerfile](https://docs.railway.com/guides/dockerfiles), so package Python 3 and
libseccomp2 in that image. The sandbox uses unprivileged per-process rlimits and
seccomp, not privileged cgroup management or network namespaces. The local probe
confirmed RLIMIT_AS=1610612736 bytes, RLIMIT_CPU=5/6 seconds and socket creation
fails EPERM. Railway runtime compatibility itself remains a deployment smoke
check; lack of Python/seccomp fails closed. Size the service memory and upload
concurrency to leave parent-process headroom alongside these per-child limits.

The full integration pass exposed a test setup error: two same-account uploads
correctly hit per-user upload admission. The dedupe race now uses two authorized
accounts uploading a fresh identical hash, exercising concurrent insertion while
preserving the intended admission limit.

Final Phase 4a fix verification (2026-11-04):

- `npm run typecheck`: passed.
- `npm test`: 111 tests passed.
- `npm run build`: passed (also rebuilt by secrets/browser harnesses).
- `npm run test:integration`: 69/69 passed on the final full rerun.
- `npm run check:secrets`: passed positive control and clean client-artifact scan.
- `npm run test:browser`: passed account/library/theme matrix, two-account sync
  and full three-client acceptance including restart, revocation and shared-device
  isolation; no browser errors.
- `npm run db:generate`: no schema drift; migrations 0006 and 0007 committed.
- `git diff 3eed5dd --check`: passed.

Both 512 MiB and 2 GiB object-stream expansion probes terminate in the limited
child within the deadline; parent RSS is sampled during inspection and remains
below the 100 MiB growth bound. Sandbox limit/network checks are automated.
No code-review finding remains deferred. Railway image/runtime smoke validation
is a deployment prerequisite, not performed here. No push, production migration,
provisioning, paid provider calls or real email occurred. Failed and successful
local check logs remain in gitignored `.transcription-tmp/`; browser evidence is
in gitignored `.review-evidence/browser/`.

### Phase 4b-1 — direct transcription, assembly and review reports

Implementation on `production-v1`, based on Phase 4a HEAD `20837fe`. No live AI
request, account-access probe or paid evaluation was made. Audiveris and the
prototype service remain untouched for Phase 4b-2.

Verified official documentation (2026-11-04):

- https://developers.openai.com/api/docs/models/gpt-6.1-sol — exact API identifier
  `gpt-6.1-sol`, image input, text output, Responses endpoint, structured outputs,
  128,000 maximum output tokens. This is capability documentation, not proof of
  account access or notation accuracy.
- https://developers.openai.com/api/docs/guides/images-vision — image input via
  `input_image`, base64 data URL and `detail: high`.
- https://developers.openai.com/api/docs/guides/structured-outputs — strict JSON
  schema output and separate refusal handling.
- Installed `openai` 7.50.0: `resources/responses/responses.d.ts` verifies
  `input_image`, `text.format.json_schema`, `max_output_tokens`, incomplete details,
  refusal content, usage and AbortSignal request options. The model parameter
  permits string identifiers; the official model page supplies the exact Sol id.

Provider decisions:

- Server/worker only `OPENAI_API_KEY`; `OPENAI_TRANSCRIPTION_MODEL` defaults to
  `gpt-6.1-sol`. No fallback model. Missing key or API model-not-found produces
  `model_unavailable`. Production/development use the real provider; NODE_ENV=test
  retains Phase 4a fake defaults. New integration tests explicitly instantiate the
  real provider with an injected SDK fetch that returns fake HTTP responses.
- Responses API, `store:false`, strict `{musicxml, uncertainties, flags}` JSON,
  64,000 max output tokens, SDK retries disabled. Durable job attempts handle
  rate limits, including Retry-After seconds/date; timeout/cancellation reaches
  the SDK through AbortSignal. Refusals, incomplete/partial/truncated responses,
  bad JSON/XML and infrastructure failures are distinct. Usage is retained even
  on refusal/truncation/parse failure; request ids accompany successful usage.
- Immutable `server/prompts/transcription-v1.txt` is pinned per job. Context carries
  only part ids/names/instruments, clefs, divisions, key/time, last measure number,
  open ties/slurs, lyric language and tempo. Full prior XML never enters a request.
  Token growth follows score state, not accumulated prior page results.

Rendering and operation:

- Use a bounded raster per page instead of PDF file inputs: deterministic local
  limits, page-level checkpoints/retry and exact correspondence with provenance.
  No evidence establishes that whole-PDF input improves notation accuracy.
- `BoundedPageRenderer` downloads at most 50 MiB into a private staging directory,
  starts the existing Linux Python/seccomp sandbox, and kills its process group
  on cancellation/deadline. The sandbox caps address space at 1.5 GiB, JS heap at
  192 MiB, CPU at 5/6 seconds, files at 64 MiB, and disallows network syscalls.
  Rasterization has a 15-second wall deadline. PDF: pdftoppm, requested 250 DPI,
  single selected page, longest edge <=3500. Photos: EXIF orientation, input pixel
  limit 40 million, <=3500x3500 output, grayscale/contrast normalization, PNG.
  Temporary files are removed and abandoned render directories join staging cleanup.
- Build `docker build -f Dockerfile.worker -t lightscore-worker .`; use the existing
  worker environment with `docker run --env-file .env lightscore-worker`. No port
  is exposed. Image installs Python3, libseccomp2 and poppler-utils, runs as node.
  Development may install those same host binaries. Run from repository root so
  pinned prompt assets and relative staging paths resolve. Configure a realistic
  TRANSCRIPTION_TIMEOUT_MS for dense pages (the default is now 180 seconds).
  Never put a real key into test/CI environments. `.dockerignore` excludes secrets,
  Git metadata, dependencies, builds and private staging files from the image.

Assembly and validation:

- Part identity uses corroborated context ids, normalized names/instruments and
  clef continuity; never array position. New identities are retained even when
  part counts differ. Missing page spans and newly entering parts receive full
  measure rests; every output part has the same continuously numbered measures.
  Original measure subtrees preserve lyrics, ties/slurs, key/time/clef changes,
  directions, repeats, tuplets and other notation. First-page metadata is retained.
  Boundary tie/slur notation is preserved and checked across the assembled score;
  ambiguous/missing endpoints become review warnings rather than invented notes.
- JSON sidecar lives in the job's existing `provenance` JSONB: measure number,
  canonical part id, source page, page-local printed number, model, prompt version,
  and synthetic-rest marker. It is downloaded from the transcribe-gated `:job/report` endpoint and copied into
  imported piece provenance. Raw MusicXML contains no private provenance markup.
- Shared `src/score-validation.ts`, also called from the bounded import validator,
  rejects absent/duplicate/unknown parts, empty parts/measures, invalid durations,
  divisions, pitches and cursor positions. It checks voice/staff timing, meter,
  notation availability and tie/slur continuity. Duration discrepancies, pickup/
  final measures, missing notation and unmatched ties/slurs are review warnings;
  structural errors block import. Accuracy remains explicitly unknown and review
  is always required. Raw source XML remains canonical; validation never rewrites it.
- Regression coverage reuses the prior-art `public/evening-rise.musicxml` fixture,
  counting retained notes/lyrics/ties/slurs/directions/barlines/clefs/time after
  paging and assembly. Added SATB continuity and accompaniment/divisi fixtures,
  API failure fakes, abort, durable real-provider integration, EXIF orientation,
  idempotent import and client parser/timing extraction checks. Old domain fixtures
  now declare their part and divisions so they remain valid under shared validation.

Open questions / follow-up boundaries:

- Actual deployment account access, model accuracy, dense-page token/deadline tuning
  and transcription quality require the opt-in live evaluation harness in 4b-2.
  No live transcription quality claim is made by these offline tests.
- Automatic identity inference cannot prove musical identity for indistinguishably
  named parts; deterministic continuity plus retained sections still requires review.
  Complex independent polymeter, mid-measure divisions changes and split printed
  measures across pages need further evaluation fixtures; do not silently repair them.
- Phase 4b-2 supplies live evaluation/cost reporting and removes Audiveris after
  parity evidence. Phase 4c supplies transcription progress, report and review UI.

Phase 4b-1 acceptance (2026-11-04):

- `npm run typecheck`: passed.
- `npm test`: 126 tests passed, including eight sounding events from twelve
  notated SATB notes joined by cross-page ties, and an exact 12-beat timeline.
- `npm run test:integration`: clean rerun passed 71/71 tests, zero failures or
  cancellations, including real provider/renderer/assembler with fake OpenAI HTTP,
  durable usage, separate report download, idempotent import and 3-measure timing.
- `npm run test:browser`: passed account/collaboration, minimal two-account sync
  and full sync acceptance (offline/count-in/sleep/loops included).
- `npm run build`, `npm run check:secrets`: passed; positive secret-leak control
  detected and final client artifacts clean, with no public source maps.
- `npm run db:generate`: no schema changes, nothing to migrate.
- `docker build -f Dockerfile.worker -t aicap-worker-4b1 .`: passed.
  `docker run --rm --network none` with the repository's renderer smoke script and
  current renderer mounted read-only passed: PDF page 2 rendered to 3500x1750 PNG
  through the actual seccomp/resource-limited child. The host has no Poppler;
  the worker image supplies it. Reusable check: `node scripts/renderer-smoke.mjs`
  inside the worker image (or a host with the documented dependencies).

Early concurrent acceptance runs exposed a progress-projection regression (fixed
by serving the sidecar separately), a password-test timeout under contention, and
shared build-output races. Failures were preserved in ignored local check logs;
final integration and browser reruns passed. Do not run artifact-rebuilding checks
concurrently with running app/browser tests in this shared checkout.

Plane project mapping was verified through the connected tool. Ticket reads were
unavailable because the tool rejected its arguments; no ticket state was changed.
No paid calls, deployments, pushes, prototype edits or Audiveris removals occurred.

### Phase 4b-2 — explicit evaluation, usage reporting and legacy removal

Implemented on production-v1 from aed7b20. No paid request, deployment, production
mutation, push or endpoint retirement. The upstream prototype is untouched.

Metric (`server/reference-comparison.ts`): precision/recall/F1 are exact multiset
matches by named part, ordinal measure and staff/voice. Categories: complete
note events (pitch/onset/duration, including rests), pitch at onset, onset by
voice event ordinal, duration at onset, rests, measure presence, effective key,
time and clef, lyric verse/syllabic/text at onset, and pitch-specific tie endpoints.
Durations/onsets are quarter-note units rounded to 1e-6; divisions normalize.
Part order and printed measure numbers do not affect scores. Duplicate named
parts prefer identical notation fingerprints and expose ambiguity. Review effort
counts distinct ordinal measures with any mismatch (including missing/extra
measures), and separately counts affected part-measure positions; it is a proxy,
not measured editor time. This is local exact alignment,
not edit-distance reflow across inserted/deleted measures; shifted sequences may
therefore count several edits. Voice/staff identifiers and normalized part names
must correspond; renamed or ambiguous parts require human review. Empty
categories score 1 only when both are absent. Valid XML is never a quality pass:
qualityPass/qualityThresholds remain null, and shared validation stays separate.

Evaluation:

- `npm run eval:transcription -- --dry-run`: offline recorded rasters/responses,
  real bounded image renderer, real provider prompt/parser with injected SDK HTTP,
  real assembly/validation and comparison. No DB/S3 and no network/provider call.
  PDF rasterization itself is covered by the existing worker renderer smoke check.
- Live: `npm run eval:transcription -- --set eval/fixtures --confirm-paid --pages
  --limit 1 --out reports/eval-example.json` with OPENAI_API_KEY in the environment.
  Refuses without key/confirmation or whenever CI is set. Original PDFs require
  worker Python3/libseccomp2/Poppler prerequisites. Default model is unchanged.
- Local file storage outside the app DB. Up to three attempts per page, bounded
  rendering and 180-second per-attempt deadline. Retry-After above 30 seconds
  terminates this evaluation page rather than retrying early. CLI limit is jobs.
- JSON retains per-page/job accuracy, validation diagnostics/counts, uncertainties,
  refusal/truncation outcomes, attempts, tokens, retries and latency. JSON and
  Markdown summary reports are written; --pages adds page rows to terminal output.
- TRANSCRIPTION_PRICE_TABLE supplies USD per million input/output tokens (same
  contract as worker). No rates are invented: unknown prices are null/unknown.
  Reports store rate basis, model, prompt and UTC capture time. No monetary quotas.

Fixture policy: eval/fixtures/README.md defines the manifest and extension process.
All new material is original synthetic notation dedicated to CC0-1.0; regeneration
uses Verovio engraving, pdf-lib and sharp deterministic degradation (skew, rotation,
blur, noise, JPEG). Six two-page jobs cover PDF/photo versions of named SATB,
divisi/piano and band exercises. They are deliberately simple smoke material,
not realistic dense-score quality evidence; more varied legally redistributable
material is needed before product acceptance. No bundled song's redistribution
rights were assumed and no copyrighted score was newly included.

Usage: GET /api/admin/transcription/usage?from=<offset-instant>&to=<offset-instant>
requires an authenticated verified sysadmin role on every request; ordinary leads
receive 404, signed-out callers 401. Invalid/naive/reversed ranges receive 422.
SQL filters [from,to), buckets started_at in central APP_TIME_ZONE, and groups by
calendar day/model/prompt/ensemble/outcome. Includes calls, retries, input/output
tokens, missing-usage counts, latency p50/p95, distinct pages/jobs, estimated USD
and per-page/job averages within each group. Group page/job counts are not additive
across outcomes/days. Unknown historical costs are not reconstructed with current
prices; null costs and missing usage are explicit. Running calls have no finished
latency. Worker now records failed-response usage costs and leaves missing prices
unknown instead of zero. No schema change required. Unit tests cover 23/25-hour
New York DST days; integration tests exercise actual SQL boundaries, costs and
HTTP authorization with real sessions. Phase 5 builds the admin UI.

Ported versus deleted:

- Ported legacy test intentions into transcription-core: preserve lyric syllabic
  text, tuplets/time-modification, repeats verbatim; reject invalid durations.
  Existing 4b-1 tests already cover Evening Rise source fidelity, page continuity,
  changing part counts/divisi/accompaniment and ties. The reference suite adds
  wrong pitches, rests, lyrics, divisions, voices/onsets and missing/extra measures.
- Deleted the entire legacy scan service: compact notation builder/correction
  pipeline, second paid review/answer pass, HTTP service, in-memory/file jobs,
  authentication bypass tests, provider/recognizer mocks, dependencies/lockfile,
  both Dockerfiles, compose, Caddyfile, environment and deployment README.
  The replacement keeps Poppler and sharp solely for bounded rendering.
- Deleted src/scan.ts, src/feedback.ts, firebase.ts and legacy-store.ts; removed
  scan menu/chip, feedback buttons/menus/tour and initialization. Existing imported
  scanMarks and their review display remain to preserve repertoire metadata.
- No feedback server endpoint exists; feedback remains follow-up work requiring
  authenticated server persistence before a new UI entry is added.
- Removed obsolete scan CI env and development/project instructions and Docker
  ignores. Historical spec/plan snapshots and immutable transcription-v1 prompt
  still name the retired recognizer; these are not executable dependencies.
- functions/, firestore.rules and rules-test/ remain untouched for Phase 6.
  Source deletion does not retire any deployed legacy endpoint.

Open questions: product owner must set acceptance thresholds after the first
explicit live evaluation. Actual model/account availability, realistic dense SATB,
independent divisi, grand-staff piano, transposing bands and genuine phone-photo
accuracy/cost remain unverified. No live score-quality claim is made here.

Phase 4b-2 acceptance (2026-11-04):

- `npm run typecheck`: passed on final sources.
- `npm test`: 138/138 passed; DST suite also passed under TZ=America/New_York.
- `npm run build`: passed.
- `npm run test:integration`: 72/72 passed, including actual SQL DST boundaries,
  failed-call cost aggregation and real-session sysadmin authorization.
- `npm run check:secrets`: passed positive control and final clean client scan;
  forbidden-string list was preserved.
- `npm run test:browser`: passed account/design matrix, two-account sync and full
  three-client acceptance (loops, offline, count-in, sleep, process restart,
  revocation and shared-device isolation).
- `npm run db:generate`: no schema drift, nothing to migrate.
- `npm run eval:transcription -- --dry-run`: all six jobs/twelve pages completed,
  reference note F1 1 with zero edit measures, as expected for synthetic replay.
  Token counters are labeled synthetic; this is not measured live quality/cost.
- `git diff --check`: passed. No remaining imports of deleted client modules.
- `git diff aed7b20 -- functions firestore.rules rules-test`: empty.

Check logs remain in gitignored `.transcription-tmp/4b2-*`; browser artifacts
remain in `.review-evidence/browser/`. Plane AICAP-14 tracking was updated through
the plane-project-management skill; no product quality threshold was invented.

### Phase 4b fixes — 2026-11-04

Local review remediation on production-v1 from feac2da. No push, deployment,
real email, infrastructure provisioning, or paid/provider request. Review scratch
probes were read only; the removed legacy recognizer was not restored.

- X1: external PUBLIC/SYSTEM declarations without internal subsets are stripped
  before parsing; any ENTITY or remaining DOCTYPE fails closed. Restored the
  original Evening Rise exporter header. Import and fake-provider regressions
  cover MusicXML 3.0/3.1/4.0 and timewise (normalized to partwise for playback).
- X2: validate page output before its checkpoint, with inherited attributes;
  bad output gets one automatic retry. Cover/blank/no_music pages persist as
  skipped with source provenance, flags and report warnings. Global maximum-weight
  one-to-one part assignment prioritizes context ids, normalizes diacritics,
  common vocal names/numerals and checks clefs. Ambiguous and new identities warn;
  new-part diagnostics identify the first page. Transient assembly failures have
  durable bounded exponential backoff. Explicit retry resets all pages for an
  assembly failure or changed model/prompt; otherwise completed pages are kept.
- X3: rest lyrics, empty measures/parts and unequal part measure counts warn.
  Cross-staff timing is keyed by voice; mixed meter sums all beat/type pairs;
  tie stops precede starts independent of XML order. Missing divisions, nonfinite
  durations, negative cursors and unusable pitch/part structure still block.
- S1: strict schema intentionally omits root $schema and unsupported string
  constraints; recursively linted for required fields and additionalProperties.
  Reference: https://developers.openai.com/api/docs/guides/structured-outputs#supported-schemas
- S2: outer whitespace/fences and safe external DTDs are tolerated. Empty and
  reasoning-only responses use the same single invalid_output retry allowance.
- S3: parser exceptions retain response usage/request id; timeouts/aborts and
  orphan cancellation flag usage_unknown; cancellation abandons orphan running
  calls. Provider logs contain only sanitized reason/status/code/request id.
  provider_calls(job_id) is indexed; usage reporting counts unknown usage.
- S4: quota and 401/403 failures are terminal provider_account_error; sysadmin
  usage grouping exposes error_kind.
- S5: synthetic rests copy the template's time only, with the receiving part's
  own divisions/key/clef/other attributes. No transposition/staves leak across
  instruments, and divisions survive tacet spans.
- S6: unreadable pages and all-rest parts/scores warn. Meter disagreement remains
  a warning: finite timing is playable but accuracy is unknown, and independent
  polymeter/pickups cannot be safely repaired. Missing divisions remain errors;
  inherited divisions yielding excessive beats remain a conspicuous timing
  warning, never an assertion of musical accuracy. Valid means structural only.
- S7 (partial): provenance diagnostics use indexed lookups; backfill avoids the
  previous quadratic provenance search. Assembly executes in a bounded worker
  thread outside DB transactions; completion rechecks state/attempt/permission.
  Imported piece sidecars are gzip/base64, while job reports retain full detail.
  Offline 60×12×30 benchmark: 13,437 ms, 2,594,197 bytes uncompressed provenance.
  The <3 s target and synthetic-rest range compression remain open; DOM creation
  is still the main scaling limit. Reproduce with
  `node --import tsx scripts/benchmark-assembly.ts`.
- S8: alpha is flattened to white, Sharp runs with concurrency 1, children get
  MALLOC_ARENA_MAX=2; bad inputs return render_failed, infrastructure stays
  retryable. Native stderr is bounded and logged, never returned to HTTP.
- S9: prompt assets load relative to the module. A pinned SHA-256 is checked at
  startup and stored in job provenance and the ledger. Editing v1 requires a new
  version and pinned hash; changing the file alone refuses startup.
- S10: claims skip incompatible pins. Maintenance expires unserved, idle pins
  after TRANSCRIPTION_UNCLAIMED_MS (default 15 minutes), respecting live leases.
  Explicit retry repins to the current provider and resets all pages if pins
  changed (including completed pages, to avoid mixed models/prompts).
- S11: seccomp denies io_uring and requires socket resolution. Minimal child env,
  separate sessions, and fail-closed Landlock deny the parent's /proc/environ;
  the child's own /proc diagnostics remain accessible. Requires Linux Landlock
  (5.13+), Python3 and libseccomp2; unsupported kernels degrade readiness and
  uploads to 503 sandbox_unavailable. A launcher/socket canary runs on startup.
  Both app and worker images install Python3/libseccomp2; worker adds Poppler.
  This is filesystem isolation of /proc, not a blanket filesystem sandbox: the
  service's mounted data must still follow least-privilege deployment policy.
- S12: removed unused transcriptionClock; real global Date constructor/Date.now
  skew tests run at ±10 minutes while lease authority remains PostgreSQL.

Additional fixes: assembler depth bound; cleanup continues after object errors
with a per-row one-hour retry delay; Content-Length storage/size preflight;
percent-decoded filenames strip bidi/path/control characters and downloads retain
sanitized names; S3 checksum calculation WHEN_REQUIRED. Worker base pinned by
registry digest, npm ci --omit=dev, selective COPY and recursive Docker ignores.

Open follow-ups: S7 performance/range compression above; incremental persisted
page context (current compact prompt context still reparses prior pages), richer
repeat/ending/octave/pedal/lyric continuation state; lease-derived heartbeat and
transient-heartbeat tolerance. max_output_tokens currently budgets 64,000 total
including reasoning; truncated remains an explicit terminal reason requiring
review/resubmission. Automatic overlapping top/bottom split retry is deferred
because deduplicating overlapping measures without changing music needs its own
fixtures and policy. No live quality/cost claim is made.

Phase 4b fixes verification:

- `npm run typecheck`: passed on final sources.
- `npm test`: 154/154 passed (including exporter/timewise, identity, provider,
  sandbox, rendering, prompt-hash and off-thread assembly regressions).
- `npm run build`: passed; also rebuilt by the final secret-scan harness.
- `npm run test:integration`: 75/75 passed with disposable Postgres/storage.
  A subsequent targeted run passed 10/10, including the newly added durable
  skipped-cover/invalid-page retry scenario, assembly backoff, pin handling,
  global Date skew, ledger unknown usage and cleanup/filename recovery.
- `npm run check:secrets`: passed positive control and clean final scan; no
  forbidden-string weakening. Run builds sequentially: an earlier concurrent
  browser/secret build raced over dist, and an earlier integration fixture was
  created before the new migrations existed. Clean reruns passed.
- `npm run test:browser`: passed account/design matrix, two-account sync and
  full three-client acceptance, including offline/count-in/sleep/restart.
- `npm run db:generate`: no schema drift after migrations 0008–0010.
- `npm run eval:transcription -- --dry-run`: six offline jobs completed,
  fixture F1=1; no network/provider call or live quality claim.
- `docker build -f Dockerfile.worker -t lightscore-worker:phase4b-fixes .`:
  passed with production-only dependencies and pinned base image.
- `docker run --rm lightscore-worker:phase4b-fixes node scripts/renderer-smoke.mjs`:
  passed selected PDF page through the real sandbox to 3500×1750 PNG.
  The host has no Poppler, so the authoritative PDF smoke ran in the image.
- Performance benchmark remains above the requested target, as recorded under S7.

All implementation commits remain local on production-v1. No pushes or PRs.

### Phase 4c — transcription user interface (2026-11-04)

Production client transcription flow, using only FakeProvider/recorded data for
verification. No paid requests, deployment, push or production access.

- Repertoire entry follows current transcribe/lead permission. The start sheet
  accepts one PDF or ordered JPEG/PNG/WebP photos, camera capture on touch devices,
  thumbnails, drag/keyboard reorder and removal, optional title and four lyric
  languages. PDF title/page count, total size, private-original notice, per-file
  upload bars and friendly bilingual source errors use the existing themes/fonts.
- Ensemble job cards survive reload and appear on a second authorized device.
  Socket progress triggers durable reconciliation; reconnect and an eight-second
  fallback refresh repair missed events. Cards distinguish page outcomes, pause,
  cancellation and terminal reasons, with cancel/retry/original actions. Imported
  jobs disappear. Live membership refresh hides revoked access and closes review;
  edit permission changes update import availability without closing review.
- Full-screen read-only Verovio review distinguishes gold uncertainty questions
  from warm-red warning ticks and pencil washes. Clicking a review item locates
  the assembled measure and displays its authorized original source-page raster.
  Mapping supports repeated local numbers and inclusive synthetic-rest provenance
  ranges. Review always distinguishes structural validity from unknown accuracy;
  skipped pages and plain-language diagnostic families remain visible. Downloads
  retain the complete report and canonical MusicXML. Listen opens a temporary,
  unsaved Solo score with persistence controls disabled. Import is pending-guarded
  and server-idempotent, preserves the optional title and opens the library piece.
- Minimal server additions: capability-gated ensemble job read model (most recent
  100 jobs), bounded/audited private source-page PNG endpoint using the existing
  sandbox renderer and upload admission, optional title and la/other language
  values on job creation, and import title from captured job options. The API
  Dockerfile now installs Poppler for on-demand PDF comparison. No schema changes.

Implementation limits/deviations: assembly and validation have no separately
persisted stages in the existing API; the UI infers assembly from finished pages
and supports a validation stage when supplied. Upload progress remains in the
start sheet until a durable job exists. Interrupted, not-yet-complete browser
uploads require reselecting files (browser file access cannot survive reload);
ready original deduplication and durable jobs avoid repeating completed work.
Report families are translated; free-form provider uncertainty text is displayed
verbatim as plain text. Original comparison rasterizes on demand rather than
retaining additional derived page objects. Job history is bounded to 100 recent
entries. These limits do not assert musical accuracy or live-provider quality.

Tests: `tests/transcription-ui.test.ts` covers every state/reason in DE/EN, page
segments, immutable photo ordering, repeated printed measures and provenance
ranges. `npm run test:browser:transcription` uses the existing disposable built
start/Postgres/Mailpit harness and a local SeaweedFS bucket, with an explicitly
FakeProvider-backed worker and real assembly. Requires Python/seccomp/Landlock and
Poppler locally (or the app/worker image); fixture bucket is removed after the run.
Browser acceptance covers two-page PDF upload/progress/review/marks/original,
actual Solo playback, double-click-safe import of exactly one piece, three-photo
reordering, HEIC rejection, pause, cancel/retry, independent transcribe/edit rights,
ordinary-member denial and live permission changes. Screenshots cover start and
review at 390/1440 px in light/dark plus running/paused/cancelled cards; text
contrast assertions pass. Evidence lives in `/tmp/aicap-p4c/shots/index.html`.

Final verification: `npm run typecheck` passed; `npm test` passed (227 tests,
including 53 UI tests); `npm run build` passed; `npm run test:integration`
passed 77/77 in the coordinated run; `npm run check:secrets` passed its positive
control and clean-client/no-source-map checks; `npm run db:generate` reported no
drift. Standard `npm run test:browser` passed including sync/restart acceptance.
The final `npm run test:browser:transcription` passed against the committed UI,
including persisted photo order, canonical measure IDs, actual Solo playback,
idempotent import, live permission revocation and desktop/mobile contrast checks.
MusicXML measure IDs survive engraving directly; multi-measure rests expand only
in the review copy so individual bars remain reviewable. Original XML downloads
remain canonical. All final transcription screenshots are refreshed, including
readable mobile notation/marks and the existing comparison switch.

Contact sheet: `/tmp/aicap-p4c/shots/index.html`. Logs:
`.review-evidence/p4c-browser-complete.log`,
`.review-evidence/p4c-standard-browser.log`, `.review-evidence/p4c-ui-unit.log`,
`.review-evidence/p4c-typecheck.log`, `.review-evidence/p4c-secrets.log`;
full integration evidence: `.transcription-tmp/eval-integration-green.log`.
The earlier usage failure was a UTC/DST fixture selection error, and simultaneous
unit runs exposed an evaluation fixture-path race; the evaluation agent corrected
both before the green runs. Builds were serialized for final browser verification.
All commits are local; no push or paid-provider call.

### Phase 4b eval fixes — 2026-11-04

Review remediation from 982019d, concurrent with Phase 4c on production-v1.
All changes are local; no push, deployment, real email or paid/provider request.
The following supersedes the earlier metric and remaining-work descriptions.

- E1: isolate page comparison/validation and job failures; append each job to
  JSONL and checkpoint JSON before advancing. Final JSONL summary plus JSON/MD
  retain attempts, failures and partial results. Regressions cover a bad page
  reference, malformed job manifest and successful subsequent job.
- E2: rests have a separate metric and never contribute to note/pitch/onset/
  duration totals. Empty pitched categories retain explicit zero denominators.
- E3: onsets match staff plus musical quarter time (without pitch), with 1e-4 quarter tolerance;
  one-beat shifts fail. Divisions and numeric alters normalize.
- E4: measure-sequence edit DP aligns insertions/deletions; content fingerprints
  and pitch/rhythm/clef profiles pair renamed parts; note anchors ignore exporter voice labels, with a separate voice-stream metric. Attribute changes score once, tied halves merge, and all elided lyric
  text is retained. Tests cover all eight requested reviewer cases, renamed part
  reordering and normalization noise. Alignment remains a deterministic heuristic,
  not a measured human editing estimate or product-quality acceptance threshold.
- E5: isolated real refusal branches cover absent key, absent confirmation, CI
  with a key/confirmation, and unknown option. Removing any guard breaks a test.
- E6: usage cost groups combine completed/failed attempts. known_cost_usd and
  unpriced_calls retain partial knowledge; totals/averages remain null if any
  attempt is unpriced. Numeric JSON aggregates are numbers. Job metrics expose
  null estimatedCost plus costUnknown/unpricedCalls, never unknown-as-zero.
- E7: migration 0011 adds started_at and (model,started_at) indexes; usage rejects
  ranges over 366 elapsed days with a 422 response explaining the limit.
- E8: usage uses the same strict offset-aware Zod ISO validation as /metrics;
  impossible dates and naive/reversed ranges fail.
- E9: real usageSQL tests exercise both DST transitions, distinct 2/3-second
  latency percentiles, mixed failed/completed calls, unknown cost and numeric HTTP
  types. HTTP assertions select the configured UTC bucket; the SQL fall-back
  assertion explicitly uses America/New_York, rather than conflating their days.
- E10: sorted manifest paths determine --limit. Photo dry runs render distinct
  degraded JPEGs offline. All replay costs are labeled synthetic in JSON/JSONL/MD.
  Eight two-page jobs now include the bundled original CC0 round study with two
  voices per part, two lyric verses, ties and a repeat. These remain smoke fixtures,
  not realistic recognition-quality evidence or coverage of all ensemble idioms.
- E11: synthetic provenance and inferred-rest warnings use inclusive endMeasure/
  localMeasureEnd ranges. Template/backfill state avoids repeated sibling scans;
  part/alignment lookups avoid growing linear searches/copies. Per-page metrics
  persist compact continuation checkpoints; the next worker page reads only the
  last checkpoint, with a one-time upgrade path for older jobs. Context includes
  open ties/slurs/repeats/endings, both octave-shift directions, pedal and lyric
  syllabic state. Building context across N pages is incremental, not prior-page
  replay. The UI mapper understands inclusive source ranges.
- E12: heartbeat interval is lease/5, minimum 1 second; non-overlapping renewals
  use monotonic elapsed time to tolerate transient errors within the lease.
  Pause controls are polled less often. Real DB regression injects a heartbeat
  failure and verifies successful completion without premature abort.
- E13: the 64k output budget includes reasoning and notation; low reasoning effort
  reduces pressure on that shared budget. Truncated/partial pages remain terminal
  with reviewRequired and an explicit page review_reason explaining smaller-region
  resubmission. Automatic overlapping top/bottom retry is not safely feasible with
  the current assembler: it concatenates pages and cannot identify overlapping
  measures without risking deletion of legitimate repeated notation. Split retry
  remains deferred until an overlap/deduplication policy and fixtures exist.
- E14: repaired PROJECT development/deployment text and obsolete Firebase client
  instructions; removed deleted-module references, 127 unused bilingual legacy
  scan/feedback keys, dead feature CSS and the unused ensemble feedback flag.
  The translation cleanup was committed separately while preserving concurrent
  transcription translations. Existing scanMarks review strings/styles remain.

Assembly regressions explicitly preserve two verses, endings, repeats, dacapo,
rehearsal, tempo, dots and tuplets. Structural validity never asserts accuracy.

Benchmark: `node --import tsx scripts/benchmark-assembly.ts`, 60 pages × 12 parts
× 30 measures, 12,790 ms including worker startup/transfer; 2,594,197 provenance
bytes for this all-recognized-measure fixture. Profile: parsing 1,260 ms, merging
3,525 ms, validation 5,508 ms, serialization/range compression 1,264 ms; internal
assembly total 11,664 ms. The <3,000 ms target is NOT met. DOM validation/querying
and node import/merging dominate; replacing those with an ordered compact/streamed
representation while preserving all notation remains the performance follow-up.
The benchmark contains no inferred rests, so its sidecar size does not demonstrate
the synthetic-range compression savings (the 30-measure range regression does).

Verification:

- `npm run typecheck`: passed.
- `npm test`: 227/227 passed, including the concurrent transcription UI suite.
  Evaluation tests use unique temporary directories to prevent concurrent test
  processes from interleaving JSONL artifacts.
- `npm run build`: passed; `npm run check:secrets`: passed positive control and
  clean final client scan, with no public source maps.
- `npm run db:generate`: no drift after committing migration 0011.
- `npm run eval:transcription -- --dry-run`: 8/8 two-page offline jobs completed,
  synthetic fixture F1=1, no provider/network request and no live quality claim.
- `npm run test:browser`: passed in the coordinated Phase 4c run, including full
  account/design and three-client sync/offline/count-in/sleep/restart acceptance.
  Earlier overlapping builds caused invitation-navigation failures; final runs
  serialize builds. Evidence: `.review-evidence/p4c-standard-browser.log`.
- `npm run test:integration`: final full run passed 77/77 (305,449 ms).
  Earlier failures were corrected test fixtures: explicit integer casts in
  interval arithmetic and selecting an unpriced HTTP bucket in the configured
  UTC zone rather than assuming the New York SQL bucket. Targeted regressions
  also passed. Evidence: `.transcription-tmp/eval-integration-green.log`.

No live model/account availability, real-score accuracy, acceptance threshold or
production cost is established by these tests. All commits remain local.

### Phase 4c design pass — 2026-11-04

Start sheets now follow the members sheet heading/× close, ruled title field,
mono pencil labels, DE·EN-style lyric-language chips, existing file/camera icons,
gold selection borders and a full-width primary pill. Job cards use repertoire
card grounds/borders, pencil stage text, a ready-only Review pill and quiet ⋯ menus.
Review uses theme ink on the player's paper ground, crops to engraved content
(including annotations), fits width with a 1.8× natural-scale/900 px cap and places
short systems in the upper third. Circled warm-red exclamations replace warning
ticks; gold questions identify uncertainty. Primary import and a compact secondary
row replace the stacked actions. The shared capability switch remains gold on.
Counts and page totals handle singular/plural in DE/EN; German sizes use commas.

Evidence: `/tmp/aicap-p4c-design/shots/index.html` (77 PNGs, linked lightweight
WebP thumbnails). Matrix: DE/EN × 390/1440 × auto dark/auto light/explicit Papier;
empty/photo/error start sheets, running/ready/failed/paused/cancelled job cards,
and review with original off/on. Terminal job-list visual fixtures reuse a real
FakeProvider result so every state is reproducible without a paid provider.
Existing functional acceptance still exercises actual upload/reorder, pause,
cancel/retry, playback, idempotent import and live capability changes. Contrast
assertions include labels, chips, errors, cards, primary/secondary actions,
warning/uncertainty glyphs and notation; six unit cases cover zero/one/two counts.
Existing file/camera icons were reused because they already match the requested
stroke style. Provider-authored free text remains verbatim, as in Phase 4c.

Validation: `npm run typecheck` passed; `npm test` passed 233/233;
`npm run build` passed; `npm run test:integration` completed 77/77 with no
failures; `npm run test:browser` passed Phase 2b/theme, two-account and full sync
acceptance (including loops/restart/account isolation); and
`PATH="$PWD/.review-evidence/bin:$PATH" BROWSER_EVIDENCE=/tmp/aicap-p4c-design npm run test:browser:transcription`
passed all transcription acceptance and visual/contrast assertions. The PATH
prefix uses the checkout's existing local Poppler runtime for original PDFs.
`npm run check:secrets` passed the positive control and clean-client checks;
`npm run db:generate` reported no schema changes. The initial browser attempts
exposed missing Poppler on PATH and contrast/fixture-assertion issues, corrected
before the successful run. An initial integration command ended with status 143
after check 61; the bounded rerun completed all 77 tests. Logs are retained as
`.review-evidence/p4c-design-{typecheck,unit,build,secrets,db,standard-browser,browser-verified,integration-final}.log`.
No push, deployment or OpenAI calls.

### Phase 4 final fixes — 2026-11-04

B1: note/pitch/duration anchors use staff and measure-local quarter time, with
multiset matching; onset excludes pitch. Pitch is scored at matching onsets.
Voice streams have a separate content metric, independent of exporter labels.
Comparison uses **written pitch**; transpose metadata does not convert to sounding
pitch. Sequence alignment retains duplicate measures; parts retain multiplicity.

- S1: page rendering uses its own two-global/two-user admission, four queued
  requests and a two-second queue deadline. Request abort and 20-second timeout
  combine. Authorized PNGs use a 32 MiB memory LRU keyed by object/page/250 dpi;
  no derived object can remove an original. Access audits coalesce per user/object
  for ten minutes, with bounded bookkeeping. Responses include sandbox/no-store.
  Review caches page blob URLs and aborts superseded requests, revoking on close.
- S2: landing ensemble changes immediately reconcile the transcription scope and
  jobs. Start rechecks current scope after loading server limits; its heading names
  the destination ensemble. Browser regression switches then creates a job there.
- S3: shared title schemas reject >200 characters, NUL and malformed Unicode;
  remove controls, bidi and zero-width formatting; normalize and trim. Piece create,
  rename, job creation and import use this boundary. Empty job titles derive from
  the sanitized first filename without extension. Import sends no ignored title.
- S4: every heartbeat tick checks monotonic staleness before its busy guard, using
  one interval of lease margin. Authorization, pause and render awaits race abort.
  Pool queries/statements time out at five seconds, and configured leases have a
  ten-second minimum. Tests include persistent failure, hung renewal and rendering.
- S5: duplicate part names rank content profiles before order fallback. Swapped
  Piano registers with one wrong note in each four-note stream score 0.75.
- S6: photos decode at 200 px, use OffscreenCanvas when supported (canvas fallback)
  and retain only thumbnail URLs. Drag supplies Firefox transfer data. Upload
  size/page limits come from the authenticated config endpoint. Excess photos show
  an error. PDF counting runs during server upload inspection, without main-thread
  pdf-lib; the pre-upload page count for a PDF is consequently provisional.
- S7: negative read/render/options tests cover plain members, outsiders, mismatched
  ensemble IDs, page bounds, PNG/no-store/sandbox headers and concurrent rendering.
  Browser coverage injects HTML into provider reason/part and asserts plain text.
  FakeProvider now produces valid complete scores plus continuation state, exercising
  the common validation path. Legacy checkpoint upgrade is tested explicitly.
- Additional fixes: imported jobs filter in SQL; socket progress fetches only the
  changed job, reusing the account socket. Provider uncertainty fields are capped
  at 500 characters and 200 items before persistence. Truncation reviewReason stores
  a localized code. Listening asks before leaving an active shared rehearsal; its
  temporary Solo mode is not saved, is restored on return, and preview entries are
  removed on review close/return. Option edits regenerate a failed request's key.
  Usage includes failed_calls and completed/failed latency percentiles. Migration
  0012 drops the unused model/started_at index. Legacy validation now also matches
  normalized names; both validation paths honor no_music before parsing.
- Landlock permits writes only in the task's render/upload temporary directory
  (plus /dev/null); runtime code is read-only. A regression proves sibling writes
  fail. RLIMIT_CPU is five seconds soft/six hard per process, including Poppler;
  pathological pages can therefore fail rendering before the wall-clock timeout.

Known limitations and operator handoff: measure alignment and duplicate-part
pairing remain deterministic heuristics, and the separate voice-stream metric is
content-sensitive. No sounding-pitch conversion or live recognition quality claim.
Page previews are process-local caches, with no cross-process cache/admission.
The extreme 60×12×30 assembly benchmark remains **12.8 seconds**, above the three-
second target; compact/streaming assembly is follow-up work. Overlapping crop retry
remains deferred pending a safe deduplication policy. A first live evaluation needs
an operator-provided OPENAI_API_KEY, explicit `--confirm-paid`, realistic licensed
fixtures with references, and agreed musical-quality/cost acceptance thresholds.
No OpenAI requests, production access, deployment or push occurred in this pass.

Phase 4 is closed for the authorized local implementation scope. Live provider
quality and production rollout remain operator work, as described above.

Final verification:

- `npm run typecheck`: passed.
- `npm test`: 242/242 passed; final metric-specific rerun 17/17 passed.
- `npm run build`: passed; browser and secret harnesses also rebuilt final sources.
- `npm run test:integration`: 80/80 passed (315,134 ms). Targeted contract/usage/
  concurrent-render rerun also passed 7/7 before the complete green run.
- `npm run test:browser`: passed account/design matrix, two-account synchronization
  and full three-client acceptance, including looping, offline, count-in, sleep,
  restart and account isolation.
- `PATH="$PWD/.review-evidence/bin:$PATH" BROWSER_EVIDENCE="$PWD/.review-evidence/final-browser" npm run test:browser:transcription`:
  passed the full matrix and acceptance, including new destination-switch,
  configured-photo-limit and hostile provider text cases. Actual listening and
  idempotent import pass after fixing the deferred dialog-close cleanup race.
- `npm run check:secrets`: passed positive control, clean final client artifacts
  and no public source maps.
- `npm run db:generate`: no schema drift after migration 0012.
- `npm run eval:transcription -- --dry-run`: eight offline jobs completed,
  synthetic fixture note F1=1. No network/provider call or live quality claim.

Evidence: `.review-evidence/final-{typecheck,unit,build,integration-green,
standard-browser,transcription-browser-verified,secrets,db-drift,eval}.log`;
transcription screenshots: `.review-evidence/final-browser/shots/index.html`.
Earlier failed logs remain retained: the first integration overlapped a build;
subsequent failures identified stale assertions for intentional response/status
changes. Browser verification caught and fixed deferred cleanup deleting a newly
created preview; the new switch fixture was then made deterministic before
hydration. The serialized final runs above are green. All commits remain local
on production-v1; nothing was pushed.


### Phase 5a — private offline rehearsal (2026-11-04, AICAP-7)

The worker now uses an exact build-generated public asset allowlist. It precaches
only a generated, data-free fallback shell, hashed scripts/styles/fonts (including
PDF fonts/Verovio), bundled sample music and piano samples. Runtime HTML and every
API/auth/admin/invitation/original/signed/realtime URL bypass shared caching.
Existing HTTP middleware keeps API and HTML responses no-store. Activation removes
legacy ai-capella/public worker caches; private account stores never belong to the
worker. Updates wait for an explicit reload notice rather than activating during
rehearsal. The initial installation does not show an update notice.

The page owns IndexedDB databases named lightscore-private:<encoded account>:<encoded
ensemble>, with immutable piece-id/content-hash body keys, current metadata/settings
and an ensemble catalogue. A separate account identity record stores the last
verified memberships and verification instant. Offline access defaults to 14 days;
VITE_OFFLINE_WINDOW_DAYS may shorten this to 1–14 days at build time. Clock rollback,
expiry and missing identity deny offline access. This is device-local access policy,
not encryption against someone controlling the browser profile.

Heading and piece menus prepare/evict repertoire, show usage, gold cloud/check marks,
progress and cancellation. Preparation waits for the public shell/assets to be ready.
Prepared versions/settings refresh after authorized library events and reconnects.
Offline reload lists the stored catalogue; unprepared pieces are disabled. Solo,
staff rendering and PDF export use local assets. Together, imports/editing, membership
management and transcription require connectivity; no playback or edit commands are
queued. Offline logout clears private access immediately and retains only a pending
sign-out operation for the server when connectivity returns.

Logout/account switching remove all account databases and private in-memory context,
including private local imports; the invitation account-switch path also purges.
Other tabs learn logout through storage events and ensemble revocation through a
BroadcastChannel. Fresh online membership checks purge revoked ensemble copies and
clear their visible/hidden UI. Remote revocation cannot erase an already downloaded
copy on a disconnected device; it is enforced when the device learns of revocation
or reaches its bounded offline access expiry.

Browser harnesses use separate build roots under .review-evidence so concurrent
verification cannot replace a running server's hashed chunks. Server/start and the
secret scanner support LIGHTSCORE_BUILD_ROOT; ordinary builds still use dist.

Validation (local production-v1, no push or deployment):

- `npm run typecheck`: passed.
- `npm test`: 249/249 passed, including route allowlist, namespace isolation,
  account/ensemble purge, blocked pending writes after logout and bounded access.
- `npm run build`: passed; generated worker and data-free fallback shell included.
- `npm run test:integration`: 82/82 passed.
- `npm run check:secrets`: positive control detected; every client artifact,
  including sw.js, clean; no public source maps.
- `npm run db:generate`: no schema changes or drift.
- `npm run test:browser`: complete account/design matrix, Phase 5a acceptance,
  two-account sync and full three-client acceptance passed, including offline,
  count-in, sleep, loops and restart. Final focused Phase 5a reruns additionally
  verify Together/edit disabling, two-tab revocation clearing and offline logout.
- `git diff --check`: passed.

Focused acceptance covers ensemble preparation, offline reload/audio/staff/PDF,
background version refresh, the waiting-worker notice, membership revocation,
A logout/B offline isolation, offline logout and expiry of the access window.
No paid provider, real email or production service was used. No data schema was
added by Phase 5a. Earlier failed logs remain retained: overlapping dist rebuilds,
a removed Vite CSS facade in the first manifest, and an update notice intercepting
menu clicks. The harness now isolates build roots, manifests enumerate final files,
and notices require an existing active worker and sit beneath menus.

Evidence: `.review-evidence/phase5a-{typecheck,unit,build,secrets,db}.log`,
`phase5a-integration-final.log`, `phase5a-all-browser-green.log`, and
`phase5a-offline-final-verified.log` (all beneath `.review-evidence`).

Phase 5a implementation commit: `61709d4`. All commits remain local on production-v1.


### Phase 5b — sysadmin oversight (2026-11-04, AICAP-20)

Implemented the separate `/admin` area with users, ensembles, pieces, audit and
transcription tabs. The LightScore/Bodoni header, warm-red rule, mono navigation,
search/filter tables, keyboard rows, cursor pagination and responsive detail
panels support German/English and dark/light/Papier. The normal account sheet
fetches a fresh online admin-link decision without blocking offline controls.

Every admin page/API checks the current verified session and explicit PostgreSQL
`sysadmin` role. The boundary conceals unauthorized/unknown admin routes with 404
before origin/body validation; authorized mutations retain the trusted-origin
check. No signup/ensemble capability promotes a user. Server-only provisioning:
`npm run admin:grant -- <email>` / `npm run admin:revoke -- <email>`, requiring
DATABASE_URL and an existing verified email. Both commands audit; revocation is
immediate on the next request. There are no admin socket subscriptions.

Safe projections expose account/session aggregates, coarse device groups,
memberships/capabilities/leads, invitation states, piece/version/original
metadata and job summaries. Private detail reads are audited; credentials,
session identifiers/tokens, invitation hashes, object keys, provider prompts and
score bodies are absent from oversight lists. Content/original actions require
an explicit audit confirmation with optional reason. Downloads use the existing
private-storage signing mechanism with a 60-second lifetime. There is no
impersonation, global deletion, UI role editing or unrestricted export.

The Phase 4 usage/metrics and emergency-stop APIs are now behind the unified
boundary. Ops includes usage/cost/unknown-cost cards, per-group p50/p95 latency,
failure counts, jobs, and stop status with actor/instant/reason. Stop changes
require a nonempty reason and write an audit event. All admin APIs share a
persistent 120-request/minute actor limit; content/download actions additionally
share 10/minute. Lists default to 30 and cap at 100, with indexed search/order
and bounded detail sub-lists. Migration 0013 adds ordering/audit and pg_trgm
substring indexes. Timestamp cursors preserve PostgreSQL microseconds.

Offset-qualified filters use half-open ranges. Admin JSON instants carry the
configured APP_TIME_ZONE offset; array responses identify the zone in a header.
The central admin UI formatter always renders the explicit zone and offset.
Tests run under a non-UTC process zone and cover Berlin midnight/DST transitions.

Runbook and complete endpoint table: `docs/SYSADMIN.md`. Historical last sign-in
is limited to still-retained active sessions; earlier phases did not persist a
historical sign-in ledger. Production provisioning/deployment and independent
review remain operator/parent work. No paid providers, real mail, push or
production access occurred.

Verification:

- `npm run typecheck`: passed, including the final API offset changes.
- `npm test`: 248/248 passed.
- `npm run build`: passed, also exercised by final isolated browser/secret builds.
- `PATH="$PWD/.review-evidence/bin:$PATH" npm run test:integration`: 82/82 passed.
  Final focused admin/security/usage/control rerun: 7/7 harness cases passed;
  additional midnight/DST formatter and credential-sentinel checks passed.
- `npm run check:secrets`: final isolated positive control and clean client scan
  passed, with no public source maps.
- `npm run db:generate`: no schema changes after committed migration 0013.
- `BROWSER_SCRIPT=scripts/browser-admin.mjs npm run test:browser`: passed all
  tabs, search/detail, stop/resume with reasons, audited content confirmation,
  non-sysadmin 404, DE/EN, three themes at 1440/390, and AA text contrast >=4.5.
  Contact sheet: `/tmp/aicap-p5b/shots/index.html` (23 screenshots).
- `npm run test:browser`: final isolated run passed the complete account/design,
  offline, two-account sync and three-client acceptance suites, including loops,
  count-in, sleep, restart and account isolation.

Evidence: `.review-evidence/p5b-integration-final.log`, `p5b-offset-integration.log`,
`p5b-exposure-final.log`, `p5b-server-dst.log`, `p5b-final-unit.log`,
`p5b-typecheck-green.log`, `p5b-secret-final.log`, `p5b-db-green.log`,
`p5b-admin-offset-final.log` and `p5b-standard-final.log`. Earlier failed logs are
retained: fixture setup respected signup acknowledgement/last-lead constraints;
old anonymous usage assertions were corrected to the required 404 contract;
concurrent builds and the Phase 5a update banner initially obstructed browser
checks. Separate build roots and the Phase 5a banner fix resolved those failures.

Implementation commits: `2c493d9`, `338474e`, `90c03c8`. Shared main/package hunks
were staged separately from Phase 5a; its work was preserved. All commits remain
local on production-v1. This Phase 5b plan entry is committed separately.

### Phase 5a fixes — 2026-11-04

Review remediation on `production-v1`, concurrent with the sysadmin fixes. No
provider calls, deployment, push, or production infrastructure changes.

- B1: the expired/signed-out landing page purges the remembered account; a landing
  `/api/me` 401 also purges. `/app` serves its public shell so the client clears
  private stores before redirecting on a failed identity check. Every app start checks the stored access expiry before
  checking the online session. Offline expiry denies rehearsal and clears data.
- S1: score version bodies use `private, no-cache` with ETag authorization checks;
  both browser body-fetch paths use `cache: 'no-store'`. Sign-out sends
  `Clear-Site-Data: "cache"`; account IndexedDB deletion remains targeted rather
  than issuing a blanket storage wipe.
- S2: each prepared-piece refresh catches its own failure, retains its prior copy,
  and emits a small localized refresh notice. HTTP 500s from currently displayed
  scores also preserve online controls and can use the prior prepared body.
- S3: identity persistence/reconciliation runs outside online sign-in completion.
  IndexedDB failures disable offline preparation and show its unavailable state;
  online account and catalogue requests continue.
- S4: explicit ensemble eviction is broadcast independently of revocation. Other
  tabs clear their prepared marks without losing membership. A localStorage epoch
  per account/ensemble fences pending writes and delayed catalogue hydration.
- S5: the first successful preparation requests persistent storage once; storage
  estimates and persistence status appear quietly with usage. Quota exhaustion
  has the specific German offline-storage message. Safari may evict browser data
  earlier than the access window, especially for inactive sites; neither a
  persistence request nor the 14-day policy promises 14 days of retained data.
- S6: unpreparing one piece invalidates only that piece's pending preparation.
  Bulk preparation continues after failures and reports skipped/failed totals.
- N1: verification instants come from successful `/api/me` HTTP Date headers.
  A clock behind that instant denies offline access without deleting the copy;
  deletion requires clear positive expiry. Windows are elapsed durations, not
  local calendar-day calculations, and remain independent of DST.
- N2: the worker matches the navigation pathname, including `/app/` and `/app?x`.
- N3: the account section's default-off shared-device setting caps offline access
  at 24 hours. Residual shared-tablet risk remains: anyone using the same unlocked
  browser profile can read its prepared scores within that window. This is not
  encryption, and remote revocation cannot erase disconnected devices immediately.
- N4: destructive reconciliation rechecks current memberships and rejects stale
  refresh generations before deleting a store.
- N5: install caches the data-free shell and JS/CSS; large public samples, fonts
  and WASM warm on first browser idle (bounded fallback) or explicit preparation.
  Preparation waits for the full asset-cache acknowledgement. Stale lazy-chunk
  loading failures prompt the user to reload.
- N6: pending offline sign-out is sent to the server on the next online app or
  landing entry; success clears the flag and does not get overwritten by the
  app route's generic expired-session redirect.
- P1: piece rename persists the parsed shared `pieceTitle` value.
- P2: title newlines/tabs become spaces; tag characters, soft hyphens and Unicode
  line separators are removed. Filename-derived titles truncate on code points.
- P3: measure fingerprints sort note/rest multisets while retaining duplicates;
  regressions cover voice/chord order, dropped measures (10/11 F1) and voices.
- P4: both context queries and provider-call insertion race abort before provider
  invocation. Worker query/statement timeouts are scoped away from admin/usage.
  Config has a direct authenticated route regression, render/lease hangs have an
  explicit test timeout, and preview mode is captured with `??=`.

Verification evidence is retained in `.review-evidence/fixes-*.log`; failed
intermediate runs remain available. Poppler was absent on the host: browser PDF
preview validation uses a local extraction under `.review-evidence/poppler`,
with its executable directory added to PATH; no system installation was changed.


Phase 5a fixes verification (local, no push):

- `npm run typecheck`: passed (`fixes-typecheck-final.log`).
- `npm test`: 260/260 passed (`fixes-unit-final.log`).
- `npm run build`: passed (`fixes-build-final.log`).
- `npm run test:integration`: 86/86 passed (`fixes-integration-final.log`).
  Additional focused runs passed worker abort/config/timeout scoping and the
  cache-clearing/session-revocation route (`fixes-worker-focused.log`,
  `fixes-logout-focused.log`).
- `npm run check:secrets`: positive control detected; client artifacts clean
  (`fixes-secrets-final.log`).
- `npm run test:browser`: complete account/design matrix, Phase 5a, two-account
  sync and full three-client acceptance passed, including sleep, loops, output
  offset, bfcache, process restart, revocation and account switching
  (`fixes-browser-all-green.log`).
- `PATH="$PWD/.review-evidence/poppler/bin:$PATH" npm run test:browser:transcription`:
  passed (`fixes-transcription-final.log`).
- Focused Phase 5a browser acceptance also passed with an explicitly primed
  HTTP-cache request before logout (`fixes-offline-cache-verified.log`).
- `npm run db:generate`: no schema changes/drift (`fixes-db-final.log`).
- `npm run eval:transcription -- --dry-run`: all eight recorded fixture sets
  completed without provider calls (`fixes-eval-final.log`).
- `git diff --check`: passed.

The repeated-measure/voice-order differential probe scores 0.7272727 on the old
implementation and the expected 0.9090909 after the fix
(`fixes-reference-red-proof.log`). Plane MCP was unavailable in this session;
existing project mapping was preserved and no remote ticket update was claimed.
Implementation commits: `4c2b1cc`, `3ec7cb7`, `351136a`. The concurrent agent's
admin implementation and plan entry remain separate from these owned commits.

### Phase 5b fixes — 2026-11-04 (AICAP-20)

Review findings verified against production-v1 at 73d54fa. Implementation commit
`a0d01c7` hardens the decoded/trimmed, case-insensitive server boundary and adds a
DB-checked server-function route loader. Router-derived enumeration covers all
registered admin APIs and page tabs for anonymous/member/lead/manager callers,
including HEAD/OPTIONS, case and encoded variants. A router-ownership assertion
fails when an admin endpoint is registered outside the guarded router.

Every collection read now audits endpoint, filter keys, ID filters only and row
count; memberships have their own action. Primary/version/original lists have
30/min actor limits; content/downloads share 10/min, 30/hour and 200/day persistent
caps, clear 429 messages and structured `admin.cap_hit` warnings. The runbook
records the log-alerting hook. Content/download reasons are mandatory. Piece and
ensemble-targeted audits carry ensemble scope; the audit UI shows reason excerpts.
Cursor types are validated; NUL/unpaired-surrogate input is rejected; PostgreSQL
class 22 maps to 422. Versions paginate by `(version_no DESC,id ASC)`. JSON numeric
fields remain numbers; piece created/updated sorts are independent. CLI audits
record changed:boolean and actual OS username/SUDO_USER/hostname; rollback failure
cannot mask the primary error.

Admin design follows the Phase 2 ruled/pencil/ink vocabulary: full-width warm-red
header hairline, DE·EN text toggle, relevant per-tab filters, calendar-date fields,
7/30/90/All presets, automatic 300ms filtering, enum chips, one localized zone-aware
formatter with ISO tooltips, × panel close, mono section headings/IDs, copy buttons,
text booleans and capability chips. Bounded initial detail sections share one
endpoint; deleted records stay in the panel and 429 preserves the specific message.
Transcription has distinct localized usage/token/cost cards, localized failure
tables, real latency values and the shared switch styling with reason/confirmation
and a warm-red stop action. Tables have sticky headers and become cards at 390px.

Calendar-date conversion and statistics default to seven business-zone calendar
days including today, ending at tomorrow's midnight. Berlin spring/autumn DST,
near-midnight behavior, UTC DE/EN formatting and numeric-offset fallback are tested
under a different process zone. The All statistics preset reads all retained calls;
ensemble filters also apply to usage/failures. Migration 0014 adds membership
(created_at,id), audit(action,id) and job-ID trigram indexes. The Drizzle migrator
is transactional, so CONCURRENTLY is unsupported; the maintenance-window caveat
is documented in SYSADMIN.md. `db:generate` reports no drift.

Commit `d9728f1` adds sort/offset regressions and aligns two stale cross-suite test
assertions with the concurrent private-store changes: `/app` serves a no-store
shell for cleanup before client redirection, and “This device” uniquely targets
the session description rather than the new shared-device checkbox.

Final verification: typecheck passed; npm test 260/260; build passed; secret
positive-control and clean-client scan passed; focused admin/time/CLI 9/9 harness
cases passed, with subsequent enumeration/sort/offset reruns green. The admin
browser suite passed with 35 screenshots and AA ink/pencil/gold contrast >=4.5
across dark/light/Papier, DE/EN and 1440/390; deleted-record and specific-429 UI
regressions passed. Contact sheet: `/tmp/aicap-p5b-design/shots/index.html`.

Initial full integration run: 83/84, failed only the stale `/app` redirect
assertion. Initial standard browser run: stale “This device” strict locator.
Both are fixed in d9728f1. A second integration attempt read stale root dist SSR
and failed the opposite /app expectation; a focused account run against the fresh
isolated build confirmed the correct behavior. The default dist was also rebuilt.
Final `LIGHTSCORE_BUILD_ROOT="$PWD/.review-evidence/fixes-verified-build"
PATH="$PWD/.review-evidence/bin:$PATH" npm run test:integration`: **87/87 passed**.
Final `npm run test:browser`: **passed** account/theme, Phase 5a offline boundary,
two-account sync and full three-client acceptance (loops/count-in/sleep/restart).
The prior Phase 5a sign-out-header failure came from a build predating the other
agent's fix in 4c2b1cc; the final run includes that fix.

Commit 1b4bb53 strengthens the router ownership assertion to include wildcard and
ALL registrations (Hono wraps mounted handlers, so ownership compares the full
method/path multiset). Commit 4cfffd8 prevents row key handling from intercepting
the ID copy button, with a keyboard-copy browser regression. The final admin run
still passed all 35 screenshots/AA checks. Final command evidence:
`p5b-fixes-integration-verified.log`, `p5b-fixes-standard-browser-verified.log`,
`p5b-fixes-admin-keyboard-green.log`, `p5b-fixes-unit-last.log`,
`p5b-fixes-default-build.log`, `p5b-fixes-secrets-verified.log`,
`p5b-fixes-typecheck-final.log`, and `p5b-fixes-db-final.log`. Failure evidence is
retained in `.review-evidence/p5b-fixes-integration.log` and
`p5b-fixes-standard-browser.log`; final evidence uses `p5b-fixes-*-green.log`,
`p5b-fixes-admin-browser-complete.log`, `p5b-fixes-secrets-final.log`,
`p5b-fixes-types-verified.log` and `p5b-fixes-build-final.log`.

All changes stay local on production-v1. Only owned admin paths and the small
HTTP admin-guard hunk were staged; concurrent private/offline changes were
preserved. No push, production access, paid provider calls or real mail.

### Phase 6a — legacy migration tooling (2026-11-04, AICAP-10)

Implementation commit `c4a7414` adds operator-only Firestore export, transactional
import/dry-run, reconciliation, delta/conflict handling and downloaded-backup
rollback rehearsal. Developed exclusively against `demo-migration` emulator data
and disposable PostgreSQL; no real Firebase connection, prototype mutation,
production export/import, email delivery, freeze, cutover, push or retirement.
Operator procedure and release checklist: `docs/MIGRATION.md`.

The Admin exporter uses one read-only transaction for consistent collection and
nested membership queries, JSONL binary/timestamp encoding and a final complete
manifest with counts, size, SHA-256 and UTC start/end/read time. Outside the
loopback emulator it requires explicit production-read acknowledgement and an
operator-provided read-only credential. The import verifies the complete manifest
before database work; legacy codes/memberships/sessions/clock pings and public
samples are intentionally skipped and counted. Malformed/orphan/unknown-ensemble
songs are quarantined in reports only, never silently made public.

The `legacy_import_map` records source project/collection/document identity,
legacy content hash, new entity and post-import fingerprint. Each ensemble uses
one locked transaction; dry-run checks deferred constraints then rolls back.
Reruns are no-ops; changed legacy content creates an immutable version, sort-only
changes retain the version, and edited destination metadata/settings/order/version
or provenance causes a conflict. Source deletions are flags unless explicitly
applied; edited deletion targets are protected. Ensemble name deltas synchronize
against their own import baseline. The importer uses shared domain score
validation/timing/version insertion, title sanitization and granular settings
schemas. Original-byte SHA and all unmappable legacy metadata/settings survive in
provenance; reconciliation compares per-field settings/provenance, counts/order,
normalized content, app-parser notation summaries and stored/recomputed timing.

Leadership comes only from a reviewed operator JSON mapping (JSON chosen over
YAML to keep the input boundary strict), whose hash is included in the report.
Imported ensembles initially have zero members and explicit `awaiting_lead` state,
visible through sysadmin oversight's zero-lead/member counts and import reports.
Migration-only `lead` invitations require verified matching-email acceptance;
the normal invitation API cannot create/convert/resend these grants. Acceptance
clears awaiting-lead and normal last-lead constraints remain active. No anonymous
UID becomes an account. No sending by default; explicit sends use the normal
mailer after commit, with capture only in tests. Private JSON reports hold initial
unsent links; explicit resend rotates them. UTC and configured-zone instants are
both included in reports, independently of process TZ.

`npm run test:migration` owns random ports/containers and covers 3 ensembles,
plain/default MusicXML, >900 KB raw gzip, native score JSON, all legacy settings,
odd sort keys, skipped transient documents and bad/unassigned records. It runs
export → dry-run → real import → reconcile, checks idempotence and CLI JSON/MD
reports, legacy version/name deltas, destination conflicts, flagged/applied
source deletion, captured invitation sending, correct/wrong-email acceptance,
app parse/timing and actual headless PDF preparation. Firestore write-method
spies record zero calls during export/import/reconciliation, and source-state
hashes remain unchanged through import and rollback. The pre-import dump is
captured inside the owned DB container over its local socket, copied as binary,
and checked against independent server SHA/size before fully restoring the
downloaded archive. Post-restore reconciliation correctly reports missing imports;
accounts and pieces return to their pre-import counts. The rehearsal's restore
script refuses containers outside its disposable naming convention. The first
shared-backup-helper attempt failed environment forwarding under rootless Docker;
that failed evidence was retained, and the direct local-socket rehearsal path
avoids that external dependency. This does not replace Phase 6b's DB/object
backup verification or manual production recovery approval.

Verification: `npm run typecheck` passed; `npm test` **260/260** passed;
`npm run build` passed with isolated `LIGHTSCORE_BUILD_ROOT`;
`npm run test:integration` **87/87** passed; `npm run check:secrets` passed
(positive control and clean browser artifacts, no migration Firebase dependency
in the client); `npm run db:generate` reported no drift; new
`npm run test:migration` passed, including its separate migration-script
TypeScript check under non-UTC process TZ. `npm run test:browser` passed the
complete account/theme, offline-cache, two-account and three-client acceptance
suites, including sleep, count-in, loops, real server restart, revocation and
account switching (exit 0). Logs: `migration-test-final3.log` and ignored
`migration/.runtime/{unit,integration,build,secrets,typecheck-final,browser}.log`;
synthetic snapshots/backups/results remain in ignored per-run runtime directories.
All staging/commits used explicit owned paths and a separate index to preserve
the concurrent Phase 6b work. The validated Plane project mapping was retained;
AICAP-10 received the implementation/evidence update.
