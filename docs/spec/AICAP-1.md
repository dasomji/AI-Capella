# AICAP-1: Refactor AI-Capella: account-based ensembles, synchronized rehearsal and AI transcription

### Problem Statement

Ensemble members need a reliable way to access music pieces across devices, rehearse together, and turn PDFs/photos into usable notation. The existing application ties access to anonymous devices and reusable codes, limits score storage through Firestore document constraints, and relies on a scanning pipeline whose recognition quality has been unsatisfactory. Ensemble management does not yet reflect named users, invitations or independently delegated permissions.

The replacement must preserve existing repertoire, notation and rehearsal behavior while supporting choirs, bands and other ensembles. Development must leave the current application online uninterrupted, followed by a verified migration once the new version is ready. Provider credentials must remain server-side, and only authorized users may trigger AI processing.

### Solution

Build the replacement in a fork using TanStack Start, Drizzle ORM, PostgreSQL, Better Auth, Socket.IO and Resend, hosted on Railway. Users create email/password accounts, create and join ensembles, and receive email invitations. Each ensemble has an ensemble lead who can invite members and delegate ensemble-scoped permissions.

All current ensemble members can control the ensemble's shared synchronized playback in the initial release. Devices continue producing audio locally against an authoritative scheduled timeline. Offline rehearsal remains available for previously prepared repertoire.

Replace Audiveris with direct GPT-6.1 Sol PDF/photo transcription, with notation validation, durable progress and recovery. Prioritize high-quality notation and measure real processing costs before introducing monetary budgets or subscription pricing. Preserve original PDFs/photos indefinitely in private Railway object storage, using SeaweedFS in development.

Provide a separate sysadmin interface for oversight of all users, ensembles and music pieces. Migration asks existing users to create accounts and maps repertoire and ensemble leadership to verified new identities.

### User Stories

- As a new user, I want to create an account with my email and password, so that my identity is independent of a browser or device.

- As a user, I want to verify my email, so that invitations and account recovery reach the intended person.

- As a user, I want to sign in and out on multiple devices, so that I can rehearse wherever I am.

- As a user who forgets a password, I want an email recovery flow, so that I can regain access without losing memberships.

- As a user, I want expired or revoked sessions to be handled clearly, so that I understand when I must sign in again.

- As a user, I want to create an ensemble, so that I can organize a choir, band or other musical group.

- As an ensemble creator, I want to become its lead, so that someone is responsible for invitations and permissions.

- As a user, I want to belong to multiple ensembles and switch between them, so that I can participate in different groups.

- As an ensemble lead, I want to name and rename my ensemble, so that members can identify it.

- As an ensemble lead, I want to invite people by email, so that they can join using their own accounts.

- As an authorized member manager, I want to inspect, resend, revoke and expire invitations, so that membership remains manageable.

- As an invitee, I want the invitation to survive registration, sign-in and email verification, so that I arrive in the correct ensemble.

- As an invitee, I want wrong-account, expired or revoked invitations to explain why acceptance failed, so that I can resolve the issue.

- As an ensemble lead, I want to grant or revoke member-management permission, so that I can delegate administration.

- As an ensemble lead, I want to grant or revoke music piece edit permission, so that only authorized people change our repertoire.

- As an ensemble lead, I want to grant or revoke AI transcription permission separately, so that transcription access does not automatically grant editing rights.

- As an ordinary ensemble member, I want to view and rehearse available music pieces without edit rights, so that participation does not require administration privileges.

- As an ensemble member, I want permissions to be specific to each ensemble, so that a role in one group does not affect another.

- As an authorized member manager, I want to remove memberships, so that former members no longer access private ensemble material.

- As an ensemble lead, I want a safe way to transfer leadership, so that the ensemble does not become unmanageable when I leave.

- As a member, I want my ensemble's private repertoire, files and jobs isolated from other ensembles, so that knowing an identifier does not expose content.

- As an authorized music piece editor, I want to create, update and delete music pieces, so that I can maintain the repertoire.

- As an authorized editor, I want existing MusicXML, compressed MusicXML and MIDI imports preserved, so that the refactor does not remove usable material.

- As an authorized editor, I want to work with scores larger than the old document limit, so that complete pieces do not require database-specific workarounds.

- As an authorized editor, I want to change names, order and rehearsal settings without overwriting someone else's changes, so that collaborative maintenance is reliable.

- As a member, I want repertoire lists to load metadata efficiently, so that a small edit does not force every device to download every score.

