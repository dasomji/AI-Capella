# Limits Follow Usage Data

Owner decision, 2026-11-23, [AICAP-31](https://plane.audiopoesis.com/audiopoesis/projects/33337ef4-71fd-4c71-b28e-53699eea152c/work-items/40c93e01-1147-4c44-818b-e009f34de5be):
“arbitrary limits are dangerous and need my consent” (2026-11-18).
“Once we have real usage-data from beta-users we can think about where limits could make sense”.

Keep attack and crash protection at its existing values. Add no usage quotas without
owner consent and beta evidence. Each protective request rejection emits one
metadata-only `limit.hit` stdout event (`limit`, `scope`, `value`, `route`).

Removed: ensemble/organizer invitation daily budgets; daily ensemble creation;
ordinary/admin mutation throttles; user/ensemble active transcription quotas;
original storage quota; per-user upload quota; admin usage date-range ceiling;
section, per-part setting, percussion-default and reorder count caps; rejected/
denied audit-row caps. Storage usage is logged per hashed ensemble. History uses
cursor pagination instead of dropping jobs beyond the newest 100.

Kept: account/network/password/email security and expiry; recipient invitation
flood protection (5/day and 1/minute), 14-day invitations; file/body/text/pixel/page
and score-complexity bounds; global upload/processing/preview/validation admission;
rehearsal flood protection; offline expiry; admin content tiers (10/minute, 30/hour,
200/day, ADR 0007); manual AI pause. Timeouts, retries, caches, leases and UI ranges
remain engineering or design settings. Browser-only expiry and score guards cannot
write server stdout while offline; no telemetry request is added for those guards.
