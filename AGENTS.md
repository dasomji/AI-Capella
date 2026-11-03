# AI-Capella production (fork)

This repository is the **production fork** of the AI-Capella / LightScore prototype
(`github.com/Emanorick/AI-Capella`). The prototype stays online and unchanged; all work for the
production version happens here (`github.com/dasomji/AI-Capella`, default branch `main`).

The canonical spec is Plane epic **AICAP-1**; its children AICAP-2 … AICAP-22 are the delivery
breakdown. Snapshots of every ticket live in `docs/spec/AICAP-*.md` (exported 2026-11-03). The
phase plan and progress log live in `docs/PLAN.md`.

## Guardrails (all agents)

- Never touch the upstream prototype repo, its Firebase project (`ai-capella`), its live Cloud
  Functions or its scan service. Read its code here only as reference.
- Provision nothing: no Railway/Coolify deployments, no production databases or buckets, no
  secret rotation, no sending real email, no endpoint retirement. Local Docker (rootless context)
  is fine for Postgres, SeaweedFS and test mail.
- Routine tests never call paid AI providers or Resend. Stub them at the external boundary.
- Secrets: never commit `.env` files, keys or tokens; only `.env.example` with placeholders.
- Preserve musical behavior: `audioEngine.ts`, MusicXML/MIDI parsing, score timeline, piano roll,
  staff view and PDF export must keep working. Move them, do not rewrite them.
- Design: new screens use the existing visual language (parchment, gold ink, Bodoni/Atkinson
  fonts, `design.ts`, `parchment.css`, `palette.ts`) and German/English strings via `i18n.ts`.
  Do not introduce a new UI kit or CSS framework.
- Domain words: *ensemble*, *ensemble lead*, *music piece*, *member*, *sysadmin* (platform role).
- Time: instants are `timestamptz` (`timestamp(..., { withTimezone: true })`), business/display
  zone is configured centrally (UTC initially), logs use UTC.
- Commit in small, descriptive commits on the current working branch. Do not push, do not open
  PRs, do not rewrite history.
- If something is genuinely blocked (missing credential, unclear product decision), record it in
  `docs/PLAN.md` under "Open questions" and continue with the rest.

<!-- BEGIN PLANE PROJECT -->

## Plane project

- Workspace: Audiopoesis
- Workspace slug: audiopoesis
- Workspace ID: 2ec572bc-f65e-4d5a-9dda-860528b07406
- Name: ai-capella
- Identifier: AICAP
- Project ID: 33337ef4-71fd-4c71-b28e-53699eea152c

<!-- END PLANE PROJECT -->