- As a musician, I want voices, lyrics, rhythm, notation, repeats and saved overrides preserved, so that practice and PDF export remain musically useful.

- As a member, I want prepared repertoire available offline, so that rehearsal can continue without connectivity.

- As a user sharing a device, I want logout and account switching to clear private cached access, so that the next user does not see my ensembles.

- As an ensemble member, I want to start, pause, stop and seek shared playback, so that anyone in the ensemble can guide practice initially.

- As an ensemble member, I want shared piece selection, tempo, transposition, looping, metronome, count-in and starting tones to stay consistent, so that devices follow the same rehearsal.

- As a musician, I want mute and solo choices to stay local, so that practicing my part does not change what everyone else hears.

- As a member joining late or reconnecting, I want the current playback position, so that I rejoin without replaying stale commands or count-ins.

- As a member returning from mobile sleep, I want clocks and audio scheduling recalibrated, so that resumed playback is coherent.

- As an authorized transcription user, I want to upload a PDF or ordered photos, so that I can create usable notation from existing material.

- As an authorized transcription user, I want complete multipage transcription, so that changing voice counts or page boundaries do not silently drop sections.

- As a musician reviewing a transcription, I want uncertainty and incomplete output surfaced, so that valid XML is not mistaken for an accurate score.

- As a transcription user, I want progress and completed work to survive reloads and worker restarts, so that interruptions do not force a complete restart.

- As a transcription user, I want to cancel or retry failed work without repeating successful pages unnecessarily, so that processing remains predictable.

- As an authorized editor importing a transcription, I want repeated import requests to produce one music piece, so that retries do not duplicate repertoire.

- As a transcription user, I want a job to retain its original ensemble destination, so that switching ensembles cannot misfile the result.

- As an ensemble member, I want original PDFs/photos retained indefinitely and accessed privately, so that source material remains available for comparison and reprocessing.

- As a sysadmin, I want searchable overviews of users, ensembles and music pieces, so that I can understand activity and ownership across the application.

- As a sysadmin, I want ensemble leadership and assigned capabilities visible, so that I can inspect access relationships.

- As an ordinary member or ensemble lead, I want platform sysadmin access kept separate from my ensemble role, so that delegation cannot become platform-wide access.

- As the product operator, I want transcription quality, usage, retries, latency and cost measured, so that future optimization and subscription pricing use evidence.

- As the product operator, I want quality to take priority over arbitrary spending targets initially, so that the product's musical usefulness is established before budgets.

- As an existing user, I want the current app available while the replacement is developed, so that ongoing rehearsals are uninterrupted.

- As an existing user, I want to create a new account and recover access to migrated ensembles through verified mapping or invitations, so that private ownership is not guessed from anonymous device data.

- As an ensemble lead, I want all repertoire, settings and ordering reconciled during migration, so that the new version is ready before we switch.

- As an operator, I want tested backups, rollback and explicit legacy retirement, so that migration failures do not destroy the working system.

- As a German- or English-speaking user, I want account, invitation, ensemble and transcription messages in the supported language, so that the new flows remain understandable.

### Implementation Decisions

- Application architecture: Use TanStack Start with TypeScript for application routing and server routes/functions, Drizzle for PostgreSQL schema/queries/versioned migrations, Better Auth for accounts/sessions and ensemble membership integration, Socket.IO for live synchronization, and Resend for account and invitation email. Railway hosts the persistent Node application, PostgreSQL and transcription worker. Do not select additional frameworks or infrastructure merely to expand this scope.

- Domain vocabulary: Use ensemble for the group, ensemble lead for persistent group leadership, and music piece for repertoire content. A choir or band is a kind of ensemble. A future playback room is distinct from both an ensemble and a Socket.IO transport room.

- Accounts: Initial sign-in is email/password with email verification and password recovery. Keep user identity distinct from browser device and tab/connection identity. Use one authoritative membership model integrated with Better Auth; do not maintain competing permission stores.

- Permissions: Independently represent ensemble member management, music piece editing, and music piece AI transcription. New ordinary memberships have no music piece create/update/delete rights by default. The ensemble lead can invite people and change member capabilities within that ensemble. Member managers may manage invitations/members without acquiring platform sysadmin. AI transcription alone does not permit importing or editing a library piece: import requires music piece edit permission.

- Admin interpretation: For ensemble-level default editing rights, interpret the conversation's "admin" as the ensemble lead, distinct from platform sysadmin. This is the working interpretation recorded during planning, not an additional platform-wide music-edit role. Leadership transfer must protect against an ensemble unintentionally losing its final lead.

