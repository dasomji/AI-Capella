# Sysadmin oversight and management (AICAP-20 / AICAP-26)

Run provisioning only in the trusted server environment, with `DATABASE_URL` set:

```sh
npm run admin:grant -- verified-person@example.org
npm run admin:revoke -- verified-person@example.org
```

Both commands require an existing verified email and write an audit event. The CLI and web controls share a transaction lock and cannot revoke the final sysadmin. The
operator is identified by server CLI source and OS user; there is no web-session
actor for a CLI operation. Repeating a command is safe and still audited. No
signup, ensemble leadership or capability grant provisions a platform role.
Revocation applies on the next request. No admin socket subscriptions exist.

Open `/admin` or use the account sheet's Administration / Verwaltung link.
The link uses a fresh online `/api/me` decision and does not block offline account
controls. Every admin page and API request checks current session and platform
role in PostgreSQL. Anonymous and non-sysadmin callers receive 404, including
unknown admin routes and requests without an Origin. Authorized mutations still
require a trusted Origin. All admin responses use `Cache-Control: no-store`.

## Endpoints

All paths below start with `/api/admin`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/users`, `/users/:id` | Users and safe account/session detail |
| GET | `/ensembles`, `/ensembles/:id` | Ensembles, counts, original storage |
| POST | `/ensembles/:ensemble/members` | Directly add an existing user with explicit permissions |
| PATCH | `/ensembles/:ensemble/members/:member` | Change lead/capabilities with an expected permission snapshot |
| DELETE | `/ensembles/:ensemble/members/:member` | Remove a member through the shared lead-removal operation |
| POST | `/ensembles/:ensemble/invitations` | Invite an email without an account through the shared invitation flow |
| PUT | `/users/:id/sysadmin` | Grant/revoke a verified account's platform role |
| GET | `/memberships`, `/invitations` | Paginated relationships / invitation states |
| GET | `/pieces`, `/pieces/:id` | Piece metadata and transcription job link |
| GET | `/pieces/:id/versions`, `/pieces/:id/originals` | Versions / original metadata |
| POST | `/pieces/:id/content` | Reasoned current score body access; operational stdout log |
| POST | `/pieces/:id/originals/:object/download` | Reasoned 60-second signed original URL; operational stdout log |
| GET | `/audit` | Audit browser without arbitrary event metadata |
| GET | `/transcription/jobs` | Cross-ensemble job summaries, no results |
| GET | `/transcription/usage` | Existing usage/cost and latency groups |
| GET | `/transcription/metrics` | Existing attempt metrics |
| GET | `/transcription/failures` | Failure counts by reason |
| GET, PUT | `/transcription/control` | Stop status / reasoned, audited toggle |

Lists accept `limit` (1–100, default 30), `cursor`, `search`, `sort`
(`id`, `created`, `updated` for pieces, `name`, `email` for users/memberships/invitations, `ensemble` for memberships), `direction` (`asc`, `desc`). Cursor order has an ID
tie-breaker and preserves PostgreSQL timestamp precision. Versions use `(version_no DESC, id ASC)` keysets; originals use an opaque ID cursor in ascending ID order. Filters are in
`src/api/admin.ts`: verified/sysadmin for users; ensemble/format for pieces;
actor/target/targetType/action/outcome for audit; state/ensemble for jobs.
Relationships can be scoped with user or ensemble. `from` / `to` filter creation
time (`sort=updated` independently orders pieces by update time), as half-open `[from,to)` ranges. Inputs require ISO
instants with `Z` or an explicit offset. Usage ranges are limited to 366 days.

Initial detail sections are batched into one detail endpoint and use the same bounded lists (30 rows plus opaque continuation cursors): memberships, invitations, pieces,
jobs and audit history are never embedded as unbounded arrays. User detail shows
active-session count, last active, coarse device groups and the latest sign-in
among still-active sessions. It cannot reconstruct sign-ins after session
retirement; no durable historical sign-in ledger existed in earlier phases.

## Interface (AICAP-28 redesign, D06 A / D16 A / D12 B)

The administration uses the shared LightScore design in a compact layout: one top bar
(brand → rehearsal, DE · EN), one section navigation (Users · Ensembles · Pieces ·
Transcription · Audit log) and routed detail pages `/admin/users/:id`,
`/admin/ensembles/:id` and `/admin/pieces/:id` (no side drawer). The active section and
id come from the router splat on server and client alike, so direct loads hydrate
cleanly; `<html lang>` follows the selected language.

Every list (users, ensembles, pieces, audit, transcription jobs, memberships) is one
TanStack Table 9.3.1 component with server-side search/filtering, header sorting and
cursor pagination (`src/admin-data-table.tsx`). List filters live in the URL, so Back
and the detail breadcrumb return to the same filtered list. Below 600 px, record tables
become labelled records; metric tables keep their columns in a contained scroller.

Membership management lives on user and ensemble detail pages: rows show role and
permissions with always-visible **Edit** and **Remove** actions. Edit opens a centered
dialog with staged checkboxes, a before → after summary and the required reason; Add
member / Invite by email are dialogs with the reason in the same form. Removing a member,
revoking sysadmin and stopping transcription are destructive confirmations with their
consequence stated and a required reason. A 409 `stale_permissions` keeps the edit
dialog open, reloads the row and resets the draft for review. The platform-role panel is
on the user page: the target must have a verified email; you cannot revoke your own role
or remove the final sysadmin. Content view and original download are reasoned, audited
confirmations on the piece page.

There are no global delete, impersonation or export controls. Private
detail access is audited. Content and originals require an explicit confirmation;
POST bodies require a nonempty `reason` (maximum 1000 characters). Stop toggles
require `{ paused: boolean, reason: string }` with a nonempty reason. The server emergency-stop environment flag also applies;
the UI cannot override that flag. Audit events
contain actor, target, action, outcome and timestamptz, never score bodies.

Management requests require `reason` (trimmed, 1–1000 characters). Membership
additions require `{ userId, permissions }`; permissions are four explicit booleans:
`isLead`, `manageMembers`, `editPieces`, `transcribe`. PATCH sends `permissions`
and `expected` (the previous four booleans); DELETE sends `expected`. Role PUT
sends `{ sysadmin, expected }` (booleans). Stale snapshots return 409
`stale_permissions`; refresh before retrying. All bodies also include `reason`.

Ensemble-row locks serialize admin and ordinary lead operations. Last-lead
protection remains in the shared domain operation and deferred database trigger.
Removal commits before the existing membership notification runs, invalidating
account rooms, rehearsal authorization and the client's existing offline/cache
membership checks. It does not log the member out of unrelated ensembles.
Platform role writes (including CLI) take an exclusive advisory transaction lock;
other management writes take its shared counterpart and recheck the actor's
verified database role while holding it. The membership snapshot check prevents
silent lost updates; each successful change and its audit row commit together.
Rejected authenticated attempts record a safe failure outcome; untrusted Origins
are recorded after concealment/authorization. Audit payloads contain reason and
before/after permission booleans, never invitation tokens or credentials.

Invitations reuse the existing SHA-256 token, 14-day expiry, budgets, idempotency,
mail transport and acceptance. They grant capabilities, with lead promotion
available after acceptance. Migration 0018 adds `admin_issued` so acceptance checks
the issuing sysadmin's current verified platform role rather than requiring an
ensemble membership. Role revocation revokes their pending admin-issued invites.
Development/test mail uses capture or Mailpit; tests never use real mail.

Management actions share an additional database-backed 20 requests/minute/actor
limit (including invalid attempts), alongside the existing limits below.

Admin list/detail/statistics reads have no per-actor read limits; lists and member
tables use bounded server pagination/search. Content/download actions share 10 per minute, 30 per hour and 200 per day per actor, persisted in PostgreSQL. A rejected request returns 429 with the specific cap and waiting instruction.
No credentials, session identifiers/tokens, raw user agents/IPs, invitation
hashes, object keys or provider prompts appear in oversight projections. Content
hashes are deliberately visible in version/original metadata. Download URLs are
limited to the chosen original and expire in 60 seconds.

Migration 0013 adds ordering/audit indexes and `pg_trgm` substring-search indexes;
the migration role must be able to install the PostgreSQL `pg_trgm` extension.
Admin JSON instants carry the configured business-zone offset; array responses
name the zone in `X-Display-Time-Zone`. The UI receives `APP_TIME_ZONE` from the server and uses `adminInstant` for all
instants in the selected language, with a zone abbreviation (or numeric offset) and full ISO instant tooltip. The configured zone defaults to UTC.

## Verification

`tests/admin.test.ts` runs through the real HTTP/session boundary in the isolated
integration harness. `scripts/browser-admin.mjs` runs via:

```sh
PATH="$PWD/.review-evidence/bin:$PATH" npm run test:integration
BROWSER_SCRIPT=scripts/browser-admin.mjs npm run test:browser
```

The first PATH addition selects the existing local Poppler runtime on this test
host; other machines can use their installed `pdftoppm`. Browser screenshots and
an HTML contact sheet are written to `/tmp/aicap-p5b-design/shots/index.html`. Fixtures
use local services only, with no paid provider calls or real mail.

## Phase 5b review hardening

The outer HTTP boundary decodes and trims the path and matches admin prefixes
case-insensitively, for every method. The route's `beforeLoad` separately calls a
server function that reads the current session and PostgreSQL role, throwing
`notFound()` on failure. The integration test derives endpoints from the Hono
router, exercises case/encoded variants and HEAD/OPTIONS as anonymous, member,
lead and manager, and asserts all registered admin APIs belong to the guarded
router. Keep that assertion when adding endpoints.

The in-app audit records mutations and their outcomes: membership changes, role
changes, invitations, CLI writes and transcription control. Collection, detail,
statistics, score content, original downloads and original page previews add no
audit rows. Existing historical rows are preserved. Mutation audit rows still
commit atomically with the change or record a rejected outcome after savepoint
rollback (ADR 0002). Audit views expose safe reason excerpts and ensemble scope.

Required content/download reasons are emitted by the existing server logger to
structured stdout (`event=admin.content_access`, UTC timestamp, request ID, actor,
target type/ID, reason). Content/download cap hits emit `event=admin.cap_hit` with
UTC timestamp, request ID, actor, cap kind, maximum and window milliseconds.
Grafana receives operational logs through the deployment log collector; no app
read audit replaces it. Alerting hook: match repeated content-hour/content-day
cap hits. Log collection, retention/access controls and alerts remain operator
work; this change provisions nothing. See [ADR 0007 (Proposed)](adr/0007-admin-audit-scope-and-read-limits.md).

Search, ID, cursor and reason strings reject NUL and unpaired surrogates. Typed
cursor validation rejects malformed timestamps, and PostgreSQL class 22 data
errors map to 422. Numeric counts/bytes/usage fields are JSON numbers.

Migration 0014 adds membership `(created_at,id)`, audit `(action,id)`, and job-ID
trigram indexes. Drizzle's PostgreSQL migrator wraps migrations in a transaction,
so CREATE INDEX CONCURRENTLY is unsupported here. The committed migration uses
regular CREATE INDEX; schedule a maintenance window for large existing tables.
The hand-written trigram index follows migration 0013's extension/index pattern;
`db:generate` reports no schema drift.

Date filters accept calendar dates in the server-configured business zone. The
client converts each date to its first instant and sends half-open `[from,to)`
bounds, including 23/25-hour DST days. Statistics default to seven calendar days
including today, ending at tomorrow's midnight; the All preset explicitly requests
all retained calls. Ensemble filters apply to usage, failures and job summaries.
The CLI records actual OS username, SUDO_USER, hostname and changed:boolean;
rollback errors are logged while the original operation error remains primary.

AICAP-26 browser journey (isolated PostgreSQL/Mailpit, with dev/test seed accounts):

```sh
BROWSER_SCRIPT=scripts/browser-admin-management.mjs BROWSER_EVIDENCE=/tmp/aicap-admin npm run test:browser
```

It covers table search/sort/paging, routed detail pages and Back, add/edit/remove dialogs
with reasons and audit rows, stale snapshots, last-lead and self-revoke errors, German at
phone width with touch-size actions, `<html lang>`, the 599/600/601 record breakpoint and
error-free direct loads of every admin page. `scripts/browser-admin.mjs` additionally
checks stop/resume consequence text and their audit rows, and that populated metrics never
widen the page at 768/600/390 px.
The integration harness requires its configured local S3 service; set
`S3_ENDPOINT` to an isolated SeaweedFS instance. No preview database is used.

Web and CLI platform-role changes use `admin.user.sysadmin`, with `before.sysadmin` and
`after.sysadmin` in audit metadata. CLI events also identify their operator and host.
