# Legacy migration (Phase 6a)

These tools were developed against synthetic snapshots, the Firestore emulator and disposable PostgreSQL only. No prototype access, export, write freeze, production import or cutover has been performed. The operator owns those release actions. Keep the legacy deployment recoverable until acceptance and explicit retirement approval.

## Prerequisites and safety

Use Node 22.22+, Java (emulator), Docker and `npm ci`; install the retained emulator tooling with `npm ci --prefix rules-test`. Migration tooling is server/operator code; Firebase Admin is a development dependency and never enters the client bundle. Run from the repository root. Import/reconcile use the normal validated server environment (`DATABASE_URL`, auth/origin settings, business zone and mail adapter). Use a separate database for rehearsals. Never use the prototype's project for tests; `test:migration` uses `demo-migration` and loopback services only.

Before a real import, capture and verify the new database AND original-object backups following the operations runbook. A migration rollback restores the entire pre-import database, including accounts created since that backup; choose the freeze/restore point explicitly. Keep all backup and snapshot files private, outside Git, with restricted access. They contain private scores, anonymous audit IDs, access-code hashes and invitation links. An export directory must be fresh; files are exclusive-create and a manifest appears only on completion. A partial export must be discarded and repeated into a new directory.

For an operator export, supply a service-account credentials file with **read-only Firestore viewer permissions**, never an editor/admin role. The exporter uses only queries in a single read-only transaction; it never writes to Firestore. No default credentials fallback is used for a non-emulator export. Transaction/query limits apply: if Firestore cannot complete the snapshot within its transaction deadline, fail and plan a managed consistent export with the operator; do not stitch partial exports together. The current fixed inventory covers ensembles, songs, codes, nested members/leaders, sessions, feedback and old config. Unrecognized collections are outside this tool's inventory and require an operator inventory review before release.

## Export and reviewed mapping

Operator command (the acknowledgement is deliberately required outside the emulator):

```sh
npm run migrate:export -- --project <legacy-project-id> --credentials /private/readonly.json --out /private/snapshot-001 --i-understand-this-reads-production
```

For local tests `FIRESTORE_EMULATOR_HOST=127.0.0.1:<port>` and a `demo-` project need no credentials. Each collection has JSONL documents with ID, original path and data; binary values use `{"$bytes":"base64"}`, timestamps `{"$timestamp":"…Z"}`. The manifest contains version, complete flag, project, UTC start/end/read time, byte counts, document counts and SHA-256. Import refuses missing, truncated, duplicate or changed files. Nested member/leader ensemble documents are exported by collection-group query even when their parent document does not exist. JSON encoding preserves these identities for audit, never for login.

A human operator authors and reviews **JSON** (YAML is deliberately not supported) mapping exact legacy ensemble IDs to intended lead emails. Record review approval separately; account creation, anonymous UIDs, browser data and knowledge of codes are never leadership evidence.

```json
{
  "nnb": {"emails": ["lead@example.org", "second@example.org"], "displayName": "Reviewed choir name"},
  "rm": {"emails": ["lead2@example.org"]}
}
```

Email addresses normalize to trimmed lowercase. Unknown mapping keys do not create ensembles. Missing mapping does not discard repertoire: the imported ensemble remains **awaiting lead**, with zero members. Sysadmins can see these ensembles through the existing ensemble oversight list (zero leads/members and pending invitation counts); `ensembles.awaiting_lead` and the import report explicitly identify the state. Members never gain access until invited. An operator can add the reviewed mapping and rerun import.

## Dry run, import, invitations and reconciliation

```sh
npm run migrate:import -- --snapshot /private/snapshot-001 --mapping /private/reviewed-mapping.json --dry-run --report /private/reports/preview
npm run migrate:import -- --snapshot /private/snapshot-001 --mapping /private/reviewed-mapping.json --report /private/reports/import
npm run migrate:reconcile -- --snapshot /private/snapshot-001 --report /private/reports/reconcile
```

Dry run executes each ensemble's full database transaction and rolls it back, including invitations and audit rows. It sends no mail and prints recipient plans without usable tokens. Import writes JSON and Markdown reports; stdout identifies the JSON path. No mail is sent by default. The private JSON report holds newly created invitation URLs; deliver these privately, or explicitly use `--send-invitations` with the configured mail adapter. This rotates pending migration links, retaining no raw token in the database. Sending occurs only after ensemble commit; delivery failures are reported and an explicit retry rotates the link. Already accepted invitations are never resent. Re-running without sending is a no-op and cannot reconstruct prior raw links. Invitation sending is not automatically retried. Review expired/revoked invitations before explicitly sending again.

Migration lead invitations are a distinct `lead` kind with no inferred issuer; only the operator import creates them. Normal invitation input cannot set this kind or convert/resend a pending lead grant. Acceptance uses the normal authenticated invitation endpoint, verified account and exact intended email, atomically grants lead membership and clears awaiting-lead. Wrong email cannot claim it. The normal last-lead guard applies after acceptance. Existing users create new email/password accounts; anonymous IDs are never credentials. Leads invite their members normally after acceptance.

