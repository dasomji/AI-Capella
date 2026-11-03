# AICAP-19: Store original PDFs/photos privately in Railway buckets with SeaweedFS for development

Outcome

Preserve original PDFs/photos for ensemble music pieces and transcription jobs using Railway object storage in production and SeaweedFS in development.

Acceptance criteria

Use a shared S3-compatible application storage interface with environment-specific endpoints and server-only credentials. Exercise actual SDK behavior against SeaweedFS locally and Railway in an isolated deployment.

Private objects have stable opaque keys, ensemble ownership, content type/size/hash and provenance recorded in Postgres. Validate supported files and upload completion before job processing; never treat an object key as authorization.

Authorize upload/download/preview/delete access against current session, ensemble membership and relevant music piece/transcription permissions. If using signed URLs, keep them short-lived and do not log them; no public bucket or public listing.

Preserve originals independently of derived page renders/transcription output. Successful retries must not overwrite an unrelated ensemble's objects or duplicate piece imports.

Define interrupted-upload cleanup, orphan reconciliation, deletion/recovery and retention. Retain original PDFs/photos indefinitely with no automatic age-based expiry. Cleanup of abandoned uploads, temporary renders, or derived artifacts must not delete retained originals. Explicit deletion/account-closure policy remains separate from age-based retention.

Local setup includes persistent SeaweedFS storage, safe development credentials and reset instructions isolated from production. No real secret belongs in example configuration.

Backup/migration reconciliation covers both Postgres references and object content, including hashes and restore evidence. Database backup alone is insufficient to recover originals.

Meaningful integration tests cover cross-ensemble access denial, download after reload, failed uploads and cleanup without deleting referenced originals.

Dependencies

AICAP-2 server boundary, AICAP-3 schema, AICAP-5 permissions, AICAP-13 durable jobs, AICAP-14 file/resource limits, AICAP-16 deployment. Planning only; no bucket provisioned or legacy object deleted.