- Authorization boundary: Enforce current membership and capabilities for every server operation, socket connection/command, job and object access. Do not trust cached role flags, caller-supplied scope or CORS as authorization. Apply session/membership revocation to existing connections as well as new requests. Use validated requests, sanitized errors, trusted-origin protections and appropriate session cookie/CSRF behavior.

- Server-only secrets: Keep database, Better Auth, Resend, object-store and AI credentials in server runtime configuration and server-only modules. Prevent credentials entering client bundles, source maps, responses, logs, caches or committed examples. Production rejects development authentication bypasses.

- Persistence: Model users, ensembles, leads/memberships/capabilities, invitations, music piece metadata and content, settings, rehearsal state, uploads and durable jobs. Use foreign keys, stable identifiers, ensemble-scoped queries/indexes and transactional changes. Preserve raw MusicXML as text; use versioned JSONB for MIDI-derived score objects and flexible settings/overrides. Do not convert MusicXML into a generic JSON tree.

- Library behavior: Separate metadata listing from score-body retrieval and caching. Content hashes/versions identify bodies; granular or revision-checked changes prevent lost updates and repertoire reordering is atomic. Preserve saved tempo/transposition/sections, part names and clefs, removed/split parts, swing, sort order and existing format defaults. Retain current score rendering, musical timeline and PDF export capabilities.

- Initial playback policy: One shared synchronized session per ensemble, controllable by every current ensemble member. No exclusive conductor acquisition, takeover lock or music piece edit permission is needed for playback commands. Transient tempo/transposition or piece selection is distinct from persisting music piece edits/defaults.

- Playback protocol: Validate commands and serialize accepted updates per ensemble. The server assigns command identifiers, monotonic revisions and effective/start times, persists canonical state, acknowledges results and broadcasts to authorized clients including the sender. Reject duplicate, stale and expired buffered commands. State contracts explicitly reset count-in and starting-tone fields instead of accidentally retaining them through partial merges.

- Timing: Preserve local audio synthesis and future scheduled starts. Calibrate server-clock offset with multiple samples, refresh periodically and after sleep/visibility changes, and translate accepted times into local audio scheduling. Reconnect loads the latest snapshot before controls resume. Late joins skip expired pre-roll; effective-time tempo changes preserve musical position. Define safe end-of-piece and server-restart states. Mute/solo remains local. Start with one persistent server; document ordering/fanout and routing before introducing replicas.

- Invitation lifecycle: Persist ensemble, intended email, inviter, authorized capability grants, expiry and state. Verify matching account email before transactional, idempotent acceptance. Support revoke/resend with bounded sending and reliable retry behavior. Registration and verification preserve invitation context. Never grant platform sysadmin through an invitation.

- Transcription: Remove Audiveris and its recognition/correction dependency. Use the requested GPT-6.1 Sol model for direct PDF/photo transcription; verify API identifier, account access and supported input strategy during implementation rather than silently changing models. Produce complete validated MusicXML or a representation that preserves notation and exports faithfully. Keep page/measure/voice provenance, reconcile ties and musical context across pages, and never discard sections merely because the voice count changes.

- Quality: Validate nonempty musical content, timing, voices and expected notation rather than only XML syntax. Evaluate realistic multipage vocal/instrumental pieces, divisi, accompaniment, lyrics and imperfect photos against reference material. Surface refusals, truncation, uncertain assembly and review-required passages; distinguish structural validity from transcription accuracy.

- Durable work: Persist upload, job and page state, initiating user, destination ensemble, model/prompt versions and provenance. Workers claim/lease work and checkpoint progress. Recover abandoned active work after restart; retries reuse valid completed pages and idempotent import prevents duplicate pieces. Support cancellation, provider failures and readable progress. Recheck current permissions before processing and accessing results.

- Original storage: Store original PDFs/photos privately in Railway object storage and use SeaweedFS in development through a common S3-compatible storage interface. Persist scoped object references, size/type/hash and provenance in PostgreSQL. Authorize access rather than treating keys as credentials; any signed access is short-lived. Retain originals indefinitely, without age-based expiry. Temporary renders, partial uploads and derived artifacts have separate cleanup rules that cannot delete retained originals. Explicit deletion/account closure is separate from indefinite age-based retention and needs a deliberate lifecycle policy.

