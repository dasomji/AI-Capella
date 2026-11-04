# Sysadmin oversight (Phase 5b / AICAP-20)

Run provisioning only in the trusted server environment, with `DATABASE_URL` set:

```sh
npm run admin:grant -- verified-person@example.org
npm run admin:revoke -- verified-person@example.org
```

Both commands require an existing verified email and write an audit event. The
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
| GET | `/memberships`, `/invitations` | Paginated relationships / invitation states |
| GET | `/pieces`, `/pieces/:id` | Piece metadata and transcription job link |
| GET | `/pieces/:id/versions`, `/pieces/:id/originals` | Versions / original metadata |
| POST | `/pieces/:id/content` | Audited current score body access |
| POST | `/pieces/:id/originals/:object/download` | Audited 60-second signed original URL |
| GET | `/audit` | Audit browser without arbitrary event metadata |
| GET | `/transcription/jobs` | Cross-ensemble job summaries, no results |
| GET | `/transcription/usage` | Existing usage/cost and latency groups |
| GET | `/transcription/metrics` | Existing attempt metrics |
| GET | `/transcription/failures` | Failure counts by reason |
| GET, PUT | `/transcription/control` | Stop status / reasoned, audited toggle |

Lists accept `limit` (1–100, default 30), `cursor`, `search`, `sort`
(`id`, `created`, `updated` for pieces, `name`), `direction` (`asc`, `desc`). Cursor order has an ID
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

There are no global delete, impersonation, role-edit or export controls. Private
detail access is audited. Content and originals require an explicit confirmation;
POST bodies require a nonempty `reason` (maximum 1000 characters). Stop toggles
require `{ paused: boolean, reason: string }` with a nonempty reason. The server emergency-stop environment flag also applies;
the UI cannot override that flag. Audit events
contain actor, target, action, outcome and timestamptz, never score bodies.

All authorized admin APIs share a PostgreSQL-backed limit of 120 requests per
minute per actor. Each primary list and version/original list additionally allows 30 requests/minute. Content/download actions additionally share 10 per minute, 30 per hour and 200 per day per actor, persisted in PostgreSQL. A rejected request returns 429 with the specific cap and waiting instruction.
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

Every successful admin collection request writes exactly one list audit event,
including endpoint, filter **keys**, ID filters only, and returned result count.
Membership reads use `admin.memberships.list`. Arbitrary searches/filter values
are excluded. Piece/ensemble-targeted events carry ensemble scope; audit views
expose only a 160-character reason excerpt for admin events. Detail bundles
retain one detail audit event and bounded sections, without per-section HTTP calls.

Cap hits emit structured UTC warning events with `event=admin.cap_hit`, actor,
cap kind, maximum and window milliseconds. Alerting hook: match that event in the
log collector and notify the operator on repeated content-hour/content-day hits.
No existing failure notifications are muted; infrastructure alert configuration
remains deployment/operator work.

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
