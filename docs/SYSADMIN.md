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
(`id`, `created`, `name`), `direction` (`asc`, `desc`). Cursor order has an ID
tie-breaker and preserves PostgreSQL timestamp precision. Version/original
sub-lists use an opaque ID cursor in ascending ID order. Filters are in
`src/api/admin.ts`: verified/sysadmin for users; ensemble/format for pieces;
actor/target/targetType/action/outcome for audit; state/ensemble for jobs.
Relationships can be scoped with user or ensemble. `from` / `to` filter creation
time, or piece update time, as half-open `[from,to)` ranges. Inputs require ISO
instants with `Z` or an explicit offset. Usage ranges are limited to 366 days.

Detail sections use the same bounded lists: memberships, invitations, pieces,
jobs and audit history are never embedded as unbounded arrays. User detail shows
active-session count, last active, coarse device groups and the latest sign-in
among still-active sessions. It cannot reconstruct sign-ins after session
retirement; no durable historical sign-in ledger existed in earlier phases.

There are no global delete, impersonation, role-edit or export controls. Private
detail access is audited. Content and originals require an explicit confirmation;
POST bodies accept an optional `reason` (maximum 1000 characters). Stop toggles
require `{ paused: boolean, reason: string }` with a nonempty reason. The server emergency-stop environment flag also applies;
the UI cannot override that flag. Audit events
contain actor, target, action, outcome and timestamptz, never score bodies.

All authorized admin APIs share a PostgreSQL-backed limit of 120 requests per
minute per actor. Content/download actions additionally share 10 per minute.
No credentials, session identifiers/tokens, raw user agents/IPs, invitation
hashes, object keys or provider prompts appear in oversight projections. Content
hashes are deliberately visible in version/original metadata. Download URLs are
limited to the chosen original and expire in 60 seconds.

Migration 0013 adds ordering/audit indexes and `pg_trgm` substring-search indexes;
the migration role must be able to install the PostgreSQL `pg_trgm` extension.
The UI receives `APP_TIME_ZONE` from the server and uses `adminInstant` for all
instants, including a numeric UTC offset. The configured zone defaults to UTC.

## Verification

`tests/admin.test.ts` runs through the real HTTP/session boundary in the isolated
integration harness. `scripts/browser-admin.mjs` runs via:

```sh
PATH="$PWD/.review-evidence/bin:$PATH" npm run test:integration
BROWSER_SCRIPT=scripts/browser-admin.mjs npm run test:browser
```

The first PATH addition selects the existing local Poppler runtime on this test
host; other machines can use their installed `pdftoppm`. Browser screenshots and
an HTML contact sheet are written to `/tmp/aicap-p5b/shots/index.html`. Fixtures
use local services only, with no paid provider calls or real mail.
