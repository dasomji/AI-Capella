# AICAP-28 — Unified design system: implementation plan

Synthesized by the orchestrator from the two read-only reviews:
- Theme/token inventory: /tmp/aicap-design/review-a-theme.md (A)
- Components + Tailwind mechanics: /tmp/aicap-design/review-b-components.md (B)

Branch: `design-system`, cut from `main` after PR #1 is merged. One PR for the ticket.

## Product owner's goal

"Use Tailwind in general. A unified design system with clear dependencies from where the design
system draws, so we can easily swap the theme without code changes in multiple places and then
forgetting about some components. Reusable components with Tailwind CSS and CSS variables to make
design changes easy." Decisions that need the owner are written down with screenshots; they answer
later.

## Ground rules for every phase

1. **Visual parity first.** The migration changes structure, not looks. Where two places use
   different values for what looks like the same role (5 golds, 4 button shapes, two surface
   palettes), keep each rendering as it is today by giving it a named token / named recipe
   variant, and list it in the decisions doc. Normalization happens only after the owner decides.
   Exception: clear bugs (A: no default `--gold`, so night-theme focus rings are invalid; admin
   ignoring an explicitly chosen theme; hex-only helpers mangling HSL voice colors >8 voices) are
   fixed, with a note.
2. **Dependency direction** (A §3, B §3):
   `src/design-system/tokens.css` (only place with raw values: primitives → semantic roles per theme)
   → `@theme inline` mapping (Tailwind utilities, semantic names only)
   → `recipes/` (pure typed class recipes, no React/DOM imports)
   → `react/` components and `dom/` builders (same recipes)
   → screens.
   Separately: `tokens.css` → one TS accessor (`readTheme`/`subscribeTheme`/`setThemePreference`,
   snapshot per revision, no per-frame `getComputedStyle`) → canvas/SVG/PDF renderers.
   Swapping a theme = one mapping block in tokens.css + one root `data-theme` attribute.
3. **Tailwind 4.3.5** with `@tailwindcss/vite`, prefix `tw:` (legacy class names like `.btn`,
   `.field`, `.hidden` would otherwise collide), Preflight not applied globally while legacy CSS
   lives (cascade layers: legacy layer below utilities). Default Tailwind palette/font utilities are
   disabled so components can only use semantic tokens.
4. **Hand-written typed recipe module**, zero runtime deps (B §3). React `<Button>` and DOM
   `createButton()` both call `buttonRecipe()`. No arbitrary aesthetic class overrides.
5. **Do not touch** audioEngine, MusicXML/MIDI parsing, score timeline, rehearsal clock/scheduling,
   the pianoRoll/staffView/overview/lantern algorithms or PDF engraving geometry. Only the color/
   font *inputs* of renderers move to the accessor. Preserve every `data-action`/`data-bind`/id hook.
6. **Guard** `npm run check:design-tokens` (A §CI guard, B §Guards): fails on raw colors/fonts and
   default-palette/arbitrary Tailwind values outside tokens.css, on new screen-scoped component
   selectors, and on forbidden imports (recipes importing React/DOM/app state). Starts with an exact
   legacy-violation baseline that may only shrink; baseline is empty at the end. Wired into CI.
7. Docs: replace the AGENTS.md "no CSS framework" rule with a short pointer to
   `docs/agents/design-system.md` (how to add a token, a theme, a component; the guard);
   ADR `docs/adr/0004-shared-design-system.md`; GLOSSARY entries for token/role/recipe/theme.
   Ticket-scoped plan/handoffs in `docs/work/AICAP-28/` (deleted before merge).
8. Every phase ends green: typecheck, `npm test`, build, plus the phase's browser checks; evidence
   (screenshots) outside git under /tmp/aicap-design/evidence/<phase>/.

## Phases

| Phase | Scope | Owner / parallelism |
|---|---|---|
| **P1 Foundation** | Tailwind + plugin, single CSS entry `src/design-system/app.css` (fonts, ordered legacy imports in a layer, tokens, utilities), complete `tokens.css` with *all* roles inventoried in A (colors, type, spacing, radii, shadows, z-layers, motion, score/voice, material, print), parity-preserving values for both night-paper and parchment (and the other retained presets), compatibility aliases for the old custom properties, theme controller + TS accessor replacing the duplicated bootstrap in `design.ts` / `__root.tsx` / `offline-entry.ts`, offline manifest coverage, SSR stylesheet link, guard with baseline, docs/ADR/AGENTS change. No component restyling yet. | Single agent. Everything else waits. |
| **P2 Renderers on the accessor** | theme.ts/palette.ts/design.ts constants → snapshot; canvas renderers (pianoRoll, staffView, overview, lantern, goldInk, inkWordmark, lightRibbons, titleStage/Staff, paper, artwork, backdrop) read inputs from the snapshot, caches keyed by theme revision; >8-voice color fix; print snapshot for PDF (dark-on-white default). Live color swap without reload is the target; keep the quiet-moment policy for font/material swaps. | 1 agent, parallel with P3 (disjoint files). |
| **P3 Primitives** | recipes + React + DOM adapters: Button/IconButton, Field/Input/Select/Textarea, Checkbox/Switch, Surface/Card, Badge, ToggleGroup, Toolbar, Status/EmptyState, Table appearance; then overlays: Dialog/Sheet (one native-dialog lifecycle), Menu, one Toast host. Old `ui.ts` exports become thin delegates. Showcase route (dev-only) rendering every primitive in React and DOM side by side for screenshot comparison. | 1 agent (owns recipes facade + ui.ts). |
| **P4 Screens** | (a) React auth/account/invite; (b) React admin; (c) vanilla isolated modules: ensemble-ui, transcription, intro/powerHint. | 3 agents in parallel after P3; none edits tokens/recipes/app.css/main.ts — they request additions from the P3 owner via their report. |
| **P5 main.ts slices** | library/search/banner/menus → account/ensemble nav + offline controls → player toolbar/mixer → tempo/key/goto/sections/export. | 1 agent, sequential slices. |
| **P6 Cleanup + guard to zero** | delete superseded legacy CSS, empty the guard baseline, full theme/route/offline matrix. | 1 agent. |
| **Review** | Sonnet 5.5 high reviews after P1, after P3, and at the end; findings fixed by Sol. | |
| **P7 Responsive QA** | Sol verifiers per viewport class — desktop (1440×900, 1280×800), tablet (768×1024, 1024×768), mobile (390×844, 360×740, short landscape 844×390) — every route and every overlay in both themes, DE+EN; fix what's off (within the design system, no one-off overrides); add to the decisions doc what needs the owner. | 3 agents in parallel (one per viewport class), fixes coordinated through file ownership. |

## Decisions doc

`/tmp/aicap-design/decisions/` — one entry per inconsistency (from A §5, B §5, and later QA):
question, where it appears (route + steps), screenshot(s) of every variant, options, recommended
default, what the migration does meanwhile (parity). Published to the owner as a page.
