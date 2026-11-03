# AICAP-18: Verify and contain existing unauthenticated and anonymous-account AI endpoint exposure

Why this must be separate from the refactor

The repository exposes two potentially billable paths that need current-state verification. Moving source code later does not disable an already deployed legacy endpoint. No production modification or provider call is performed by filing this ticket.

Confirmed source findings

functions/src/index.ts defines omrTestPage with cors:true and no application authentication, invoking Anthropic with up to 16,000 output tokens. Actual live deployment is unverified.

omr-service/src/server.ts:54-62 accepts any valid Firebase ID token; :117-128 creates a job without an ensemble membership or scan permission check. src/firebase.ts automatically signs visitors in anonymously.

The two-active-job limit keys on Firebase UID (server.ts:127; pipeline.ts:49-51), so creating new anonymous identities bypasses it; jobs older than one hour also stop counting while they may remain active.

ALLOWED_ORIGINS controls browser CORS response headers, not authorization against scripts/direct HTTP requests. Provider keys being server-side does not stop abuse of a publicly callable server.

The code has no application-wide daily spending cutoff. Existing OpenAI/Anthropic account/project budgets, hard-limit enforcement and App Check configuration are not established by repository evidence.

Read-only verification attempted, 2026-10-15

Firebase CLI is unavailable in this workspace. Fallback command: gcloud functions list --project=ai-capella --format='table(name,environment,state,status)' --quiet. It failed with Permission cloudfunctions.locations.list denied. No functions, IAM, configuration or billing settings were changed. An authorized project operator must complete inventory; do not label the Function absent or safe based on this failure.

Acceptance criteria

With authorized project access, list actual Firebase/Cloud Functions endpoints (firebase functions:list --project ai-capella or equivalent); inventory the scan service and identify which provider projects/keys each live endpoint uses. Do not invoke billable AI to test exposure.

If omrTestPage is deployed and unused, explicitly retire it; if it must remain temporarily, enforce meaningful server authorization before invoking Claude. Merely adding the existing anonymous token check does not close the billing-abuse path.

Gate scan creation/start on authorized ensemble membership and scan permission, with fresh checks before billable processing; distinguish regular verified accounts from freely minted anonymous identities. Protect results/uploads as appropriate without treating CORS as authentication.

Apply bounded account/ensemble/global request and concurrency controls and a manual emergency processing stop if the current service remains live during migration. Do not impose a new monetary daily budget; monetary budgets are deferred by product decision. Account or self-created-ensemble churn must not bypass global limits.

Inspect actual OpenAI and Anthropic account/project spend controls with authorized access; record verified alerts versus enforcement for visibility. Do not introduce new monetary caps or change provider billing settings under this planning decision. Do not claim a cap is absent without checking it.

Evaluate Firebase App Check only as an interim additional signal while Firebase remains; it cannot replace permissions, server authorization and operational resource controls. New stack does not need Firebase App Check once Firebase is removed.

Negative tests/direct HTTP verification demonstrate unauthenticated or anonymous nonmember callers cannot trigger provider calls. Preserve findings and verify terminal endpoint retirement/auth behavior after authorized remediation.

Dependencies and links

Independent urgent verification/containment, not blocked on the full refactor. Coordinate AICAP-2 server boundary, AICAP-5 permissions, AICAP-14 abuse/budget controls and AICAP-16 retirement. Planning only; live remediation is not yet performed.
