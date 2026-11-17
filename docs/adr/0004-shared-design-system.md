# 0004: Shared design system with one CSS-variable source

Status: accepted for AICAP-28; browser support decision D19 remains open.

## Context

Production has independently authored CSS, canvas palettes, fonts and scoped admin/auth/
transcription values. CSS import order differs between the SSR root and lazy client, and
three appearance bootstraps can disagree. The owner wants Tailwind and reusable components
with one theme source, while visual normalization awaits owner decisions.

## Decision

Pin Tailwind and `@tailwindcss/vite` to 4.3.5. Use prefix `tw:` to avoid legacy class
collisions and omit global Preflight. The single eager `src/design-system/app.css` orders
fonts, tokens and named native/component residue behind layers: theme, fonts, tokens, native,
components, utilities. The legacy layer and its five stylesheets are removed. SSR and the offline shell link the generated CSS before startup;
the existing finalized service-worker manifest continues to cover CSS and fonts.

`tokens.css` owns primitives, complete semantic mappings for all retained themes, type
presets, breakpoint definitions and the inline Tailwind adapter.
Reset the default Tailwind token namespaces; utilities expose semantic names. Preserve
existing differences as distinct roles until the owner decides. The guard baseline is zero and cannot grow.

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

D19 is **open with the owner**: Tailwind v4's browser baseline is Safari 16.4+, Chrome 111+
and Firefox 128+ ([official compatibility documentation](https://tailwindcss.com/docs/compatibility)).
This foundation does not assert that the choir's rehearsal devices meet that baseline. Keep
that support choice visible before rollout; do not silently substitute another Tailwind version.

See [the operating guide](../agents/design-system.md) for role additions, boundaries,
retained parity variants, guard exceptions and verification limitations.
