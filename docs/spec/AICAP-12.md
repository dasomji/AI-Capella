# AICAP-12: Replace Audiveris with direct GPT-6.1 Sol transcription of PDFs and photos

Outcome

PDF/photo input produces complete usable score data directly through the OpenAI API, without Audiveris recognition or a second correction-only phase.

Acceptance criteria

Configure the requested model server-side as gpt-6.1-sol; verify actual deployment account access. No silent substitution of another model. Use official Responses API capabilities and intentional input/page rendering strategy.

Directly produce complete MusicXML (or a validated representation that preserves the required notation and exports faithfully) with all visible voices, lyrics, pitch/rhythm and page continuity. Existing correction-only schema is insufficient and must be replaced.

Integrate shared validation/provenance and multipage reconciliation; evaluate representative ensemble scores, divisi, accompaniment, dense pages and photos against ground truth. Record errors and review-required passages; do not equate valid XML with accurate transcription.

Explicit states for refusal, truncation, invalid/incomplete output, provider timeout/rate limit and user cancellation. Preserve successful page work for retry through durable jobs.

Update scan UI/progress/reports and English/German copy to describe transcription/validation instead of Audiveris corrections.

Remove Audiveris runtime calls and dependencies once parity is verified; retain only rendering/image utilities actually needed. Original PDFs/photos remain private and are retained indefinitely, without automatic age-based expiry.

Evidence

omr-service/src/review.ts:11-21,99-117 only checks existing recognized measures; pipeline.ts:215-248 first requires Audiveris output. review.ts:8 defaults to gpt-5. src/scan.ts and src/i18n.ts name Audiveris and a correction pass.

Verified official documentation

https://developers.openai.com/api/docs/models/gpt-6.1-sol confirms model ID, image input, text output, Responses API and structured output support (checked 2026-10-15). This confirms API capability, not task-specific transcription accuracy or account access.

Dependencies

AICAP-2 server boundary; shared score validation, durable jobs and resource-limit and cost-measurement tickets. User direction explicitly removes Audiveris; do not retain it as a hidden fallback.

Quality/cost direction

Optimize for high-quality music notation and measure actual per-job/page cost before defining monetary budgets or subscription pricing. Do not add application spending cutoffs or subscription allowances in the initial version.
