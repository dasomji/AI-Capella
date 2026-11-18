# Renderer theme inputs

Canvas consumers read the immutable `design-system/theme` snapshot. `theme.ts`, `palette.ts`
and `design.ts` retain only the compatibility bindings still used by callers. Fonts at canvas
sinks use `snapshot.fonts`. Score part assignments use `voiceColor(part, score, snapshot)` to
retain the stored part-number identity; decorative assignments use `colorForPart(index, count, snapshot)`.
The eight-entry `spectrum` preserves small-score spacing. `extendedSpectrum` resolves the approved
sixteen roles directly for larger scores; extending `spectrum.length` would recolor small pieces.
Neutral numbers/names remain available when pigments or overview callouts coincide. D43 keeps
Parchment voice 4 unchanged until comparison approval.

A snapshot selects paper versus waves from `material-fibre`, and a typed renderer strategy
from each theme’s `material-strategy` role (`ink` or `light`). Browser `color-scheme` does
not select renderer behavior. The strategy supplies paper kind (device choice or parchment),
lantern compositing, ribbon glow/line compositing and compatibility light flags. The formulas, trace paths,
notation geometry and animation timing remain in their original renderer modules. CSS minifiers may
serialize sRGB tokens as named colors; the accessor resolves valid names through a cached canvas
on the snapshot cold path and still rejects invalid/contextual values. The traced
Light word is paired with the bundled Italianno face; another script requires another trace.

`main.ts` holds appearance requests throughout the player under D05 B, then releases them on repertoire entry. Pausing/stopping inside the player does not release the hold. Explicit, OS and cross-tab theme/type/title requests use the controller; paper choices use the same category queue. Renderer subscriptions still follow applied snapshot revisions. It reassigns DOM
voice colors and repaints covers, marks, overview and the open score view without changing audio
or rehearsal state. Fonts already loaded cause one repaint pass; a pending font completion rebuilds metrics only
if its captured revision is still current. Neither color, material nor type swaps
reload the page. Roll bitmaps/buffers and overview layers compare theme revisions; paper tiles
compare material inputs. New textures are generated at idle with revision gating; a plain
new-theme ground is drawn until completion. Generated CSS fibre does not publish a new
semantic revision, and `paperchange` invalidates texture-dependent buffers on completion. Pattern caches
are per context; existing dimension/DPR keys remain. Title subscriptions dispose with their
animations and invalidate all retained sprites/layers. Use the runtime fibre input
`--ds-material-fibre-live`; do not overwrite the selected `material-fibre` role.

PDF jobs capture immutable print roles before loading the engraver. The default remains dark
notation on white, independent of the display theme. `PdfRequest.print` accepts an explicit
print snapshot for other output. Generated SVG presentation is mapped after `safeSvg`; its
exact recognition of Verovio's external stylesheet is unchanged. Print font names identify the
bundled LiberationSerif/LightScoreEngraving assets; new print families require matching assets.
A4, margins and engraving defaults remain in `exportPdf.ts`.

## Exact renderer roles

Unchanged material behavior retains distinct inputs in `tokens.css`: gel deep
shading, lantern cavity/occlusion/glow, paper strand/light/fleck/transmission, wordmark rim,
individual name/ribbon/stage/staff temperatures, wave shades/grounds, cover ground, keyboard
separator/shadow, row/hole-edge shadows and brand tile. Theme-independent inputs live in
`:root`; only varying inputs appear in every theme block. The concrete registry and generated
manifest include them; `renderer-theme.test.ts` pins unchanged historical values and the decided D02 paper grounds. D01/D02/D07 now unify accent, paper elevations and gold-ink families; material/wordmark gold aliases share the ink family, with a brighter branding stop and quieter mark endpoints. Gel, lantern and ink rendering algorithms remain unchanged. Other material purposes still require an owner decision before merging.

Visible shadows use opaque roles with the renderer's authored alpha. The DOM `backdrop` role
already contains alpha; using it here would multiply opacity and change the image. Paper's
cache key includes every texture input and ignores only its own generated image notification.

## Guard exceptions

The baseline is empty. Named structural guard exceptions recognize only `paper.ts` noise
recipe triples `[cellsX,cellsY,weight]`, `staffView.ts`'s filled/half stem-shape labels, optical
document white flattening, and the constant typed ink interpolation registration. They are
not theme inputs. Coverage masks use `canvas-mask`; visible gel highlights use
`material-gel-gloss-color`, independently of print paper.

## Browser-installed artwork

`design-system/assets/favicon.svg` and `manifest.webmanifest` use semantic roles.
`scripts/design-assets.mjs` resolves the default theme into development/build assets; external
icons cannot inherit page CSS. Installed raster icons remain fixed artwork data. Browser chrome
metadata updates live. No literal browser-asset palette remains in the guard baseline.

Adding a theme is one complete varying-role block plus one registry entry. Component material
strategies are chosen by token values, not theme IDs or legacy attributes.
`npm run test:browser:theme-extension` supplies a fourth theme only inside its fixture and
checks complete role resolution across screens and canvas renderers.

## Live-swap regression

`npm run test:browser:renderer-themes` starts a disposable Vite fixture and Playwright browser,
using isolated storage for retained/fresh instances. It compares exact canvas pixels for all
six directed swaps among night-paper, parchment and velvet, including velvet/parchment-start
rolls, staff, overview, paper, gel shades, stage fill, covers, title layers, ribbons and backdrop.
It checks the production DOM voice/repaint subscriber, idle completion ordering, warm frame
attribute/style reads, and rasterized PDF job-start print freeze. CI runs it after Chromium
installation. `pdftoppm` is used in CI; local environments may use Python PyMuPDF as a fallback.

`P2_MUTANT=roll|paper|overview|stage|lantern npm run test:browser:renderer-themes` applies the
reviewer's stale-cache or construction-only Lantern mutation inside the fixture's Vite
transform. Each invocation must fail at the affected pixel comparison. It never edits the
owner preview's source. `BROWSER_EVIDENCE` selects the external artifact directory.

Material strategy objects are selected lazily from current inputs. The roll drops/creates its
Lantern as its style changes; title ribbons select the current/earlier draft from the snapshot
and dispose/recreate their interactive field when that strategy changes. Explicit title drafts
and roll overrides remain device choices. Covers have no retained color state; title layers
and backdrop already invalidate through their theme subscriptions.

### Material strategy

Each theme authors `--ds-material-strategy: light | ink`, independent of its browser
`color-scheme`. The typed snapshot maps `light` to device-selected paper, source-over
lanterns and additive ribbons; `ink` to pergament, multiplied lanterns/glows and
source-over ribbon lines. Night paper/Velvet select `light`; Parchment selects `ink`.
These roles preserve the rendering strategies without using browser scheme as a material policy; D02/D07 deliberately change their paper/gold inputs.

### Canvas reset constants

The eight remaining literal `globalAlpha = 1` writes reset drawing state before the next
layer; they do not choose paint strength. The two `shadowBlur = 0` writes in `lightName.ts`
and `titleStage.ts` end the glow pass so the crisp foreground is drawn without shadow.
These are canvas state resets, independent of theme. Staff (12) and roll (18) sounding-note
glow blur are design values and now consume `score-staff-glow-blur` / `score-roll-glow-blur`.
