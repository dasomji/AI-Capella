# Playback performance

How to measure whether the piano roll, the sheet view and the sound play smoothly on a slow
phone, and what was learnt doing it (AICAP-32). Measure before and after any change to
`pianoRoll.ts`, `staffView.ts`, `lantern.ts`, `paper.ts`, `overview.ts`, the render loop in
`main.ts` or the scheduling in `audioEngine.ts`.

## The profile

```sh
PERF_EVIDENCE=/path/outside/git node scripts/perf-playback.mjs \
  --scenario roll-dense,staff-dense --throttle 4 --seconds 20 --runs 3 --label before
```

It serves the real player through `scripts/owner-decisions-fixture.mjs` (stubbed API, no
database), emulates a 360x740 phone at 3x with touch, throttles the CPU, taps Play and writes
one JSON per scenario plus `summary.md`. Scenarios: `roll-demo`, `staff-demo` (six voices,
`public/evening-rise.musicxml`), `roll-dense`, `staff-dense` (eight voices, 160 bars, from
`scripts/perf-dense-score.mjs`), `roll-dense-voice` (the sung sound), `roll-dense-mixer` (a voice
switched every two seconds), `roll-dense-gel` (gel notes instead of the lantern).

| Number | Meaning |
|---|---|
| `frames` | Gaps between animation frames while playing: fps, percentiles, how many over 25/50/100 ms. |
| `draw` | Time inside `renderActiveView` per frame, from the development frame log (`window.__frames`). |
| `roll` | Buffer repaints (`rebuilds`), swaps of a stretch painted ahead, and stretches thrown away. |
| `longTasks` | Main-thread tasks over 50 ms. |
| `audio.scheduling` | The engine's top-ups: how long the longest took and how many audio nodes it made. |
| `audio.maxStallMs`, `clockRatio` | The audio clock against the page's clock. A stall is a gap in the sound. |
| `startMs` | From the tap on Play to the end of the first moving frame. |
| `heap` | JS heap growth between samples: allocation churn. |

`--trace` adds main-thread time by kind (script, commit, layout, GC) and the trace file;
`--profile` adds self time by function. Both slow the page: use them to attribute, not to compare.

## Reading it

- **Two render modes, neither a phone's GPU.** By default headless Chrome rasterizes canvases in
  software on the throttled main thread: a CPU-bound device, where every pixel filled counts.
  `--gpu` runs Chrome's accelerated-canvas path on SwiftShader: the main thread only records draw
  calls (as on a phone with a GPU), but SwiftShader saturates, so `frames` are meaningless there;
  read `draw`, long tasks, GC and the trace. A change should help, or at least not hurt, in both.
- **CPU throttling slows the main thread only.** The audio thread runs at full speed, so audio
  stalls measured here are a lower bound for a phone.
- **The host is shared.** Other agents' builds move the numbers by 10-20%. Run three times
  (`--runs 3`), compare medians, and never run two profiles at once.
- A real phone remains the final judge: `?fps=1` in the address shows frames per second, draw time
  and late frames on the device itself.

## What costs, and where it bit

- **Applying the playback state repaints nothing unless something changed.** Every Play, Pause and
  seek goes through `applyPlaybackStateNow`, which sets key, loop and so on again. A setter that
  invalidates buffers unconditionally stalls the first frame of every Play.
- **A canvas clip is rasterized over its whole area for every use.** The slurs' fade toward the
  words (`throughClips`) once clipped six times per voice through the whole buffer less every word:
  70-95% of the cost of painting the roll. Clip around what is drawn (`clipsAround`).
- **Painting ahead must finish in time and land in the right place.** A stretch that is not ready,
  or does not cover the view when the buffer in use runs out, is thrown away and everything in view
  is painted in one frame. `debugInfo()` counts `rebuilds`, `swaps` and `drops`; during plain
  playback `rebuilds` should stay at 0.
- **Painting into a canvas that is being drawn from copies it.** The browser snapshots a canvas
  when it is used as a source; the next write to it copies the whole backing store. Paint ahead
  into a spare buffer and swap, as the roll does.
- **Slicing changes the last bit of a pixel.** The same content painted in one piece and in slices
  differs by 1/255 on about 1% of the paper's grain, and at the level of anti-aliasing on slice
  edges. The product already shows both (paused after a jump, and while playing); compare a change
  against the same kind of painting.
- **Audio nodes cost from the moment they are made.** A note laid ahead is in the graph and its
  filters are processed, sounding or not. The lookahead is four seconds for that reason; eight
  overloaded the audio thread with the sung voice. Making many nodes in one task also stalls
  frames: the schedule is topped up a little on every tick.
- **Allocation per frame becomes garbage-collection pauses.** At x4 a major collection took
  80-95 ms. Keep gradients, arrays and closures out of the per-frame path where the inputs repeat.

## Checks

- `node scripts/browser-playback-schedule.mjs`: every note is started exactly once, at its own
  time and never late (usual timer, slowed CPU, a timer slowed to one a second, across a seek, both
  sounds), and voices that have sounded are let go of.
- Pixel comparison: render fixed, paused positions from the old and the new checkout with the same
  fixture and compare the screenshots; step the view forward first (rendering beat after beat) to
  exercise painting ahead and swapping. Check the comparison against itself first (two runs of the
  old checkout): a few pixels of the player's chrome differ from run to run.
