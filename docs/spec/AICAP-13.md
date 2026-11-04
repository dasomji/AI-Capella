# AICAP-13: Make transcription jobs durable, ensemble-scoped, resumable and safe to import once

Outcome

Uploads and transcription survive reloads and worker restarts, retain their destination ensemble and never appear under another account or create duplicate repertoire entries.

Acceptance criteria

Persist job/upload/page status, initiating user, destination ensemble, provider/model/prompt versions and result provenance in Postgres; store binary originals/page renders/results in private durable storage with an explicit deployment/retention policy.

Worker claims/leases and checkpoints recover interrupted upload/transcription without rerunning successful pages or allowing duplicate active processing. Startup reconciles abandoned in-progress jobs.

Account-visible history/progress; reload during upload or transcription resumes; retry failed pages and cancel jobs with bounded cleanup.

Server checks ensemble membership/permissions for creation, files, status, result and import; changing/removing membership applies to existing jobs. Destination is captured when job starts and cannot follow whichever ensemble is later selected in the UI.

Idempotent start/import; repeated requests do not duplicate AI spend or songs. Use explicit content/job versioning.

Scope persisted browser pending-job references by user and ensemble; logout/context switch cancels obsolete UI polling. Define same-user second-device access deliberately.

Evidence

omr-service/src/pipeline.ts:14 defaults to /tmp/omr; :44-46 is RAM queue/map; :115,122-145 persists/restores terminal jobs only. src/scan.ts:206-223 stores one device-global job after uploading/starting. Existing test/server.test.mjs:110-122 checks completed-job restart, not active recovery.

Dependencies

Backend, Postgres, accounts/ensemble permissions and direct transcription contract. Storage providers are Railway object storage for production and SeaweedFS for development; no secret or infrastructure provisioning is included in planning.

Confirmed original-file storage (2026-11-03)

Use private Railway object storage for original PDFs/photos in production and SeaweedFS for development through the same application storage interface. Persist ensemble-scoped object references and upload provenance in Postgres. Store credentials only server-side; authorize uploads, reads and job access using current membership/permissions. The dedicated storage ticket defines lifecycle/cleanup tests; original PDFs/photos are retained indefinitely with no automatic age-based expiry. Cleaning temporary renders or interrupted uploads must not delete retained originals.
