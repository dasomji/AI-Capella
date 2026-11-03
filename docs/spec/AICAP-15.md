# AICAP-15: Extract the rehearsal controller and add migration-focused integration and musical regression tests

Outcome

Make the transport replacement reviewable in small steps and prove that auth, playback and notation behavior survives the refactor.

Acceptance criteria

Extract clear repository, rehearsal-controller/timeline and transport interfaces around existing integration points; keep AudioEngine independent of database/auth/Socket.IO and preserve existing musical behavior while migrating to the agreed TanStack Start framework.

Deterministic tests for clock offset/uncertainty, command order/revisions/idempotency, effective-time tempo changes, count-in/start-tone reset, loop anchors and late joins.

Real Postgres/HTTP/Socket.IO integration tests for unauthorized access, cross-ensemble guessed IDs, revoked sessions/membership, concurrent playback commands from ordinary ensemble members, join/reconnect snapshot consistency and backend restart.

Browser scenarios cover two or more clients, suspended audio/mobile resume, offline reload, shared-tablet logout/account switching and invitation acceptance.

Fixture-driven music import/transcription/export tests cover source preservation and actual timing; provider stubs exercise refusal, truncation, invalid XML, rate limits and cancellation. Live AI evaluation remains explicit and records quality, token usage, retries and cost; no monetary application budget is imposed initially.

Root/CI commands run appropriate client/server checks. Existing Firestore rules test invariants move to new server tests before rules are retired.

Evidence

src/main.ts has 3,830 lines; state orchestration at :1614-1821 and :3398-3449 are practical seams. src/sync.ts is transport/clock integration; src/library.ts is storage boundary. package.json:7-10 has no frontend test command. Existing checks are rules-test/ and omr-service/test/; scan API tests set OMR_SKIP_AUTH and do not prove production authorization.

Dependencies

Start before major transport changes; fixture contracts guide AICAP-7/8/9 and the scan tickets. Tests should verify behavior rather than mirror implementation.

Framework scope clarification (2026-11-03)

TanStack Start is the selected framework, so the earlier prohibition on an unrelated framework rewrite does not exclude this agreed migration. Preserve AudioEngine and musical behavior while moving application routing/server integration to TanStack Start. Add meaningful checks for email/password account onboarding, ensemble capability defaults/revocation, sysadmin isolation and the production/development object-storage interface.
