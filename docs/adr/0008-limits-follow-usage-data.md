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

The event's `value` uses the following units. Counts describe the configured
capacity or burst, never the current occupancy. Rate windows are part of the
stable series name; socket token buckets keep their existing refill rates.

| Limit series | Unit of `value` |
| --- | --- |
| `request.bytes`, `score.bytes`, `source.pdf_bytes`, `source.photo_bytes`, `render.source_bytes` | Bytes |
| `source.pixels`, `render.pixels` | Input pixels |
| `transcription.pages` | Pages/photos per job |
| `score.nesting` | Traversal nesting levels (JSON 64, XML 256) |
| `score.xml_nesting` | XML nesting levels (the parser's existing `maxNestedTags`, currently 100) |
| `score.validation_queue`, `preview.waiting`, `rehearsal.queue` | Waiting requests |
| `upload.concurrent`, `preview.concurrent`, `rehearsal.in_flight` | Concurrent requests |
| `rehearsal.sockets` | Connected sockets per user |
| `rehearsal.read_socket`, `rehearsal.read_user`, `rehearsal.cmd_socket`, `rehearsal.cmd_user` | Burst requests (20; refill 5/second) |
| `rehearsal.read_ensemble`, `rehearsal.cmd_ensemble` | Burst requests (100; refill 50/second) |
| `rehearsal.clock_socket` | Burst pings (20; refill 10/second) |
| `auth.network_sign_in`, `auth.network_sign_up`, `auth.network_default` | Requests per configured 60-second network window |
| `auth.network_reset_request`, `auth.network_verification_request` | Requests per configured 60-second network window |
| `auth.network_sensitive` | Requests per library rule window (10 seconds for sign-in/up/change-password/change-email; 60 seconds for reset/verification) |
| `auth.wrong_password`, `auth.registration_account` | Attempts per account/network minute or registrations per account minute, respectively |
| `auth.password_concurrent`, `auth.failed_password_concurrent` | Concurrent password evaluations |
| `auth.verify_password`, `account.delete_password` | Failed password attempts per 15 minutes |
| `account_mail.recipient_minute`, `account_mail.recipient_day`, `account_mail.requester_day` | Deliveries per recipient minute/day or requester/recipient day |
| `invitation.recipient_minute`, `invitation.recipient_day` | Deliveries per ensemble/recipient minute/day |
| `auth.verification_expiry`, `auth.session_expiry`, `invitation.expiry` | Seconds since issue (configured lifetime) |
| `admin.content_minute`, `admin.content_hour`, `admin.content_day` | Content/download requests per actor minute/hour/day |
| `input.password`, `input.delete_password`, `input.email`, `input.name`, `input.title`, `input.label`, `input.idempotency_key`, `input.setting_key`, `input.part_key`, `input.ensemble_id`, `input.user_id`, `input.admin_reason`, `input.admin_search`, `input.admin_cursor`, `input.admin_outcome`, `input.admin_state`, `input.admin_action`, `input.admin_actor`, `input.admin_target`, `input.admin_target_type`, `input.field` | String length in UTF-16 code units, as enforced by the schema/library |
| `input.delete_ensembles` | Ensemble IDs per account-deletion request |

`input.field` is the fixed fallback for a bounded string schema without a known
field label; dynamic keys never become series names. Numeric UI ranges (including
tempo, transpose and page size) produce no hit. Worker-side rejections with no
request context use `route: "unknown"`. Renderer pixels retain the native renderer's
40 MP bound; upload inspection uses `TRANSCRIPTION_MAX_PIXELS`. These were already
separate enforcement settings. `render.pixels` means sharp's exact "Input image
exceeds pixel limit" failure, not an arbitrary rendering error mentioning pixels.

Logging coverage has these explicit gaps; “every rejection” above is the target,
not a claim that these cases are attributed today:

- HTTP session expiry becomes an anonymous request in Better Auth. Missing,
  revoked and expired sessions share the same result. Rehearsal session expiry
  does log because its socket retains the expiry timestamp.
- Password-reset expiry shares `INVALID_TOKEN` with unknown/used tokens; the
  response alone cannot attribute expiry. Verification JWT expiry does log.
- Unverified-account cleanup and expired invitation/session cleanup are background
  deletion, not request rejection, and have no `limit.hit` event.
- Client/offline personal/shared-device expiry and score measure/repeat-expansion
  guards cannot emit server stdout while disconnected. No telemetry call is added.
- The XML traversal guard at 256 is currently shadowed by the parser's stricter
  existing 100-tag guard; parser rejections log `score.xml_nesting` and preserve
  the public `invalid_score` response.
- Global processing concurrency queues accepted jobs; the manual AI pause retains
  accepted work. Neither rejects a request or produces a hit for normal queuing.

Closing the HTTP-session/reset-token attribution gaps would require a separate
expiry-aware lookup/hook, with care for token hashing and cleanup races. These
remaining gaps are reported to the owner in the implementation handoff.
