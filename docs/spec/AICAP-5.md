# AICAP-5: Support user-created ensembles with tenant isolation and server-enforced roles

Outcome

Any signed-in user can create multiple ensembles, become ensemble lead and manage memberships within explicitly defined permissions. Arbitrary new ensemble IDs work without a code deployment.

Acceptance criteria

Create ensemble + lead membership transactionally; list memberships from server; support renaming/switching, leaving, removing members and ownership transfer with a last-lead safeguard.

Replace hardcoded ENSEMBLES and known-ensemble checks; retain an explicit public demo/solo-practice experience and preserve existing ensemble names/mapping.

Define a permission matrix for ownership/administration, invitations, repertoire upload/edit/delete/reorder, scan creation and playback control. Ordinary members cannot create, update or delete music pieces by default; the ensemble lead may delegate ensemble-scoped capabilities.

Central server checks protect every HTTP operation, socket room join/command, job/upload/result and cross-ensemble song move; guessed IDs cannot bypass ensemble scope. Revocation removes connected access promptly.

Every current ensemble member can control synchronized playback in the initial version, regardless of member-management, music-piece-edit or AI-transcription capabilities. Do not require acquiring an exclusive conductor role. Configurable playback rooms and delegated room control are future work.

Ensemble/account switching disposes old room subscriptions, callbacks/timers and pending context before new ensemble state is shown.

Evidence

src/ensembles.ts:28-38 hardcodes ensembles; firestore.rules:23-26 duplicates list; main.ts:690-724 manages switching using reload. firestore.rules:125-137 permits member song/session writes. main.ts:1645-1685 only enforces active playback leadership in UI.

Dependencies

Better Auth + Postgres; provide shared authorization to socket, invitations and scans. Bring rules-test/test.mjs tenant-isolation cases into the new API/socket tests.

Confirmed permissions (2026-11-03)

Use ensemble for all groups, including choirs and bands; use ensemble lead as the group leadership title. Each new ensemble has a lead who can invite members and change their permissions. Ensemble leadership does not restrict initial playback control; all current members may control it.

Replace the earlier instruction to preserve broad member editing: ordinary members cannot create, update or delete music pieces by default. Working interpretation: the ensemble lead is the ensemble 'admin' with these default rights; platform sysadmin is a separate role.

Expose three independently assignable ensemble-scoped capabilities: member management (including invitations), music piece editing (create/update/delete), and music piece AI transcription. A lead can grant/revoke these for members of their ensemble. AI permission alone must not authorize creating/updating a library music piece; importing a result requires edit permission as well. Enforce permissions on the server and revoke access promptly. Member-management capability cannot grant platform sysadmin or move authority across ensembles; keep leadership transfer and last-lead protection explicit.
