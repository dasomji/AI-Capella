# Operations runbook

This is a configuration/local-rehearsal deliverable. Production resources, proxy
trust, sandbox behavior, backup scheduling and cutover require operator execution.
Start with [DEPLOYMENT.md](DEPLOYMENT.md), [DEVELOPMENT.md](DEVELOPMENT.md), and
[SYSADMIN.md](SYSADMIN.md). No live prototype operation is authorized here.

First deploy:

1. Create isolated Railway web/worker/Postgres/private bucket resources only with
   release authorization; select committed configs and populate the env matrix.
2. Configure HTTPS origin, verified mail domain, private DB, S3 credentials on both,
   OpenAI key on worker only. Verify proxy/IP spoof rejection before public traffic.
3. Keep worker stopped/processing paused. Capture initial backup if any data exists.
   Deploy web: pre-deploy migration must succeed. Check /healthz and /readyz.
4. Run ops:canary in both images and the tiny PDF sandbox smoke in DEPLOYMENT.md.
   Prove denied network, successful render, resource limits, bounded failure cleanup.
5. Provision a verified sysadmin using SYSADMIN.md. Verify real auth, invitation,
   library roundtrip, two-browser Socket.IO reconnect/ownership, offline logout,
   private signed downloads and mail delivery. Authorize any paid smoke separately.
6. Run the backup/download/isolated restore drill below. Install alerts and schedule
   cleanup/backup tasks with an operator-owned scheduler; no scheduler is created here.
7. Confirm acceptance/reconciliation via [MIGRATION.md](MIGRATION.md), then authorize
   final synchronization and cutover. AICAP-18 exposure assessment remains urgent
   and independent. Do not retire legacy services as an implicit part of cutover.

Routine deploy: record commit/image IDs and migration delta; take/download/verify
backup; ensure capacity for overlap; deploy web migration first, then web and worker.
Wait for terminal success and /readyz, then /readyz/rehearsal ownership. SIGTERM stops
web admission, emits server:restarting with a 2s reconnect hint, drains HTTP/sockets,
releases ownership, waits up to 5s for mail and closes the pool (10s hard deadline).
Worker stops claims and aborts in-flight page work, requeues with leases released
at the checkpoint, retaining completed pages; 20s hard deadline. A forced kill leaves
leases to expire (30s default); provider usage may be unknown and retries can cost
again. Keep processing paused during ambiguous provider/account incidents.

Migrations serialize with advisory lock 17031501. Review generated SQL, locks,
extensions and data preconditions; rehearse on a restored copy. Regular index builds
may need maintenance time; see SYSADMIN.md. Never edit already-applied migrations.
App rollback: select the recorded previous compatible image/config for both services;
check schema compatibility, readiness and reconnect. DB policy is forward-fix, not
automatic down migration. A destructive/incompatible DB recovery requires a maintenance
window, explicit restore authorization and reconciliation of post-backup writes.
Restore into new isolated resources first, verify, then change service references
under a documented release decision; keep failed resources/evidence for diagnosis.

## Backups and recovery drill

Use trusted operator access with Docker and Node dependencies. Default output is
`backups/`; keep sensitive artifacts outside Git, encrypted and access-restricted.
Quiesce uploads/deletions and application writes while capturing the pair: pg_dump
is transactionally consistent but S3 listings and DB dumps are not an atomic snapshot.
Pause worker cleanup too. Ready rows require exact object bytes. Pending/failed rows
are reported separately in nonReady; review pending uploads and failed inspections,
then retry or remove through authorized application flows. Do not invent missing bytes.

```sh
npm run backup:db -- /secure/lightscore/capture-UTC
npm run backup:objects -- /secure/lightscore/capture-UTC/objects
# Copy BOTH artifacts and manifests to independent encrypted offsite storage.
# Verify size + SHA-256 at source and destination, then use the DOWNLOADED paths:
npm run restore:verify -- --db /downloaded/database-UTC.dump --objects /downloaded/objects
npm run test:backup
```

Database backups use pg_dump custom format plus UTC capture start and completion instants, bytes and SHA-256
sidecar. pg_dump runs a PostgreSQL 17 client container and requires network access to
DATABASE_URL; for Railway use the operator-approved reachable connection/tunnel,
never expose DB credentials in command text/logs. Its URL is passed in environment.
Use a client matching the server major if Postgres is upgraded. Credentials are not
embedded in backups' manifests. Object backup paginates/list/downloads into numbered
files (no remote-key path traversal), hashes every byte and records keys/sizes in a
manifest. It never deletes source objects. Always use a fresh output directory.
The manifest is integrity evidence, not a signature; protect it with the artifacts.

restore:verify always creates its own disposable Postgres + SeaweedFS with unique
names/random loopback ports. It checks downloaded dump/object manifests, restores
the complete dump, checks migrations are current, uploads/downloads all objects,
checks every ready stored_objects reference and SHA-256; reports non-ready rows separately, lists orphan objects, runs count
queries and parses up to ten current pieces through the app validator/timeline.
A missing object, digest/size mismatch, schema drift or parse failure fails the drill.
It never restores into DATABASE_URL or a live bucket. Orphans are reported for review,
never deleted. Empty databases have parsedPieces=0; acceptance needs representative
piece/original fixtures (test:backup includes these). A successful server-side restore
alone does not verify the downloaded copy. Backup scripts do not implement transfer;
the operator must verify source/download byte counts and hashes before the drill.

