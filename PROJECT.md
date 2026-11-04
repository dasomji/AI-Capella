# LightScore / AI-Capella production

LightScore is a shared score library and rehearsal player for dynamic ensembles.
The production fork uses TanStack Start/React for routing/accounts and preserves the
musical client, audio engine, MusicXML/MIDI parsing, timeline, staff/piano-roll views
and PDF export. It is a persistent Node HTTP/Socket.IO application, not a static site.

Verified email/password accounts use Better Auth with server sessions, recovery and
revocable devices. People create ensembles and accept email invitations. Ensemble
leads manage independent manageMembers, editPieces and transcribe capabilities;
ordinary members can participate in playback without edit permission. Last-lead
invariants are enforced in PostgreSQL transactions. Platform sysadmins are separately
provisioned and gain audited oversight rather than implicit ensemble membership.

PostgreSQL/Drizzle holds accounts, memberships, invitations, metadata, immutable score
versions, rehearsal state, jobs, original references and audit events. Revisions and
idempotency protect concurrent edits. Library metadata loads separately from version
bodies. Private local imports remain on the device until explicitly persisted.

Socket.IO runs on the same HTTP server and origin. Authoritative rehearsal commands
carry revisions and IDs; the server orders commands, schedules future playback,
calibrates clocks and publishes accepted state. Reconnect/late join reconcile state;
restart snapshots are paused. A dedicated advisory-lock owner prevents simultaneous
playback authorities. Initial deployment has exactly one web replica.

Offline preparation stores account/ensemble-scoped scores in IndexedDB with a bounded
14-day access window (shared-device mode 24h). It supports solo playback, staff and
PDF. Together, writes and transcription need connectivity; commands are never queued.
Logout/account switching purge private data; remote revocation takes effect when a
disconnected device learns of it or its window expires. Browser eviction remains possible.

Transcription uses private S3 originals, PostgreSQL jobs/page checkpoints and a separate
worker calling GPT-6.1 Sol. Linux sandboxing bounds inspection/render/validation; a
failed sandbox disables processing. Workers check current permissions, use fenced
leases, preserve completed pages and expose uncertainty/usage for human review.
Importing a result requires editPieces independently of transcribe. Originals remain
indefinitely with the ensemble; account closure preserves shared ensemble ownership,
while ensemble deletion/sole-member closure queues eventual object deletion.

Railway is the intended host for web, worker, Postgres and private object storage.
Local SeaweedFS/Mailpit replace S3/mail; routine AI tests use recorded/fake boundaries.
No resources are provisioned by repository configuration or CI. See
[deployment](docs/DEPLOYMENT.md), [runbook](docs/RUNBOOK.md),
[security](docs/SECURITY.md), [development](docs/DEVELOPMENT.md),
[sysadmin](docs/SYSADMIN.md), [migration](docs/MIGRATION.md) and [plan](docs/PLAN.md).

## History

The prototype used Firebase anonymous identities, code/PIN ensembles, static Pages
hosting and an Audiveris/Cloud Function experiment. These descriptions are historical;
legacy sources remain only for migration/retirement evidence. The live prototype must
stay untouched until a separately authorized operator inventories and retires it.
AICAP-18 tracks urgent independent verification of legacy AI endpoint exposure.
