# AICAP-17: Add score revision history and recoverable deletion for shared repertoire

Recommendation from refactor analysis

Use the new storage boundary to prevent a mistaken shared-library edit or delete from permanently losing ensemble material. This is additional recommended scope, not existing implemented behavior.

Acceptance criteria

Preserve original imported/generated MusicXML or native Score source and immutable version/provenance when content changes; annotations/defaults stay separate and can be audited independently.

Record actor, ensemble, revision and timestamps for material score changes and deletion; avoid capturing secrets or excess personal content in audit logs.

Define archive/trash retention and authorized restore behavior; recovered songs preserve ensemble ownership and relevant settings. Verify undo/restore through API tests.

UI describes ensemble-wide deletion and recovery clearly; permissions/last-owner/ensemble deletion policy align with the ensemble lifecycle ticket.

Original PDFs/photos are retained indefinitely without age-based expiry. Storage and cleanup rules for revision history/trash/temporary artifacts are separate and explicit; cleanup must not delete retained originals. Do not silently introduce unlimited content history or remove existing data during migration.

Evidence

src/library.ts:168-170 calls deleteDoc directly. PROJECT.md documents deletion as destructive and unrecoverable for every device. Existing metadata is intentionally stored apart from source score, which is a useful foundation to retain.

Dependencies

AICAP-3 versioned content schema and AICAP-5 permissions. Medium-priority improvement; can follow functional migration if release scope must stay small.
