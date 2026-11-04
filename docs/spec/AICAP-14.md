# AICAP-14: Measure AI transcription quality and cost; bound uploads and processing resources

Outcome

Prioritize high-quality music notation transcription, measure actual AI usage/cost, and optimize against representative scores. Monetary AI budgets, usage allowances and subscription pricing are deferred until quality and costs are understood.

Acceptance criteria

Validate actual file signatures and supported media; bound per-file/aggregate bytes, page counts, image dimensions and decompressed MXL size to protect processing resources. Stream large uploads rather than buffering all input.

Bound rendering/decompression resources, worker/provider concurrency, processing deadlines and retry counts; support cancellation and idempotent retries. These are operational controls, not monetary budgets or subscription allowances. Do not retain a two-scans-per-account product quota.

Require a valid account, current ensemble membership and music piece AI transcription permission before billable processing. CORS or bot/device attestation never substitutes for authorization. Test direct HTTP access, revocation and concurrent workers.

Record per-job/page model and prompt version, request IDs, input/output usage, estimated or actual cost with its basis, latency, failures and retry cost, without logging secrets or raw private documents. Compare cost alongside notation accuracy and review effort; do not reduce score quality merely to hit an invented cost target.

Do not implement per-user/ensemble monetary quotas, global daily/monthly spending cutoffs, cost reservations, budget-exhaustion UI or subscription restrictions in the initial version. Decide budgets later together with subscription pricing, based on measured evidence. Do not change existing provider billing settings merely to satisfy this ticket.

Retain actionable file/resource/provider errors, service/job diagnostics and an operator-controlled emergency stop for processing; the stop is manual and is not automatically triggered by an application spending amount.

Use provider stubs for routine integration tests; intentional live quality/cost evaluations record their usage. Current endpoint verification/containment remains separate from this refactor.

Evidence

omr-service/src/server.ts:22-23,65-79,127,139-144 buffers uploads, trusts declared MIME and limits jobs by anonymous device. pipeline.ts:51 excludes old jobs from the active count; :161-180,202-210 has inconsistent process limits. review.ts:94 allows long requests and retries. src/library.ts:223-224 unzips MXL without an expansion limit.

Dependencies

AICAP-2 server boundary, AICAP-5 ensemble permissions, AICAP-12 direct transcription, AICAP-13 durable jobs. This product decision supersedes the earlier monetary-budget and enforced provider spend-cap requirements in this ticket. Existing provider billing configuration remains unverified; no settings are changed by planning.