- AI cost policy: No initial monetary budgets, daily/monthly spending cutoff, cost-reservation system, subscription allowance or old two-scans-per-account product quota. First measure quality, token usage, retries, latency and cost per page/job; optimize while preserving high-quality notation, then decide budgets together with subscription pricing. Keep authentication, file validation, bounded rendering/decompression, concurrency, timeouts, bounded retries, idempotency and a manual emergency processing stop as operational protections. These do not impose a monetary product budget.

- Offline boundary: Preserve prepared repertoire and audio assets for local offline rehearsal. Exclude authenticated API responses, auth flows, admin data and signed object links from shared service-worker caches. Scope private offline content by account and ensemble; logout/account switch clears private access and old subscriptions. Offline devices do not enqueue stale global playback commands for replay. Revocation is enforced on reconnect; remote access cannot erase an already downloaded copy from a disconnected device.

- Sysadmin oversight: Provide paginated/searchable lists and details for all users, ensembles and music pieces, including ownership, membership and capabilities. Require an explicitly provisioned platform role for every admin request; do not automatically promote the first signup or ensemble leads. Initially provide oversight, not implied impersonation, destructive global actions or unrestricted export. Exclude password hashes, session tokens and secrets; audit private-content access and any separately authorized mutations.

- Time correctness: Store instants such as invitations, audit events, row timestamps and job leases as PostgreSQL timestamptz using timezone-aware Drizzle timestamps. Distinguish calendar dates and playback beat positions/durations from instants. Use an explicit centrally configured IANA display/business zone, initially UTC consistent with project configuration, unless the product later selects another zone; never rely on server locale. Timestamp text inputs require an offset or Z, outputs carry the configured offset, and logs use UTC. Use half-open reporting ranges; calendar logic must handle daylight-saving transitions rather than adding fixed 24-hour periods.

- Release approach: Develop in a fork with isolated deployment configuration, databases, buckets and credentials; keep the legacy app online during development. Preserve pure musical/audio behavior while moving application integration to the new framework. Provide reproducible local PostgreSQL/SeaweedFS setup, CI builds/migrations/integration checks, health checks, graceful shutdown and an operational runbook.

- Migration: Ask existing users to create email/password accounts; do not turn anonymous IDs into real credentials or infer leadership from browser storage. Export a consistent legacy snapshot, map ensemble leads through verification/reinvitation, import plain/compressed MusicXML and native score JSON idempotently, and reconcile counts/content hashes/settings. Flag malformed, orphaned and unknown-ensemble records. Rehearse final delta reconciliation, cutover and rollback while accounting for ongoing legacy edits. Any final write restriction is an explicit release decision, not permission granted by this spec.

- Recovery and retirement: Verify downloaded backups by size/hash and an isolated restore of the downloaded artifact. Recovery must include object content as well as database references. Preserve legacy recoverability until acceptance; inventory live endpoints and explicitly retire obsolete Firebase/Function and Audiveris services only through a verified release process. Existing endpoint exposure remains an independent urgent task, not something that waits for this refactor.

### Testing Decisions

- Confirmed primary seam — running application boundary: Exercise real authenticated HTTP/server-function and Socket.IO behavior through a running application with real PostgreSQL and SeaweedFS. Stub external email and AI providers at their external boundaries. Use real account sessions in authorization tests rather than bypass flags. This minimizes new test-only interfaces while covering the deployed contract. The user confirmed this approach, including focused musical fixtures and a few multi-client browser scenarios.

- Behavior over internals: Assert visible responses, persisted outcomes, emitted accepted states and actual access denial, not private helpers, ORM call sequences, component structure or prompt wording. Prefer complete scenarios at the highest useful boundary over repetitive unit tests.

- Accounts, ensembles and permissions: Cover registration/verification/recovery/session expiry, multi-device membership, invitation acceptance/replay/wrong email, independent capability grants/revocation, lead transfer and default edit denial. Verify ordinary members can control playback while being unable to persist music piece edits; test nonmember and cross-ensemble HTTP/socket/object/job denial and platform-role escalation attempts.

- Playback: Use multiple clients to assert revisions, concurrent commands from ordinary members, sender acknowledgement, restart/reconnect snapshots and stale-command rejection. Use deterministic clocks for offset, latency, scheduled changes, count-ins, starting tones, loop anchors and tempo-position continuity. A small set of multi-client browser scenarios covers real AudioContext activation, suspension/resume, offline reload and shared-device logout. Record achieved timing tolerance rather than promising sample-accurate alignment on arbitrary hardware.

