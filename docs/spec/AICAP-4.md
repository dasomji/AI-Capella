# AICAP-4: Replace anonymous Firebase devices with Better Auth accounts and recoverable sessions

Outcome

Make membership belong to real user accounts across devices while retaining separate device/connection identity for rehearsal.

Acceptance criteria

Integrate Better Auth with Postgres; implement documented sign-in, sign-out, session expiry/revocation, email verification and recovery flows. Use email/password sign-up and sign-in with Resend verification and password recovery.

Authenticated server session is authoritative; never promote cached localStorage ensemble/role flags to permissions.

Same user sees their memberships on a second device; keep user ID distinct from device and tab/connection IDs.

Logout/account switch cancels subscriptions/jobs shown in the UI, clears private in-memory state and invokes scoped cache cleanup.

Session revocation/expiry is handled by HTTP and existing socket connections, including on reconnect.

Replace scan-service Firebase token verification with the shared authenticated backend context.

Evidence

src/firebase.ts:34-65 signs in anonymously; src/ensembles.ts:111-115,151-156 ties memberships/leaders to anonymous UID. src/sync.ts:63-69 generates a browser device UUID. omr-service/src/server.ts:49-58 verifies Firebase ID tokens.

Dependencies

Backend + Postgres schema; coordinate existing-ensemble identity/ownership migration and offline policy.

Confirmed sign-in method (2026-11-03)

Use email and password for initial sign-up/sign-in; this supersedes the earlier instruction to choose a login method. Provide email verification and password reset/recovery through Resend. No social or magic-link login is required for the initial version. Existing users create new accounts in the new application; do not migrate anonymous Firebase sessions or manufacture passwords.
