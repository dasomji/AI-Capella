# Admin Audit Scope And Read Limits

The product owner, Daniel, decided in chat on 2026-11-18: no read limits except
the content/download caps, and the in-app audit covers mutations only.

## Context

The in-app audit is useful when it explains changes. Recording each list, detail,
original preview and content read creates noise and extra database writes without
explaining a change. Per-actor list limits also interfere with ordinary paginated
browsing and detail-table search. Operational troubleshooting belongs in Grafana,
using structured server stdout, rather than in the product's audit history.

## Decision

- Record create/update/delete operations, including platform roles, membership
  permissions/removal, invitations, CLI role writes and transcription stop/resume.
  Preserve successful and rejected mutation outcomes and the transaction/savepoint
  guarantees in [ADR 0002](0002-admin-membership-and-role-concurrency.md).
- Do not insert audit events for list/detail/statistics reads, current-score access,
  original downloads or original page previews. Preserve existing historical rows;
  this change does not delete or rewrite them.
- Use server pagination and server search for admin lists and detail member tables.
  Remove the aggregate admin read cap and every `list:*` read cap. Authentication,
  invitations, ensemble creation, owner-approved mutation limits and preview resource admission
  retain their existing protections. Removing the aggregate limit also leaves
  `PUT /transcription/control` without a blanket limit, as intended by the owner.
- Keep the required reason and PostgreSQL-backed shared content/download limits:
  10 per minute, 30 per hour and 200 per day per actor. Cap rejection remains 429
  with the cap and waiting instruction; signed original URLs expire in 60 seconds.
- Extend the existing `server/logger.server.ts` with explicit structured stdout
  events: `admin.content_access` contains UTC timestamp, request ID, actor,
  target type/ID and the validated reason; `admin.cap_hit` contains UTC timestamp,
  request ID, actor, cap kind, maximum and window milliseconds. JSON serialization
  keeps multiline reasons within one log line. Do not log score bodies, object
  keys, signed URLs, credentials, headers or arbitrary request metadata.
- Grafana can consume these stdout events through the deployment's log collector.
  This work provisions no collector, connection, alerts or other infrastructure,
  and adds no logging dependency.

## Consequences And Evidence

The audit UI and audit projections continue to work. New events explain changes;
legacy read rows remain historical data. Read failures no longer depend on audit
insertion or a read-rate counter. Reasons are free text: names or email addresses entered there reach the operational logs.
Operational logs have their own retention and
access controls, owned by the deployment operator.

`tests/admin.test.ts` verifies zero read audits, one audit per mutation, reads above
the retired limits, content/download 429s at all three caps and structured logs.
`tests/transcription.test.ts` verifies unaudited original downloads/previews while
upload mutations still audit. `tests/unit.test.ts` checks the logger's explicit
fields, request correlation, UTC time and single-line JSON. The browser admin
suite verifies required reasons, cap errors and the mutation-only write behavior.

See the rejected
[read-auditing approach](../out-of-scope/admin-read-auditing.md).
