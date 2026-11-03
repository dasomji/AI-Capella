# AICAP-3: Model ensemble data in Postgres and split repertoire metadata from versioned score content

Outcome

Replace Firestore song persistence with tenant-scoped Postgres repositories and migrations. Avoid transporting/reparsing every score when a name or setting changes.

Acceptance criteria

Model ensembles, memberships, songs, score content/versions, settings and rehearsal sessions with stable identifiers, foreign keys, timestamps and ensemble-scoped queries/indexes.

Preserve raw MusicXML as text; store native MIDI-derived Score objects as JSONB with explicit format/schema version; keep searchable identity/title/order as normal columns and flexible overrides/settings as JSONB where appropriate.

No Firestore 900 KB compressed guard; define deliberate application limits that support larger scores.

Repertoire list endpoints return metadata only; score bodies download on open/offline preparation and are cached by content version/hash. Library events identify changed IDs/versions.

Granular or revision-checked updates prevent one voice rename, clef edit or bookmark update from overwriting another concurrent change. Reordering remains atomic.

Preserve swing, part-name/clef overrides, removed/split parts, saved tempo/transposition/sections, sort keys and format defaults.

API/store behavior handles playback selecting a newly imported song before its metadata notification arrives.

Evidence

src/library.ts:17 (compressed limit), :22-58 (two formats/metadata), :65-84 (legacy/compressed decoding), :88-123 (full-score subscription/performance concern), :172-215 (granular overrides/settings). src/main.ts:3750-3754 retries a pending selected song.

Dependencies

Authenticated backend; coordinate with validation, migration and offline tickets. Do not convert MusicXML into a generic JSON tree.

ORM decision (2026-11-03)

Use Drizzle ORM for PostgreSQL schema definitions, tenant-scoped queries and transactions. Commit versioned SQL migrations managed through Drizzle tooling and integrate Better Auth's schema. Keep database code server-only and preserve the text/JSONB requirements above.

Confirmed data constraints (2026-11-03)

Model ensemble leads and membership-scoped capabilities separately from platform sysadmins; a user can have different permissions in different ensembles. Store private object references and provenance for original PDFs/photos alongside music pieces/jobs; keep originals in Railway object storage (SeaweedFS in development).

Store instants (created/updated, invitation expiry, job leases, audit events) with Drizzle timestamp(..., { withTimezone: true }) / PostgreSQL timestamptz. Use date strings for genuine calendar dates. Configure one explicit display/business time zone rather than relying on server locale; business-zone choice remains open. Logs use UTC.