Every ensemble is transactional. Malformed scores are quarantined **in the report only**; no piece or public quarantine ensemble is created. Missing/unknown ensemble songs are likewise flagged. The `public` repertoire is intentionally skipped because samples ship in the app. Codes, leader codes, anonymous memberships, sessions, clock pings, feedback and old config are intentionally skipped, with counts in reports. Legacy access is never translated into membership. Review every quarantine/unmapped entry and retain the original snapshot; a zero reconciliation mismatch count does not certify that quarantined records were recovered.

MusicXML defaults when format is absent; gzip is bounded on decompression. Native score JSON is validated and stored as schema version 1. The shared domain score worker validates, parses and derives playback timing; import and the HTTP API share version insertion. Title sanitization and granular setting schemas are shared with the domain API. Legacy part names, clefs, removed/split parts, percussion, swing and saved transpose/BPM/sections/played map to their existing granular fields. Invalid/unrecognized fields (including scan images) remain in `provenance.legacy_settings`, and unmapped keys are reported. Original encoded bytes' SHA-256 is retained; if validation normalizes the source body, the original decoded text is also retained in provenance. Source ordering uses numeric `sortKey ?? importedAt ?? 0`, then stable ID for ties; destination keys are padded integers. Native JSON is canonically hashed; compressed/plain XML is compared after decoding and normal domain normalization.

Reconciliation compares per-ensemble piece counts and order, title, content hashes, every mapped settings column, parser-derived parts/voices/measures/notes/total beats, and stored vs recomputed playback timing. JSON/Markdown reports are private; mismatches exit nonzero. Extra destination repertoire intentionally causes a count mismatch for operator review. Missing imported ensembles also fail. Import reports conflicts/ensemble failures with nonzero exit; quarantines and source deletions are explicit review findings rather than fatal errors.

## Final delta and explicit release decision

Capture another complete snapshot into a fresh directory, repeat reviewed dry-run, import and reconcile. The map key is `(source project, collection, legacy ID)`; content hashes determine changes. Unchanged records create no versions. Changed records get new immutable score versions. Sort-only changes do not create score versions. Metadata, settings, revision, current version, provenance and ordering are fingerprinted after import. New-system changes cause a conflict rather than being overwritten, even if the legacy content is unchanged. Ensemble names synchronize on re-import when their stored name still matches the import baseline; locally renamed ensembles are flagged as conflicts.

A legacy document removed from the next complete snapshot is flagged `deleted_in_legacy`; it is retained by default. `--apply-deletions` explicitly removes the corresponding untouched destination piece and versions under the ensemble transaction. Edited pieces become `deletion_conflict`. Review destination references/backups before using that flag; constraints can fail an ensemble safely if references remain. Moves between legacy ensembles are conflicts requiring operator resolution. Quarantined changed records never silently replace previously imported pieces; reconciliation reveals the retained extra piece.

A final write freeze is an explicit release decision, never performed by these tools. The release operator must decide how edits during snapshot/import and new-system edits are resolved, capture the final complete delta after the approved freeze, reconcile, verify intended leads and musical spot checks, and authorize traffic changes. Do not discard legacy exports or retire Firebase based on a successful local test.

## Rollback rehearsal and verification checklist

`npm run test:migration` owns random loopback ports, a `demo-migration` Firestore emulator and an `aicap-migration-<pid>` PostgreSQL container. It captures a pre-import binary `pg_dump` over the container's local socket, writes the downloaded archive, verifies server/download size and SHA-256 agreement, imports synthetic data, then fully restores that downloaded archive using `migrate:rollback-rehearsal`. The restore script only accepts harness-named disposable containers, validates supplied size/hash, and uses bounded/noninteractive local-socket authentication. It never accepts a production URL. Artifacts remain under ignored `migration/.runtime/<pid>/`. The shared operations backup helper was attempted during development but its rootless-container environment forwarding failed; this rehearsal uses the direct disposable-container socket path and does not claim to validate that separate helper.

```sh
npm run migrate:rollback-rehearsal -- --container aicap-migration-<pid> --backup /private/pre-import.dump --sha256 <sha256> --bytes <size>
```

For actual recovery use the operations runbook's verified backup/restore procedure, original objects included; never point the rehearsal script at a real database. No backup taken after import can recreate a lost pre-import state. Record actual capture time and restoration target. After restoration, reconciliation against the imported snapshot must report missing ensembles/pieces, proving rollback rather than import success. Verify legacy snapshot/content and application behavior remain unchanged, then separately authorize fallback traffic. Import never writes to Firestore; the test spies on Firestore write APIs and compares seeded source data before/after import and rollback.

Before release verify:

- Reviewed mapping approval; read-only credential role; private complete manifest/checksums; verified pre-import DB/object backup and isolated downloaded restore.
- Dry-run and import findings reviewed; no unresolved orphan, malformed, unknown-ensemble or unmapped musical settings; awaiting-lead ensembles explicitly accepted or held back.
- Reconciliation has no unexpected mismatches; delta is reconciled after the approved freeze; conflicts/deletions resolved manually.
- Verified correct-email lead acceptance and wrong-email rejection; ordinary member invitations; source codes/sessions cannot authorize access.
- Representative plain, large gzip and native pieces parse/play with expected timing, transpose/settings and PDF preparation; manual visual/audio acceptance remains an operator release check.
- Rollback restores the actual pre-import artifact and original objects; legacy remains recoverable; cutover/retirement are separately approved.
