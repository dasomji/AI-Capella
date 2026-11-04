# Transcription evaluation fixtures

All checked-in notation is original synthetic material dedicated to CC0-1.0.
Generate with `npm run eval:fixtures` (Verovio engraving → PNG → PDF via pdf-lib;
sharp creates deterministic skewed, rotated, noisy, blurred JPEG photos).
Do not use the bundled sample songs without independently verifying redistribution
rights. No copyrighted score has been added here.

Each case directory contains `manifest.json` (PDF job), `photos.json` (photo job),
`reference.musicxml`, original PDF/photos, per-page references, recorded rasters and
recorded structured provider responses inside the manifest. Required metadata:
kind (vocal/instrumental), divisi, accompaniment, lyrics, photoQuality, and license.
Pages specify source, contentType, sourcePage (one-based), reference,
recordedRaster, recorded {musicxml, uncertainties, flags}.

Add realistically dense, legally redistributable multipage SATB with lyrics,
independent divisi voices, two-staff piano accompaniment, transposing instrumental
band parts, tuplets and imperfect phone photos. Record source/license/permission.
The present short exercises are harness smoke fixtures: named divisi/piano/band
parts do not establish coverage of those complex musical idioms. Per-page
references must match actual engraved page boundaries (regenerate/check when
engraving settings change). No evaluation result establishes production accuracy.

`npm run eval:transcription -- --dry-run` is safe offline, including in CI: it
renders recorded PNG rasters for PDF jobs and distinct degraded JPEG photos for photo jobs through the bounded renderer and replays responses
at the SDK HTTP boundary. It does not exercise PDF rasterization (Poppler).
Live: `OPENAI_API_KEY=... npm run eval:transcription -- --set eval/fixtures --confirm-paid --pages --limit 1`.
Provide keys in the shell environment, never in files committed to Git. Live mode
requires Python3, libseccomp2 and Poppler, as for the worker; use its Docker image
if the host lacks these. The harness uses local file storage, no app DB or S3.
`--limit` bounds jobs, each page has at most 3 attempts and a 180-second deadline.
Configure USD per million input/output token rates with TRANSCRIPTION_PRICE_TABLE,
e.g. '{"gpt-6.1-sol":{"input":1,"output":2}}' (illustrative, not current pricing).
Missing prices report null/unknown. Reports default to gitignored reports/eval-*.
`--pages` prints per-page scores as well as job summaries. JSON always retains
per-page metrics, validation diagnostics, uncertainties, outcomes and attempts.

The bundled original CC0 study `eval/samples/round.musicxml` adds two voices per part,
two verses, ties and a repeat. It remains synthetic smoke material, not a measured
recognition-quality corpus. Dry-run token counters and all derived costs are synthetic.
Jobs are selected in sorted manifest-path order. Each job is appended to JSONL and
checkpointed to JSON; the final JSONL record summarizes completion.
