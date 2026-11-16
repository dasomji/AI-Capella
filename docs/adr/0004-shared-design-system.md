# 0004: Shared design system with one CSS-variable source

Status: accepted for AICAP-28 P1; browser support decision D19 remains open.

## Context

Production has independently authored CSS, canvas palettes, fonts and scoped admin/auth/
transcription values. CSS import order differs between the SSR root and lazy client, and
three appearance bootstraps can disagree. The owner wants Tailwind and reusable components
with one theme source, while visual normalization awaits owner decisions.

## Decision

Pin Tailwind and `@tailwindcss/vite` to 4.3.5. Use prefix `tw:` to avoid legacy class
collisions and omit global Preflight. The single eager `src/design-system/app.css` orders
fonts and legacy imports behind named layers: theme, legacy, tokens, components, utilities.
Base precedes parchment. SSR and the offline shell link the generated CSS before startup;
the existing finalized service-worker manifest continues to cover CSS and fonts.

`tokens.css` owns primitives, complete semantic mappings for all retained themes, type
presets, breakpoint definitions, compatibility aliases and the inline Tailwind adapter.
Reset the default Tailwind token namespaces; utilities expose semantic names. Preserve
existing differences as distinct roles until the owner decides. Existing raw renderer/
screen values remain under an exact, shrinking migration baseline, never as new authorities.

A self-contained JavaScript resolver is used by pre-paint SSR, offline startup, and the
client controller. Inject the same raw source rather than serializing compiled functions.
Imports are SSR-safe; the client accessor returns immutable revisioned snapshots of
concrete colors, fonts, spectrum, material and print inputs. Components depend on pure typed
recipes through React/DOM adapters; renderers depend on the accessor, never Tailwind or UI
components. Renderer subscriptions/cache migration and component restyling are later phases.

An AST-based token guard rejects new raw colors/fonts, palette/arbitrary aesthetic utilities,
scoped control selectors and forbidden recipe imports. It requires removing resolved baseline
entries and checks the immutable `3c9d43c` source ceiling, including baseline edits. Newly
versioned rules can merge pre-existing ceiling entries with `--merge-new-rules`; ordinary
migration remains shrink-only. The guard is conservative local analysis, not a security
boundary; its scan scope and data-flow limits are documented in the guide.

## Consequences and open decisions

Adding a theme requires one varying-role mapping block and one `themeRegistry` entry;
shared roles are authored once on `:root`, and the registry derives types, aliases and switching.
Until P6 removes the 110 legacy attribute selectors, new themes inherit the registry-selected
compatibility look in those components. Switching uses root `data-theme`; the existing Revival
preset remains orthogonal. Legacy aliases preserve hooks and appearance during staged
migration. Main's reload/quiet-moment behavior remains until renderer caches migrate in P2.
There is no new component runtime dependency or global reset.

D19 is **open with the owner**: Tailwind v4's browser baseline is Safari 16.4+, Chrome 111+
and Firefox 128+ ([official compatibility documentation](https://tailwindcss.com/docs/compatibility)).
This foundation does not assert that the choir's rehearsal devices meet that baseline. Keep
that support choice visible before rollout; do not silently substitute another Tailwind version.

See [the operating guide](../agents/design-system.md) for role additions, boundaries,
retained parity variants, guard exceptions and verification limitations.
