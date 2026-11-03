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
| play, pause, seek | yes | Depend on selected piece, position and transport state |
| setLoop, playStartingTones | yes | Depend on selected piece/range |
| selectPiece | no | Absolute piece and version selection |
| stop | no | Unconditional stop and rewind |
| setTempo, setTransposition | no | Absolute transient setting |
| setMetronome, setCountIn, setStartingTones | no | Absolute preference |

A future baseRevision is always stale. Checked commands require equality;
unchecked commands accept older revisions. Expiry is 5 seconds (also rejects
client timestamps over 5 seconds ahead). Accepted command IDs are remembered per
ensemble for 10 minutes, capped at 1000, in process memory; restart clears that
window, so reconnect MUST discard pending commands. Per-socket token bucket:
20 command burst, refill 20/second, including invalid inputs.

Authenticated `/rehearsal` events (callback acknowledgements):
- `rehearsal:join {ensembleId}` and `rehearsal:snapshot {ensembleId}` return
  `{state}` or `{code}` and subscribe to `rehearsal:<ensembleId>`.
- `rehearsal:command <Envelope>` returns `{commandId,status,revision? ,code?}`.
  Accepted state commits to rehearsal_sessions before `playback:state` fanout to
  every room subscriber, including the sender. Concurrent commands share one
  per-ensemble promise queue; snapshots, deletion and end transitions use it too.
- `clock:ping` takes just a callback, returning `{serverTime}` from
  performance.timeOrigin + performance.now().

Membership is cached on each socket, invalidated by existing membership events;
removal leaves the playback room and rejects subsequent controls. Auth revocation
continues to disconnect sockets immediately through the existing hook. Session
expiry is checked locally for every control; the existing batched session poll
remains a fallback. A command does not reload the auth session from Postgres.
Piece/version tenant ownership is checked server-side. Score parsing and timing
metadata extraction reuse the bounded two-worker/eight-waiter validation pool,
with a 30-second timeout. Derived timing promises are cached by content hash
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
reset on every other transition; preference fields remain explicit. Standalone
playStartingTones pauses and schedules tones without starting music. End timers
persist a stopped state at the final beat with a new revision and broadcast;
stop rewinds to zero. Piece deletion clears the selection and stops with a new
revision. All protocol times are numeric epoch-ms instants per this contract;
DB row timestamps retain timestamptz and logs UTC (the numeric transport is the
explicit exception to the engineering rule preferring ISO text boundaries).

**Restart:** startup gates joins/commands on recovery. Persisted playing or
countingIn sessions become paused at positionAt(state, recovery time), with
revision bumped and active pre-roll/end timestamps cleared. No auto-resume.
Nonmoving states retain their revision. A failed recovery fails closed and logs
an error. Snapshot after reconnect is the durable truth; broadcasts are not a
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
