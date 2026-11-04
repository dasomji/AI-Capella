# Security model

Protect account/session credentials, ensemble scores/originals and provider capacity.
Threats include cross-ensemble access, stale/revoked sessions, capability escalation,
untrusted score/PDF decompression/parser/resource attacks, offline shared-device
exposure, forged proxy headers and anonymous/self-created-account billing abuse.

Every server action checks a current verified account, membership and the required
capability. Sysadmin is a separate database role, checked on every request, with
minimal projections, audited content access and no impersonation. Ensemble writes
serialize last-lead rules; expected revisions/idempotency fence concurrent writes.
Socket joins and commands reauthorize, and session/membership revocation disconnects
access. See SYSADMIN.md for audit/access limits and provisioning.

Secrets belong only in server variables: DATABASE_URL, auth secret, S3 credentials,
Resend and OpenAI keys. Never expose them via VITE_*, SSR loader results, logs or
client bundles. Public origin, application zone and nonsecret client assets are not
credentials. CI builds with sentinels and a positive leak control; no repository
secrets or real providers are needed. OpenAI key is worker-only. Do not commit backups
or .env; encrypt offsite copies and restrict access. No rotation is executed here.

Better Auth uses verified email/password accounts, HttpOnly secure production cookies,
trusted exact HTTPS origins and host-only cookie scope. Request/socket origins and
CSRF-sensitive actions are checked server-side. CORS never grants authorization.
Rate limits persist in PostgreSQL for auth/email/invitation/ensemble/API/admin actions;
uploads have byte/page/pixel/storage/concurrency caps and transcription has global
worker capacity and an audited emergency stop. Cost estimates can be unknown;
there is no monetary hard spending cap. Account/provider alerts require operator setup.

Private originals use authenticated access and short-lived (<=60s) signed downloads;
no public bucket or age-based original expiry. Inspection/render/score workers use
Python/libseccomp network denial, CPU/address-space/file bounds, timeouts, private
staging and bounded queues. Inputs are untrusted even from authenticated members.
Both images run unprivileged. Sandbox failure closes processing paths; never bypass
it to restore uploads. Railway runtime behavior needs first-deploy canary/PDF testing.

HTTP responses use no-store/private-cache rules, nosniff, frame restrictions and CSP.
CSP currently needs inline script/style for Start hydration and the legacy renderer;
nonce-compatible removal of unsafe-inline remains follow-up hardening. Same-origin
connect/form policies and no public source maps reduce exposure; they do not eliminate
XSS risk. Validate CSP through sign-in, score rendering, audio, worker and PDF flows.
Proxy trust is restricted to verified socket peers; headers from clients are never
trusted by themselves. DEPLOYMENT.md makes edge-spoof testing a release gate.

Offline data is scoped to the verified account/ensemble and bounded in time. Logout,
account switch and learned revocation clear private stores/context. Disconnected
copies cannot be remotely erased instantly; unlocked shared profiles can read prepared
scores within their access window. Persistent storage is not encryption or guaranteed
retention. See PROJECT.md for offline boundaries and shared-device policy.

Originals are retained indefinitely while their ensemble exists. Closing a member
account preserves shared ensemble data and removes personal access; sole-member
closure/ensemble deletion queues eventual original removal through the worker outbox
(allow one hour plus the next successful cleanup pass). Last-lead protection applies.
Do not claim a generic ensemble-delete API exists where it is not implemented.
Deletion retries must be monitored. Temporary staging expires; account cleanup removes
expired transient records per the committed cleanup implementation. Audit/usage are
operational evidence; define approved retention/access before production. Backups keep
prior data until retention expires; record deletions for replay after any restore.

Production/fork services remain separate from the live prototype. Legacy Function
omrTestPage and scan endpoints have unverified deployment/exposure; AICAP-18 remains
urgent independent operator work. Removing source is not retirement. See RUNBOOK.md
for separately authorized inventory, containment, backup verification and retirement.