Railway built-in Postgres backups/PITR availability and retention must be verified
for the selected plan and recovery point; they do not cover object bytes or replace
an offsite downloaded restore. Proposed policy for operator approval: daily encrypted
app backups, 30 daily + 12 monthly copies in an independent account/location; daily
success/freshness alert, monthly isolated download/restore drill and before major
schema/cutover changes. Set actual RPO/RTO from measured capture/restore times and
business approval. Never auto-prune originals or imply a post-deploy capture is a
pre-deploy rollback point. Apply deletion requests to offsite copies according to
retention policy; a restore must replay outstanding deletion requests before access.

## Incident playbooks

| Symptom | Immediate action and recovery verification |
|---|---|
| Database unavailable | Check private networking, connections, disk and migration locks. /healthz remains live, /readyz fails. Preserve errors; restore connectivity then check sessions, pool and rehearsal owner. Do not restart-loop to conceal it. |
| Bucket unavailable | Pause transcription; inspect endpoint/credentials/quota and signed-link browser reachability. Keep originals/DB references; restore access and verify known object bytes before resume. |
| OpenAI outage/rate/account error | Use audited sysadmin stop with reason; check provider status/account via authorized operator, not repeated paid probes. Preserve completed pages and usage_unknown. Resume deliberately after recovery. |
| Mail failure | Check resend domain/DNS/key/provider; background errors are logged. Invitation not_sent remains visible; explicit retry rotates token. Do not blindly bulk retry ambiguous sends. |
| Sandbox unavailable | Keep worker stopped and processing paused. Canary + PDF inspection required before resume; never disable sandbox. App remains available, upload inspection fails closed. |
| Rehearsal ownership stuck | Compare /readyz vs /readyz/rehearsal and ownership logs. Identify old process holding advisory lock, gracefully stop that deployment. Do not indiscriminately terminate DB sessions. Verify exactly one owner, clients reconnect and stopped snapshot. |
| High errors/latency | Correlate request IDs, deploy time, DB waits, memory/CPU, pool pressure and job backlog. Pause processing if contention; rollback compatible app image if regression; preserve logs and failed artifacts. |

Emergency processing stop: sysadmin `/admin` control requires a nonempty reason and
writes audit; environment TRANSCRIPTION_EMERGENCY_STOP=1 on both services cannot be
overridden by UI. The DB-backed control reaches current workers on their next control
check; it prevents new provider work and abandons/requeues current work. It is not an
instant guarantee that a provider has stopped billing. Full-site emergency stop is a
separately authorized traffic restriction/service stop; preserve DB and objects.

Observability: collect sanitized structured UTC JSON logs and request IDs. Alert on
sustained 5xx, /readyz DB/migration failure, missing rehearsal ownership after deploy
grace (~30s), sandbox.unavailable, worker crashes, growing queue/expired leases,
provider account errors, mail failure, backup age/hash/restore failure, disk pressure,
and repeated admin.cap_hit (SYSADMIN.md). Logs/audit must exclude passwords, keys,
session/invitation tokens and score bodies. Keep real failure notifications enabled.
Schedule accounts:cleanup daily in the trusted environment; worker owns temporary-file
and object-deletion outbox cleanup. Confirm terminal failures and retain evidence.

Scaling: one web replica now. Multiple web replicas require sticky routing for
Socket.IO polling, a shared Socket.IO adapter/fanout, per-ensemble ownership/ordering
and shared admission controls. A global advisory owner alone does not route clients
to the owner. Worker capacity is DB-fenced; match concurrency configuration and test
pool/memory/provider load before changing replicas.

## Legacy inventory and separately authorized retirement

Source inventory only; actual live status is UNKNOWN. Retain `functions/`,
`firebase.json`, `firestore.rules`, `rules-test/` and legacy scan source for migration
and retirement evidence; they are excluded from the production image/app CI.
Inventory Firebase Hosting / historical GitHub Pages deployments, Firestore data/rules,
Cloud Function `omrTestPage` and the scan service including domains, revisions,
provider projects/keys, storage, scheduler and logs. The prior read-only inventory
was permission-denied; source presence or removal proves nothing about live exposure.

An authorized operator must handle **AICAP-18 urgently, independent of release**:
verify live endpoints/IAM without invoking paid AI, contain unauthorized processing
with real authorization/resource controls or explicitly retire unused endpoints.
CORS and anonymous Firebase tokens are not sufficient authorization.

After migration acceptance, separately approve a concrete retirement inventory and
rollback window: preserve verified export/download backups, reconcile final deltas,
archive routing/config evidence, explicitly disable/undeploy listed endpoints, verify
terminal disabled/authenticated behavior and no unexpected billing, then retire keys
and remove legacy source/config/tests in a later reviewed commit. Do not rotate keys,
restrict legacy writes, remove endpoints or delete data under this runbook alone.

First deployment must pass `npm run ops:canary -- --s3` with bucket credentials,
confirm addressing style, region and signed URL upload/download; see DEPLOYMENT.md.
The default canary checks sandbox/Poppler only. Railway admission uses `/readyz`;
`/readyz/rehearsal` monitors ownership after admission.
