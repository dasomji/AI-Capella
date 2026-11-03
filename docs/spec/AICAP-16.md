# AICAP-16: Prepare backend/worker deployment, CI, verified backups and Firebase/Audiveris retirement

Outcome

Ship the new persistent stack with a rehearsed cutover and rollback, then explicitly retire obsolete services and documentation.

Acceptance criteria

Document Railway hosting for persistent HTTP/Socket.IO server, Postgres and durable transcription worker/storage; prefer a coherent origin/cookie setup. A static GitHub Pages build alone cannot host the new backend.

PR CI runs frontend/backend builds, schema migrations and meaningful authorization/playback/job checks; replace the old feature-branch deployment trigger with the intended release flow.

Provide local compose/setup, health/readiness endpoints, graceful socket/worker shutdown, migration execution and deployment runbook. Document multi-replica ordering/fanout and sticky-routing needs before scaling beyond one server.

Rehearse migration/cutover with verified backup artifacts, complete isolated restore, reconciliation and rollback; preserve Firebase until new-stack acceptance and explicit retirement execution.

Inventory actual live endpoints first. The source includes an unauthenticated wildcard-CORS Claude Function spike; deployment status is unknown. Explicitly undeploy it if live, then remove obsolete functions/Firebase configuration, SDKs, keys and emulator-only tests once replacements pass.

Remove Audiveris/JVM/Tesseract/img2pdf dependencies, old recognition scripts/mocks and deployment/env instructions after replacement; keep necessary PDF rendering tools.

Update PROJECT.md and setup/security/operational docs for dynamic ensembles, Better Auth, Resend, Postgres, Socket.IO, offline policy and direct GPT transcription; distinguish API secrets from public client configuration.

Evidence

.github/workflows/deploy.yml:3-6,19-34 only builds frontend/Pages from an old branch; vite.config.ts fixes /AI-Capella/ base. omr-service/Dockerfile:9-27,40-42 downloads Audiveris and installs its tooling. functions/src/index.ts:45-66 defines cors:true without auth; firebase.json declares functions. PROJECT.md includes superseded single-session/loop descriptions.

Dependencies

All parity/security tests, migration rehearsal, AI validation and production configuration. Ticket creation authorizes no deployments, secret rotation or endpoint removal now.

Current endpoint exposure must not wait for cutover

A separate urgent verification/containment ticket tracks the existing unauthenticated omrTestPage and anonymous-account scan-service abuse path. Complete that assessment independently of this release schedule. The 2026-10-15 read-only gcloud Functions inventory attempt was denied cloudfunctions.locations.list, so actual deployment remains unverified. Source deletion or a new deployment does not demonstrate the old URL has been retired. Require explicit live inventory and retirement/auth verification without triggering billable AI.

Confirmed hosting and release approach (2026-11-03)

Railway is the production host for the persistent application, PostgreSQL and transcription worker; use Railway object storage for originals. Use SeaweedFS in the local development setup. Replace the earlier hosting-choice requirement with a reproducible Railway deployment plan and server-only configuration.

Build from a fork, with separate deployment/data/secrets so work on the new version cannot interrupt the legacy app. Keep the old application online while the replacement is developed and accepted. Rehearse user-created accounts, final data synchronization, reconciliation, rollback and only then a separately authorized retirement. Planning this ticket provisions nothing.
