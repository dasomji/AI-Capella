# AICAP-10: Migrate existing Firestore data with verified ensemble ownership, reconciliation and rollback

Outcome

Existing ensembles and repertoire arrive intact in Postgres without inventing person identities or granting ownership based on browser storage.

Acceptance criteria

Inventory/export a consistent Firestore source snapshot; preserve anonymous legacy identities for audit/mapping only. Document verified owner-claim/mapping and reinvitation for existing ensembles; do not infer a person's email or ownership from an anonymous UID/localStorage flag.

Import gzip xmlGz and legacy plain xml, missing-format MusicXML and MIDI-derived Score JSON; preserve stable IDs or an explicit mapping, ensemble names, repertoire order and every settings/override field.

Detect malformed, orphaned, unfiled or unknown-ensemble records and produce a reconciliation report; never silently drop them or place private material into public repertoire.

Idempotent import with dry run; compare counts and decoded content hashes per ensemble; spot-check rendering, playback, transposition and PDF export from both formats.

Rehearse write freeze/final delta, owner validation, deployment and rollback on an isolated copy; keep original Firebase data recoverable until acceptance. Decide treatment of transient playback state explicitly.

Verify downloaded backup artifacts by size/hash and a complete isolated restore of that downloaded copy. Record capture times and retention; do not label a later replacement backup as a pre-cutover snapshot.

Evidence

src/library.ts:22-84,143-158 defines compressed/legacy formats and metadata; src/ensembles.ts:28-44,111-156 defines fixed ensembles and anonymous memberships; src/firebase.ts:34-65 establishes anonymous device auth.

Dependencies

AICAP-3 data model, AICAP-4 accounts, AICAP-5 ensemble ownership/permissions, AICAP-7 cache isolation. Deployment/cutover ticket owns final rollout; this ticket supplies a tested migration tool and reconciliation evidence.

Confirmed migration strategy (2026-11-03)

Develop the replacement in a fork of the current project, isolated from the legacy deployment. The current application stays online uninterrupted during development. After new-version acceptance, ask existing users to create email/password accounts and map legacy ensemble ownership to verified new accounts; do not transfer anonymous sessions as credentials.

Account creation by itself does not prove ensemble ownership. Retain verified lead mapping/reinvitation and reconciliation of all pieces/settings. Rehearse final snapshot/delta capture with users still editing the old version; specify how changes during cutover are reconciled. Any final write restriction requires an explicit release decision; it is not authorized by this planning update. Preserve rollback and retire the old version only after verified cutover.
