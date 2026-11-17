# 0004: Shared design system with one CSS-variable source

Status: accepted for AICAP-28, including owner foundation decisions D01–D05, D07, D18–D20 and D22.

## Context

Production has independently authored CSS, canvas palettes, fonts and scoped admin/auth/
transcription values. CSS import order differs between the SSR root and lazy client, and
three appearance bootstraps can disagree. The owner wants Tailwind and reusable components
with one theme source, with explicit owner decisions governing normalization of the foundation families.

## Decision

Pin Tailwind and `@tailwindcss/vite` to 4.3.5. Use prefix `tw:` to avoid legacy class
collisions and omit global Preflight. The single eager `src/design-system/app.css` orders
fonts, tokens and named native/component residue behind layers: theme, fonts, tokens, native,
components, utilities. The legacy layer and its five stylesheets are removed. SSR and the offline shell link the generated CSS before startup;
the existing finalized service-worker manifest continues to cover CSS and fonts.

`tokens.css` owns primitives, complete semantic mappings for all retained themes, type
presets, breakpoint definitions and the inline Tailwind adapter.
Reset the default Tailwind token namespaces; utilities expose semantic names. Retain role APIs, but collapse decided accent, paper and gold aliases into their shared families. The guard baseline is zero and cannot grow.

A self-contained JavaScript resolver is used by pre-paint SSR, offline startup, and the
client controller. Inject the same raw source rather than serializing compiled functions.
Imports are SSR-safe; the client accessor returns immutable revisioned snapshots of
concrete colors, fonts, spectrum, material and print inputs. Components depend on pure typed
recipes through React/DOM adapters; renderers depend on the accessor, never Tailwind or UI
components. Renderer subscriptions and caches follow snapshot revisions without changing playback state.

An AST-based token guard rejects raw colors/fonts, palette/arbitrary aesthetic utilities,
scoped control selectors, forbidden recipe imports and raw component CSS dimensions/durations.
Any non-empty baseline fails; migration switches cannot revive it. Structural exceptions name
non-theme data and explain their scope in code. The operating guide records the AST limits.

## Consequences and open decisions

Adding a theme requires one varying-role mapping block and one `themeRegistry` entry;
shared roles are authored once on `:root`, and the registry derives types, aliases and switching.
There are no legacy theme attributes or alias block. Revival remains an orthogonal token
preset. Shell utilities preserve behavior hooks; named CSS residue covers native parts,
canvas sizing/compositor hooks, global inheritance, keyframes and typed ink interpolation.
Element-local artwork inputs remain at consumers because root custom-property expressions
resolve at the root rather than at their eventual use site.

Material utilities retain distinct paper/waves and light-material recipes through CSS style
queries of `material-family` and `color-scheme` roles. This preserves current compound effects
and voice-local values without selecting a theme ID in component code. Each new theme defines
those strategy roles in its block. Device verification must include these style queries;
Tailwind's compiler floor alone is not evidence of their support.

Browser-installed SVG/manifest values are generated from default-theme roles at the Vite
boundary. Their source templates contain no parallel palette. Fixed raster artwork remains
asset data. The test-only fourth theme exercises screens/renderers with a new block and one
registry entry; no extra theme ships.

D19 adopts Safari 16.4+, Chrome 111+ and Firefox 128+
([official compatibility documentation](https://tailwindcss.com/docs/compatibility)). Inventorying
actual choir devices and checking floor-version material/style-query behavior remain rollout
requirements; the development Chromium checks do not prove them.

## Owner foundation decisions

D01/D02/D07 replace independent admin/transcription/offline palette entries with the main
application's accent, paper-layer and gold-ink families. Existing main values win over admin
colors, which were never designed. Intentional sunken/raised/overlay paper shades and material
occlusion, transmission and lighting remain separate. Gold marks use quiet shared ink stops;
branding can use the bright stop. D22 merges A01 to `#795315` and A02 to `#e8d8b6`.

D03 uses antique brand/piece titles and modern Atkinson instructional/body/control/lyric text.
D04 supports two main themes and the current title; legacy Velvet/title/ribbon/paper/Bodoni/gel
looks survive only as named experimental presets. Keeping legacy URLs avoids breaking device
preferences while making their support status explicit.

D05 B chooses rehearsal stability over immediate appearance feedback. All explicit, OS and
cross-tab theme requests, type/title requests and paper choices queue throughout the player,
including pause/stop; only repertoire entry applies them. Last request per category wins.
Renderers remain revision-aware so queued choices paint correctly at that boundary. Audio,
score parsing, timing and session protocol are untouched.

D18 retains immutable dark-on-white print roles and bundled engraving fonts. D20 strengthens
normal text to ≥4.5:1 and focus/control accent to ≥3:1; main secondary ink replaces faint muted
ink, and status inks are darkened where the sunken Parchment layer requires it. The contrast
contract covers flat layers; rendered texture/compositing also needs browser evidence.

See [the operating guide](../agents/design-system.md) for role additions, boundaries,
retained parity variants, guard exceptions and verification limitations.
