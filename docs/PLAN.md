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
