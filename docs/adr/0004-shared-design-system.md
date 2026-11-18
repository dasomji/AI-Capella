# 0004: Shared design system with one CSS-variable source

Status: accepted for AICAP-28, including the applied AICAP-28 foundation and component decisions below.

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
including pause/stop; repertoire or landing entry applies them, including membership-loss exits. Last request per category wins.
Renderers remain revision-aware so queued choices paint correctly at that boundary. Audio,
score parsing, timing and session protocol are untouched.

D18 retains immutable dark-on-white print roles and bundled engraving fonts. D20 strengthens
normal text to ≥4.5:1 and focus/control accent to ≥3:1; main secondary ink replaces faint muted
ink, and status inks are darkened where the sunken Parchment layer requires it. The contrast
contract covers flat layers; rendered texture/compositing also needs browser evidence.

See [the operating guide](../agents/design-system.md) for role additions, boundaries,
retained parity variants, guard exceptions and verification limitations.


## Additional applied owner decisions

**D06.** Administration uses the same LightScore paper, accent, typography and shared controls in a deliberately compact work layout. Its former independent palette is retired; D49 confirms routed user, ensemble and piece detail pages.

**D12 B.** Settings, prompts and small-screen main menus use centered native dialogs with safe viewport margins and a shared fade; transcription score review alone remains full-screen. Historical Sheet names are centered compatibility aliases; drag handles and swipe/slide behavior are retired. D48 makes small desktop main menus the explicit anchored exception.

**D13 B.** Compact member and transcription-job row menus remain anchored popovers at every width, including phones. Shared placement bounds their geometry and keeps long menus internally scrollable; small main menus follow D48; forms and panels retain D12 centering.

**D16.** People and membership tables use labeled records below the account breakpoint. Comparison and metric tables retain contained horizontal scrolling, while administration navigation scrolls horizontally. D49 confirms routed detail pages with member search.

**D23.** The tablet library uses fixed 280px comfortable card columns between the compact and transport breakpoints, showing fewer, wider covers instead of squeezing extra columns. Below the compact breakpoint the existing single-column phone records remain.

**D48 B.** All small menus opened through `openLibraryMenu` follow D48: library/player main menus, mode badge, ensemble picker, song-card and voice-row ⋯ menus, sections, and settings submenus. At the `transport` breakpoint (1200px) or above, with a fine primary pointer and hover, `menuPresentation()` chooses the typed `anchored` dialog recipe through `createMenuOverlay()`. Other widths/input use the centered dialog with backdrop; anchored backdrops are transparent. Native dialog/menu roles, Escape/outside dismissal and focus trapping remain. D24 fixes presentation and DOM identity for each opening; rotation only re-bounds it, and the next open adapts. If refresh removes or hides the anchor, placement retains its last valid rectangle and focus stays in the menu; dismissal restores the opener or the first available control in its nearest surviving containing region. Forms, tempo/bar controls and real panels stay centered (D12). Member/transcription-job disclosure menus retain D13 popovers at every width.

**D49 B.** User, ensemble and piece details remain routed pages with direct links and Back navigation. Detail member tables reuse the shared admin toolbar, EN/DE search labels, filtered-empty state and Clear filters. Search uses the same 250ms-debounced, server-paginated memberships endpoint and combined email/name/ensemble matching as lists; no full cursor crawl or client cache. Search, sort, filters and page-size changes reset page/cursor before the new render commits. Page indices clamp to available cursors; deleting the final row of the final page retreats before displaying an empty state.

**D24.** An open menu retains its chosen presentation and DOM identity through rotation. Shared viewport handling re-bounds and scrolls its contents; presentation is chosen again only for a later opening.

**D25.** At narrow panel widths, score review switches between score and original with one toggle above the panes. Wide layouts retain the side-by-side comparison switch; narrow layouts show only the selected pane and keep the return control reachable.

**D26 interim.** Until room permissions are designed separately, the EN/DE introduction describes the current Together behavior: everyone controls shared playback on every device; volume, mute and solo remain personal. It promises no missing “take the lead” command and introduces no new session permissions.

**D42 A (D21 approved).** Voices 9–16 use the approved theme-specific extension in `tokens.css`; `spectrum` retains eight entries for unchanged ≤8 spacing and `extendedSpectrum` exposes sixteen. Larger counts keep the existing fallback. Neutral number badges retain complete names in rows/chips and the always-available score key; pinned staff names and sufficiently wide roll notes carry the same number. Overview first-event callouts avoid collisions, deferring crowded/unison identities to the keyboard-accessible key with solo/inspect. Piece defaults store the mapping by part ID (`formatDefaults.voiceNumbers`), allocated from import order before display filtering; rename, reorder, removal/restoration and split allocation preserve identity. Existing imported pieces initialize their mapping on the next editable online opening; read-only/offline openings derive the same initial import order until persisted. Renderers and DOM pigments still follow live snapshot revisions (appearance requests remain held through rehearsal under D05).

**D43 A, pending comparison approval.** Keep Parchment voice 4 at `#5A8A2A`. The proposed `#527E26` may only be applied after the owner reviews real 8-voice roll/staff/mixer comparisons at 1440×900 and 390×844 plus linear-light Machado protanopia/deuteranopia/tritanopia simulations. Evidence is external under `/tmp/aicap-design/impl/d42-d47/d43-comparison/`. PDFs remain dark-on-white and do not consume voice pigments.

**D44 A.** Every account-deletion request verifies the confirmation password, including fresh sessions. Existing inline wrong-password handling, confirmation checks and password failure budget remain.

**D45 B.** Library cards retain complete wrapping titles. Cards stretch to their row height and their flex bodies place metadata at the bottom. D23's fixed 280px tablet width and phone records remain.

**D46 A.** Keep the existing 2× canvas backing resolution cap for playback performance; no renderer resolution change.

**D47 B.** The library menu title is “Settings” / “Einstellungen”; language remains one setting within it. The library introduction points to Settings.
