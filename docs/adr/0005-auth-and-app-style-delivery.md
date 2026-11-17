# Auth and app style delivery

Status: accepted for AICAP-28 P6d parity cleanup.

The auth graph previously imported player, library, panel and account recipes through shared
control dispatch. Its single render-blocking CSS also contained all app utilities.

Base recipe factories now accept typed pure extensions; app modules compose them with area
recipes. The shared adapter/part implementations instantiate either base or app recipes.
No mutable registration or asynchronous appearance lookup is needed.

`tokens.css` remains the authored value source. At build time, `design-css-split.mjs` restricts
`app.css` to foundation utility sources. `/app` eagerly SSR-links `workspace.css` after it,
with the same layer declaration and all app utilities. The offline shell links both before
startup and the service worker precaches their finalized assets.

The app output deliberately repeats shared utilities in Tailwind's complete ordering. Simply
moving disjoint utilities to a later stylesheet could change winners when area and primitive
classes coexist. Repetition costs some app transfer bytes, while retaining the exact cascade
and reducing auth transfer. Both the route measurements and offline browser flow verify the
built output. Development retains the full catalog stylesheet.