- Musical fidelity at existing seams: Reuse current MusicXML/MIDI parsing, score timeline, export preparation and audio scheduling boundaries. Add reference fixtures that retain voices, lyrics, ties, repeats, clefs, notation and page continuity, including varying part counts and empty/non-score XML rejection. Test semantic musical outcomes and retained source content rather than accepting compact-note equality as proof that all notation survived.

- Jobs and storage: Exercise upload/start/progress/result/import through the application boundary with private originals in SeaweedFS. Restart workers during active jobs, retry failed pages, cancel work and repeat imports. Assert no duplicate pieces, no loss of completed work, stable ensemble destination and current permission checks. Verify temporary/orphan cleanup does not delete retained originals.

- AI failure and quality evidence: Fake provider responses cover refusal, timeout, rate limit, malformed/truncated content and uncertain assembly. Routine CI does not call paid providers. Intentional live evaluations record reference-score accuracy, review effort, token usage, retries, latency and cost; valid XML alone is not a quality pass.

- Offline and secrets: Verify scoped caches and account switching, shared service-worker API exclusions and removal of private UI/subscription state on logout. Build with sentinel secrets to check browser artifacts. Confirm production cannot enable authentication bypasses.

- Sysadmin: Verify searchable oversight for explicit sysadmins, denial for ordinary members/leads, immediate role/session revocation and minimal data exposure. Audit checks do not capture score bodies or secrets.

- Migration/recovery: Dry-run imports against an isolated legacy snapshot and reconcile content hashes, counts, settings, rendered notation and playback. Re-run idempotently, exercise final-delta handling and restore the downloaded backup with object references/content reconciled. No production mutation is required to establish these tests.

- Time and prior art: Freeze clocks and test timestamp expiry/display near midnight and a daylight-saving transition under a non-UTC process zone. Existing scan API tests already launch a service with a fake provider; use that approach but replace their authentication bypass with real sessions. Existing Firestore emulator tests supply ensemble-isolation scenarios, with broad member edit success deliberately changed to default denial. Existing musical fixture tests provide useful starting material but their narrow correction/merge assertions must not preserve known section-dropping behavior.

### Out of Scope

- Implementing the application, creating the actual fork, deploying infrastructure, sending invitations, migrating production or retiring endpoints as part of publishing this spec.

- User-created playback rooms and room-specific control policies in the initial release. Later, a room creator may choose everyone-control or creator-only control and grant/revoke rights for selected participants. This later feature must not delay initial all-members-control playback.

- Initial subscription billing, pricing, usage allowances, monetary AI budgets, spending reservations or automatic monetary cutoffs. These will be decided after quality/cost evaluation.

- Social login, passwordless/magic-link login and migration of anonymous Firebase sessions into new credentials.

- Audiveris recognition, hidden Audiveris fallback or silent substitution of the requested AI model.

- Streaming ensemble audio from the server or promising sample-accurate synchronization across arbitrary output hardware.

- Ensemble-management privileges implicitly granting platform sysadmin, or oversight implicitly authorizing impersonation/global destructive operations.

- Automatic age-based expiry of original PDFs/photos.

- Redis, a multi-replica synchronization architecture or an unrelated audio/notation-engine rewrite solely for the initial release.

- Making full score revision-history/trash UI a mandatory release blocker; recoverable history remains a separately tracked follow-up. Source/content preservation and verified backups remain required.

### Further Notes

This spec consolidates the decisions through 2026-11-03 and supersedes older ticket language requiring exclusive conductor control, broad default member editing, unresolved original-retention duration or initial monetary budgets.

The existing refactor epic is the canonical spec; its implementation tickets remain the delivery breakdown. Existing backlog coverage includes server boundaries, schemas, accounts, permissions, invitations, offline behavior, playback, migration, notation validation, direct transcription, jobs, cost measurement, regression tests, deployment, optional history, urgent legacy exposure, original storage and sysadmin oversight.

Later playback rooms and subscription/budget decisions are tracked independently and are not initial-release dependencies.

Model account access and exact provider integration must be validated during implementation. The earlier read-only cloud inventory was denied permission: whether the unauthenticated legacy Function is deployed remains unknown. This spec neither proves that it is live nor proves that it is retired, and changes no provider billing settings.

Outstanding implementation/release choices include verified legacy leadership mapping and final synchronization mechanics, explicit deletion/account-closure handling despite indefinite retention, measurable transcription acceptance thresholds and deployment sizing. Future room lifecycle/creator-departure behavior belongs to the later room feature. The spec can be ready for agent work without pretending these operational details have already been tested.
