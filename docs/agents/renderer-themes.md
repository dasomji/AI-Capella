# Renderer theme inputs

Canvas consumers read the immutable `design-system/theme` snapshot. `theme.ts`, `palette.ts`
and `design.ts` retain only the compatibility bindings still used by callers. Fonts at canvas
sinks use `snapshot.fonts`; part assignments use `colorForPart(index, count, snapshot)`.

A snapshot selects typed material strategies from the authored `material-fibre` and
`color-scheme` roles: paper versus waves, ink versus additive light. The formulas, trace paths,
notation geometry and animation timing remain in their original renderer modules. CSS minifiers may
serialize sRGB tokens as named colors; the accessor resolves valid names through a cached canvas
on the snapshot cold path and still rejects invalid/contextual values. The traced
Light word is paired with the bundled Italianno face; another script requires another trace.

`main.ts` subscribes without registering a quiet-moment preference handler. It reassigns DOM
voice colors and repaints covers, marks, overview and the open score view without changing audio
or rehearsal state. Font completion rebuilds metrics. Neither color, material nor type swaps
reload the page. Roll bitmaps/buffers and overview layers compare theme revisions; paper tiles
compare material inputs (ignoring their own generated CSS image notification). Pattern caches
are per context; existing dimension/DPR keys remain. Title subscriptions dispose with their
animations and invalidate all retained sprites/layers. Use the runtime fibre input
`--ds-material-fibre-live`; do not overwrite the selected `material-fibre` role.

PDF jobs capture immutable print roles before loading the engraver. The default remains dark
notation on white, independent of the display theme. `PdfRequest.print` accepts an explicit
print snapshot for other output. Generated SVG presentation is mapped after `safeSvg`; its
exact recognition of Verovio's external stylesheet is unchanged. Print font names identify the
bundled LiberationSerif/LightScoreEngraving assets; new print families require matching assets.
A4, margins and engraving defaults remain in `exportPdf.ts`.

## Known role gaps

`TODO(AICAP-28 role)` comments identify the closest existing roles used where P1 had no exact
input. They cover gel deep shading; lantern cavity/through-hole shading and lamp glow;
individual title/ribbon warm/hot temperatures and the wordmark rim; the velvet cover ground, six wave shades and
two grounds; separate paper strand, warm fleck and transmitted-light pigments. These preserve
formulas but have visible color differences. Add the distinct roles centrally before claiming
pixel parity for those effects. Do not reintroduce local pigment fallbacks.

## Guard exceptions

The remaining `paper.ts` channel-flow entries are noise recipe triples `[cellsX,cellsY,weight]`,
not RGB. `staffView.ts`'s `black` labels select filled SMuFL notehead stem geometry.
These exact legacy entries remain visible in the shrinking baseline. Coverage masks use the
opaque print-paper input; only its alpha contributes to destination-in/out operations.

## Static brand exception

`public/favicon.svg`, `public/manifest.webmanifest`, `public/icon-192.png`, `icon-512.png`,
`icon-maskable-512.png` and `apple-touch-icon.png` remain fixed default-brand artwork. They do not
inherit page CSS; installed OS icons/splash screens are not part of live screen swaps. Their
existing literal baseline entries stay visible. The favicon/manifest ground is the historical
night-paper brand ground; favicon voice paths retain the original 4-voice brand spectrum.
The theme controller updates browser chrome metadata live. Future brand changes must generate
these assets from the token source together, rather than recoloring each asset independently.
