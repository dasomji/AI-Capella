# Musical client reference

Restored from the pre-production PROJECT.md, with production access and playback updates.
See [PROJECT.md](../PROJECT.md) for the server architecture.

### Repertoire / player split
The app opens on the **repertoire**: every song as a card with a **cover drawn from its own voice
lines** (each voice's pitch contour, sampled and smoothed, in the voice colours — `artwork.ts`
`coverDataFromScore`/`drawCover`; same piece, same picture on every device), its voice count,
bar count and key (named from the key signature, major unless the file's `<mode>` says minor; no
key is named for MIDI imports). Cards are parsed lazily one at a time so a large library doesn't
freeze the page. A search field appears once there are more than eight songs; files can be
dropped anywhere on the page or picked with **Add arrangement**; each library song's **⋯** menu
offers Rename and Delete. While the shared library loads, skeleton cards show; if it can't be
reached, a banner says so with a Retry button instead of silently showing only the sample. On
phones the grid becomes a list with small covers. **The order is set by hand** by the ensemble's
members with editPieces (`reorder.ts`; the API checks permission to change `sortKey`): a
long press on a card (on a laptop, the mouse button held, 420 ms) lifts it; it follows the pointer
or finger, the others glide aside around an empty slot, the list scrolls along near its edges, and
letting go puts it there -- for everyone in the ensemble: the song gets a `sortKey` halfway
between its new neighbours' places (`songOrder`: `sortKey`, else `importedAt`), one write; only
when there's no room left between them is the whole list numbered afresh (`saveSongOrder`, one
batch). Moving the finger before the card lifts scrolls, as before; letting go of a lifted card
doesn't open it. The bundled samples stay first and don't move; nothing moves in the public
folder or while searching (the list is only part of the order then). Picking a song switches to the **player**; the
back button always **stops playback** first — including, in Ensemble mode, for every other
connected device — so nobody is left with music playing to an empty player.

### The piano roll
- Canvas-based, not DOM/SVG — this matters at the note counts and frame rates involved (see
  §4.3).
- Horizontal axis = time (in quarter-note beats), vertical axis = pitch (one row per
  semitone). Each note is a rounded colored bar with its lyric syllable always in a lane beneath
  it (never inside the bar -- mixing both was confusing), sized so the bar plus its lyric both fit
  fully inside the note's own row even for tightly-spaced chords. The text grows with the row
  (10.5-15 px) and is set like a choral score: a light tint of the voice colour, hyphens between
  the syllables of a word and an extender line under a held syllable (from MusicXML's
  `<syllabic>`/`<extend>`, `NoteEvent.lyricJoin/lyricExtend`); the syllable being sung lights up.
- **Follows the music** (`setAutoFit`) -- switchable in the player menu ("Height follows the
  music") and on a laptop also with the height button in the zoom control or the **F** key
  (remembered per device, on by default): the
  rows zoom to the pitch range sung around the playhead by the voices in focus (every visible
  voice, or only the soloed ones while any are soloed -- soloing a voice zooms onto it), never fewer
  than 11 rows or taller than 56 px, and glide (420 ms) to a new range only when the music leaves
  the current one or it has become much wider than needed. The content buffer is repainted once at
  the new row height and scaled during the glide, so a zoom change doesn't cost a repaint per
  frame. A range wider than the screen holds even at the smallest rows is framed as well as it
  can be and left there while it drifts a little (`overfull`): it used to start a new glide every
  frame, which never arrived -- the roll stayed stretched (e.g. 1.34x in an SSAATTBB piece, 1.3x in
  Space Oddity) and its text soft. The lit syllables are scaled like the buffer under them (in
  height only), so they cover their copy exactly. Scrolling by hand takes over until the next Play. **Alt + wheel** (or Alt + trackpad
  pinch) sets the height by hand around the pointer (`zoomRows`, 32-64 px rows), switching
  follow-the-music off but starting from its current framing; on a phone a two-finger pinch with
  the fingers one above the other does the same (side by side it zooms time, as before). Notes are
  never taller than 22 px;
  extra row height becomes space between the lines.
- A fixed **ruler strip** along the top (28px) is the *only* place in the score a click or drag
  can set where playback starts, or define a loop region (the whole-piece strip below the score
  is the other). Everywhere else, clicking is inert for
  playback — it can only *preview* a note (see below) — so casual scrolling or tapping while
  the piece plays can never accidentally jump the playback position. A plain tap (not a drag)
  always **snaps to the start of whichever bar it landed in** ("grid locking"). Grid-locking only
  moves the playback-start mark; it deliberately does **not** recenter the view. The ruler also
  shows section letters as boxed rehearsal marks and the loop region with its two handles.
- **Going to a bar**: previous/next bar buttons (tap for one bar, press-and-hold to repeat and
  accelerate, 400ms → 60ms between steps), ←/→ on the keyboard, the **Go to bar** field (click the
  position readout on a laptop, or in the Tempo & key sheet on a phone -- empty at first, then the
  bar last typed for that song in this visit, since the bar being played shows beside it anyway),
  section letters, and a
  click on the whole-piece strip. All of these move the actual playback position (synced in
  Ensemble mode) and recenter the view on it.
- **Click-to-preview**: clicking a note anywhere in the main area plays that note's pitch
  (through the same synth used for playback, respecting the current transpose) and shows its
  name (e.g. "E3") in a small label above it for about a second. A small piano keyboard (white
  keys, shorter black keys, C labels) is drawn once just before the piece's first beat — part of
  the scrolling content, not a persistent sidebar — and clicking a key plays its pitch. See §4.3.
- **Notes** are rounded pills in the voice colour, with the lyric syllable printed *inside* the
  pill when it fits (like note blocks in vocal-synth editors) and in a small lane under it when
  the note is too short; a syllable in that lane is skipped if another voice already printed one
  at the same spot, so unison voices don't print over each other. Two voices sharing a staff
  (tenor 1 and 2, bass and baritone) that move together carry the words once in the file, on one
  voice's notes; the roll gives a bare note the syllable of a note of its part struck at the same
  moment for just as long (`shareLyrics`) -- not a note held in its own voice's melisma. Hyphens
  and extender lines follow each note's own voice. Notes under the playhead light
  up with a soft glow, and everything already played is shaded back slightly.
- **Rows are shaded like piano keys** (black-key rows slightly darker, a hairline under every C)
  so intervals and octaves read at a glance without a persistent keyboard.
- **Vertical scrolling**: if a piece's full pitch range doesn't fit the viewport at a
  comfortable row height, the roll scrolls vertically (mouse wheel / trackpad / touch drag). If
  it *does* fit, rows stretch to fill the available height and no scrolling is needed.
- **Horizontal panning while paused**: you can freely scroll left/right to browse the score
  while paused. The playhead line always reflects the actual paused/resume position, not
  wherever you've scrolled to — so it can visually move away from its usual spot (even off
  the edge of the screen) while you're just browsing, and snaps back the moment you press
  Play. While actually playing, horizontal panning is locked (the view follows the music) so
  the line and the audio can never visually desync.
- **Ties** (a note sustained across a bar-line, or any tie) are merged into a single note at parse
  time rather than kept as two notes joined by a line — see §4.2 — so a tied note renders as one
  seamless bar and plays back with a single attack, not a retrigger. **Slurs** are drawn in the
  title screen's ribbon style: a glowing thread in a light tint of the voice's colour, from inside
  the tail of each slurred note into the head of the next, with a small dot where it lands on each
  note (on top of the notes, lyrics above it — back-to-back notes leave no room for a bow between them).

### Sheet music view
An alternative view (the **Piano roll | Sheet music** switch in the player's top bar) for anyone
who reads traditional notation more comfortably — each voice gets its **own five-line staff,
stacked vertically** (never overlaid; the staves grow to fill the view's height, up to 1.4× on
phones and 1.3× on laptops, and spread out — the time axis grows only by the square root, so a
phone still shows a few beats), with barlines joining the staves into one system and a
classical thin+thick double bar at the end. All musical symbols — clefs (including the tenor's
treble clef with a small 8), noteheads, flags, accidentals, rests and augmentation dots — are
real engraving glyphs from the bundled SMuFL font (**Eugene**, the French engraving of around
1900; Bravura before November 2026), positioned with the font's own
anchor metrics (stem attachment points, flag origins), not hand-drawn shapes. Staff lines are a
neutral paper tone; notes, stems and flags carry the voice colour; lyrics sit at one fixed height
under each staff. A **pinned left margin** holds each voice's name, clef and key signature, and
the music scrolls under it (fading out at its edge), so clefs stay in view and lyrics never
collide with them. Muted voices leave the stack entirely instead of leaving a gap; ducked voices
dim. Real key signatures are shown, with accidentals only where they differ from the key or an
earlier note in the same bar; the time signature is deliberately not shown. Ties connect the
*original* tie-note boundaries from the file (§4.8), and rests fill silent gaps. Notes under the
playhead glow, as in the piano roll. It mirrors the piano roll's mute/solo/only-this-voice, zoom
and transpose (key-signature-aware, §4.8), and has its own ruler for grid-lock tap-to-seek.
**Not offered for MIDI-imported songs** (no real notated spelling to show, §4.8).

### Playback & transport
On a laptop, one transport bar runs along the bottom: the position readout (click it to go to a
bar), previous bar / Stop / Play / next bar, Loop and Metronome toggles, and steppers for tempo
(♩ = 100; click the value for presets and a custom field) and key (e.g. "G · +2"). On a phone
the same controls become a **dock** within thumb reach — Stop, previous bar, Play, next bar,
Loop — with an **info row** above it (bar, tempo, key, metronome) that opens the **Tempo & key**
sheet: tempo stepper and presets, custom tempo, key stepper with the transposed key's name,
metronome switch, section letters, and Go to bar. The screen is kept awake while music plays
(Screen Wake Lock), so a phone on the music stand doesn't lock mid-song. Every duplicated control
shares one delegated `[data-action]` handler in `main.ts`, so the laptop bar, the dock, sheets
and popovers can't drift apart.
- **Stop** returns to the loop region's start (if one is set), or the last point you tapped in
  the ruler, or the very beginning. Pressing Stop again while already sitting at that point
  goes the rest of the way back to beat zero.
- **Keyboard**: Space plays/pauses, ←/→ step a bar, L toggles loop, M toggles the metronome
  (all ignored while typing in a field or while a dialog is open).
- **Tempo**: presets (50/80/100/120/140), − / + in steps of 5, or any custom value (20–300).
  Opening a song never carries over the previous song's tempo: it starts at the song's saved
  default, else the first tempo written in the file (MusicXML `<sound tempo>` or a metronome mark,
  MIDI set-tempo; `Score.tempo`), else 100. Changing it while playing reschedules
  from the current position without a perceptible jump.
- **Metronome**: an optional click on every beat pulse (accented on downbeats), synthesized
  the same way as the notes.
- **Count-in ("Einzählen")**: pressing Play with the metronome on first counts out one full
  measure at the target tempo/time signature (correctly spaced for compound meters like 6/8)
  before the music starts — synced across every device in Ensemble mode. Only a genuinely
  **fresh** playback start triggers it (after a Stop, at the start of a piece, or after a
  seek) — never a plain Pause→Play resume, and never a tempo/key change or a seek while already
  playing. Tracked by a `freshStart` flag (`sync.ts`), see §4.7. A late-joining device skips the
  count-in and joins the music already in progress.
- **Starting tones ("Anfangstöne")**: a toggle next to the metronome (in the Tempo & key sheet on
  a phone), off by default and synced like the metronome. When on, every Play (a resume too)
  first sings the starting note of each voice that sings in the bar playback starts in — the note
  sounding at the start position, else its next note within that bar; voices entering later are
  left out — one after another in the score's voice order, top to bottom. Each is a synthesized
  "du" (`playDuNote` in `audioEngine.ts`: a sawtooth source through "u" vowel formants, F2 gliding
  down at the onset for the "d"), one beat apart at the current tempo; then all of them together
  as the chord (two beats), half a beat's breath, the count-in if the metronome is on, then the
  music. Synced in Ensemble via `PlaybackState.startTones` (explicitly `[]` on every other play
  publish — merge-write rule). A late joiner skips them.
- **Loop**: either loop the whole piece, or mark a region — drag across the score's ruler, or
  (with a mouse) across the whole-piece strip — and loop just that. The Loop toggle decides
  whether hitting the boundary wraps around or stops there.
- **Whole-piece strip**: below the score, every voice drawn as a thin line across the entire
  piece, the loop band, the played part shaded, the playhead, and section letters (laptop).
  Click to jump to that bar; drag with a mouse to mark a loop; on touch, drag to scrub through
  the piece (committed on release). Rendered once per size/mix change and only blitted per frame
  (`overview.ts`).
- **Transpose** (±7 semitones) and **Zoom** (25%–300%; − / + at the score's corner on a laptop,
  pinch on touch, ctrl/pinch-wheel on a trackpad) apply live, including mid-playback. The time
  zoom is kept **per view** (`zoomOf.roll` / `zoomOf.staff` in `main.ts`): notation needs far more
  room per beat than the roll's bars, so zooming one leaves the other as it was. At 100% the sheet
  view draws 120 px per beat on a laptop and 76 on a phone (whose staves are drawn larger), the
  piano roll 70.

### Per-voice mixing
On a laptop the **voices sidebar** lists every voice with a light that glows while that voice is
singing at the playhead, and Mute / Solo buttons; on a phone the voices are **chips** above the
score, with a mixer button that opens the same rows in a sheet.
- **Mute** silences and hides that voice's notes.
- **Solo** (on one or more voices) ducks every non-soloed, non-muted voice to the "Others while
  soloing" level (a slider, 0–75%) rather than silencing them.
- **Clicking or tapping a voice's name** (sidebar name or phone chip) toggles *only this voice*:
  mutes and hides every other voice entirely; again restores everyone. **Reset** clears the mix.

### The player's ⋯ menu
Rename, restore voices, sections, places to check, *Höhe folgt der Musik* (roll), **Klang** — one
entry showing the sound chosen (Klavier / Stimme) that opens its choices in place (`MenuItem.options`
in ui.ts; the menu stays open until one is picked) —, PDF export, **Einstellungen** (a menu of its
own: Swing, Licht und Ton, Papier), feedback where asked for, language, the introduction. Saving
tempo, key and sections as the song's default is not in it: on a laptop it is the disk at the
bottom right, beside *Tonart* (`.t-save`).

### Swing or straight
The player's ⋯ menu → **Einstellungen** has **Swing (Achtel lang–kurz)** for songs whose beat is a quarter or half note
(not 6/8, 12/8, 3/8). With swing each beat's eighths are played long-short, 2:1 -- the triplet feel
(`swing.ts`): every position within a beat is mapped piecewise-linearly so the half-beat falls at
two thirds; on-beat positions and triplet positions (thirds) stay where they are; beats are counted
from each bar's start, an upbeat bar's from its end (an upbeat eighth is the "and" before the
bar). Playback, the piano roll and the overview use the swung score (`swingScore`); the sheet view
keeps the notation as written and lights each note when it is heard (`StaffView.setSwing`). The
choice belongs to the song, for everyone: stored in its metadata (`swing`) for library songs --
another device reloads the song when it changes -- and on the device for the bundled samples. Together transport is available to current ensemble members; persisted defaults
require editPieces.

### Voice menu: clef and removing voices
Each voice's ⋯ button (sidebar on a laptop, mixer sheet on a phone; library songs only) opens a
menu with Rename, the **clef** (treble, tenor = treble with a small 8, bass — MusicXML songs only,
since only they have a sheet-music view) and **Remove voice**. Both are stored beside the score,
never in it, like voice renames: `clefOverrides` (dot-path per voice) and `removedParts` (a list of
part ids) on the song's PostgreSQL metadata, applied in `applyVoiceSetup()` when the song loads.
Removing asks for confirmation (it affects everyone) and can be undone from the player's ⋯ menu
(**Restore removed voices**); the last voice can't be removed. Other devices pick up clef and
voice changes as soon as their playback is paused.

### Export as PDF
The player's ⋯ menu offers **Als PDF exportieren** (MusicXML songs; MIDI imports have no notation
to set). A sheet says what will come out -- the song in the key it plays in now, all its voices --
and **PDF erstellen** makes it; behind **Stimmen auswählen und umbenennen** (folded away) each voice
has a checkbox and its name to change, for this PDF only. Voices removed in the app are left out,
and a clef chosen in the app is used. `exportPdf.ts`, loaded only when asked for:
- **Engraving:** Verovio (verovio.org, LGPL-3.0, the unmodified npm build, ~8 MB, its own chunk)
  sets the song's own MusicXML -- trimmed to the chosen voices, renamed, titled as in the
  repertoire (`prepareXml`) -- on A4 pages (scale 42), transposed by the interval that
  gives the key signature the app shows (`transposeInterval`, the same choice as
  `signatures.ts transposeFifths`: +1 is a minor second up, to D♭, -6 a diminished fifth down).
- **Engraving font (since November 2026):** Eugene by Mikko Patama (OFL), the French engraving of
  around 1900 (the Fromont editions of Debussy) -- converted for Verovio as "LightScore Engraving"
  (`assets/fonts/pdf/LightScoreEngraving.zip`, 314 KB, passed with Verovio's `fontAddCustom`
  option; `make-engraving-font.py` makes it from a checkout of Eugene, with the anchors from its
  metadata under the glyphs' SMuFL names from its source). Where Eugene has no sign of its own yet,
  Verovio takes Bravura's (`fontFallback`), as Eugene itself intends. Eugene's own line weights
  (its `engravingDefaults`: staff lines, stems, ledger lines, slurs, ties -- `MUSIC_LINES`) are
  passed too; Verovio ignores four of them (beam thickness and spacing, arrow shafts, dashed
  barlines). "Eugene" is a Reserved Font Name, so the converted font is named otherwise.
- **PDF:** jsPDF + svg2pdf.js (MIT) draw each page's SVG as vectors. Verovio draws the music as
  paths and only text as text; that is set in Liberation Serif (Times' metric twin, OFL, embedded,
  so every language's letters come out -- Latvian included) and, for the odd music symbol in text
  (a metronome mark's note, a dynamic), "LightScore Music Text", a 44 KB TrueType font of those
  signs from Eugene (converted from its cubic outlines), Bravura's for the 40 Eugene lacks
  (renamed, as the OFL asks of a modified version; both copyrights in its name table). That font has one style, so its symbols are set
  upright and regular even inside bold or italic text (a tempo mark is bold: the note otherwise
  fell back to a standard font and came out as two stray letters), and a tempo mark's note a
  quarter smaller than Verovio sets it (`musicInText`). Verovio's page is an inner `<svg>` without a
  size of its own, which svg2pdf doesn't scale; it's flattened into a scaled group first. A bar
  wider than a line runs past the right edge in Verovio's layout; such a page is drawn slightly
  smaller (`fitToWidth`). Page numbers from page 2 on.
- About 5 s for a 7-page piece on a laptop (once the engraver is loaded); the file is named
  "Title (Key).pdf".

### Editable song and voice names
Rename a song from its ⋯ menu in the repertoire, from the player's ⋯ menu, or by double-clicking
its title in the player; rename a voice by double-clicking its name in the sidebar, or with the
pencil in the phone's mixer sheet. Both open a small dialog; the new name applies immediately
and is saved through the authenticated API (rolled back, with a message, if that write fails). Only
available for actual shared-library songs, not the bundled sample. The player always shows the
library title, not the title embedded in the file. A voice rename doesn't touch the stored
MusicXML/score data — it's a side-channel override (`partNameOverrides`, keyed by part id)
applied when a song loads. Partial updates preserve other saved part overrides.

### Section markers and saved song defaults
Section letters (A, B, C, …) show as boxed rehearsal marks — in the score's ruler, on the
whole-piece strip (laptop) and in the phone's Tempo & key sheet — and jump straight to their
section. They come from the MusicXML file's own `<rehearsal>` marks (`Score.rehearsalMarks`,
§4.2) when it has any; otherwise the laptop-only flag button at the end of the whole-piece strip
marks the playhead position as the next letter. Hand-added letters are bookmarks: they're saved to
the song right away (`saveSongSections`, only `savedConfig.sections`), and after every change the
letters follow their order in the piece again (A, B, C — no gap or double after removing one).
**Removing**: right-click a letter on the whole-piece strip (laptop) or hold it in the phone's
Tempo & key sheet → jump there / remove this section / remove all; the player ⋯ menu also has
**Remove all sections** (with a confirmation). Letters printed in the file itself can't be removed.
**Save tempo, key and sections as default** (the disk beside *Tonart* at the bottom right, laptop
only, library songs only) still
snapshots transpose and tempo together with the letters (`saveSongConfig`). A file with its own
rehearsal marks never offers hand-added ones. A rehearsal mark that is a word ("Refrain", "Intro
4 Takte Bass+Drums vom Band") gets a box as wide as it in smaller type (`.rmark.word`); on the
whole-piece strip it ends before the next mark, cut short with an ellipsis (its full text in the
tooltip). Since repeats are played out (§4.2), saved letters are positions in the piece as played
(`savedConfig.played`); letters saved before then are carried over to where their bar is first
played (`playedBeat`).


### Library and offline access

Verified accounts select an ensemble. PostgreSQL stores metadata and immutable score
versions behind capability checks; private imports stay local until explicitly saved.
Library invalidations arrive over Socket.IO; revision conflicts require reconciliation.
Offline preparation explicitly downloads account/ensemble-scoped pieces to IndexedDB.
Access lasts up to 14 days, or 24 hours in shared-device mode. Browser eviction and
quota exhaustion are reported; bulk preparation continues and reports failures.
Offline supports solo playback, staff view and PDF, but never queues Together commands,
writes or transcription. Logout and account changes purge private cached data.

## Musical implementation

### 4.1 Data model (`score.ts`)

Everything downstream — rendering, playback, hit-testing — works off one flat, immutable-ish
`Score`:

```ts
interface Score {
  title: string;
  parts: PartInfo[];           // one per voice (id + display name)
  notes: NoteEvent[];           // flat list across all parts, sorted by startBeat
  measures: MeasureInfo[];      // for the ruler's measure numbers / time signature
  slurs: SlurArc[];
  totalBeats: number;             // ties aren't a separate field -- see below, they're merged into notes
}
```

Time is always expressed in **quarter-note beats** from the start of the piece — never
seconds, never MusicXML's raw `<duration>` divisions. Seconds only enter the picture inside
`AudioEngine`, where a beat position is converted to a Web Audio `AudioContext.currentTime`
offset using the tempo map and current playback settings. The shared timeline integrates
tempo changes; score geometry continues to use beats.

### 4.2 Parsing (`musicxml.ts`, `midi.ts`, `library.ts`)

`parseMusicXML` walks a `score-partwise` MusicXML document part-by-part, measure-by-measure,
tracking a `cursor` (in beats) that advances with each `<note>` and rewinds/advances on
`<backup>`/`<forward>` (used for chords and cross-voice layering within a measure). It
handles:
- Multiple parts, multi-note chords (`<chord/>`), rests.
- Mid-piece `<divisions>`, `<time>` (including additive numerators like 3+2) and `<key>` changes,
  recorded per bar (`MeasureInfo`). Both views show the time signature and the key in the ruler at
  bar 1 and wherever they change (`signatures.ts`; the key transposed with the song), the sheet
  view also a double bar line at a key change; the header lists every metre the piece uses.
- **Slurs** (`<notations><slur>`), tracked per-voice with an open/close map keyed by the
  slur's `number` attribute.
- **Ties**, checked against *both* `<tie>` (the sound-level element) and
  `<notations><tied>` (the notation-level element) — real-world files, especially
  OMR/scan-derived ones, sometimes only emit one or the other. A note can't itself cross a
  measure boundary in the MusicXML format, so a note held across one (or tied for any other
  reason) is necessarily written as multiple `<note>` elements — but musically it's one
  continuous note, so the parser *merges* a tied sequence into a single `NoteEvent` (extending
  its `durationBeats` through each tied segment, chains included) rather than keeping them
  separate and bridging the gap visually. This is what makes a tied note render as one seamless
  bar and play back with a single attack instead of an audible retrigger at the tie point. The
  original tie-note boundaries aren't thrown away in the process, though: each individual tied
  `<note>`'s own duration is also appended to the merged `NoteEvent.tieSegments` array (computed
  the same self-correcting way `durationBeats` itself already was, so the segments always sum
  exactly to it) — the sheet-music view uses this to notate the *actual* tie the source file
  specified, rather than re-deriving a plausible-looking split mathematically. See §4.8.

`.mxl` files (MuseScore's default export — a zip containing the MusicXML plus a
`META-INF/container.xml` manifest) are unzipped client-side in `library.ts` using `fflate`,
reading the manifest to find the actual score file inside the archive.

**A `<note>`/`<rest>` missing `<duration>` no longer silently becomes zero-length.** The spec
requires `<duration>` on every note/rest, but not every real-world file is spec-perfect —
hand-edited files and this app's own OMR vision-transcription spike alike can emit a `<type>`
(the notated appearance: "quarter", "eighth", ...) without a computed `<duration>`, especially
for a rest with nothing musically "there" to double-check a length against. Left unhandled, that
note/rest's `durationBeats` came out `0` and the parser's `cursor` never advanced past it. Fixed
with a fallback to `<type>` (+ a dot) when `<duration>` is missing or zero, using the same
beats-per-type units `staffView.ts`'s `DURATION_TABLE` already does (a quarter note is 1 beat,
independent of `<divisions>`). A whole-measure rest (`<rest measure="yes"/>`) gets a further
fallback on top of that — spec-legal without either `<duration>` or `<type>`, since its length is
implied entirely by the measure's own time signature — filling to the end of the measure.

**A `<grace/>` note is explicitly excluded from that same `<type>` fallback, and never advances
`cursor` at all.** A grace note is spec-defined to carry no `<duration>` — it's deliberately
"outside" normal measured time (an ornamental note played quickly around the note it decorates),
not a file that merely forgot to include one, so it must never be treated the same as an
actually-missing duration. Confirmed concretely from a submitted score excerpt ("Jagdlied"): a
grace note leads into a triplet run. Before this exclusion, a grace note picked up a real, nonzero
duration from its own `<type>` via the fallback above, and that got added to `cursor` — silently
displacing every later note in the part by that amount, compounding with every further grace note
in the piece (matching a reported bug: voices drifting out of alignment with each other from a
certain point onward). A grace note is still added as a real (if very short,
`GRACE_NOTE_DURATION_BEATS`) audible/visible `NoteEvent`, ending exactly at the position the next
real note starts — just never allowed to move `cursor` itself.

**Repeats are played as written.** Repeat signs (`<repeat direction="forward|backward"
times="n">`, `times` meaning how often the passage is played all told), volta brackets
(`<ending number="1, 2" type="start|stop|discontinue">`) and jumps (`<sound segno coda dacapo
dalsegno tocoda fine>`) are read per bar from every part (`readRepeats`, `mergeRepeats`), and
`playOrder()` lists the bars as they're played, each with its pass: a passage as often as its
repeat says, a volta on its passes, D.C. and D.S. once each -- after which repeats aren't taken
again, the last volta is played, "To Coda" jumps to the coda and "Fine" ends. `unroll()` then lays
the piece out in that order: each bar's notes, slurs and marks once per pass, under its printed
number (the ruler shows 8, 5, 6, … after a repeat; going to bar 5 goes to its first pass; the bar
count shown is the printed one), on a passage's second pass the second verse's words where the
notes have them (`<lyric number="2">`; a line printed once is sung every time), rehearsal marks at
their first pass only. The sheet view then draws the passage again as it's played, accidentals
starting afresh in each played bar (by position, not by number). `Score.playOrder` keeps where
each played bar is in the printed piece (`playedBeat`). Printed-only jumps (the words "D.C. al
Fine" without a `<sound>`) aren't followed. The PDF export engraves the file as printed, repeats
and all. Of the musical's 21 files, 9 have repeats ("Always On My Mind": the intro four times, 46
printed bars, 63 played); "Evening Rise" is played twice through, as its repeat says.

**Bar lengths are agreed across all parts, in two passes.** Pass 1 walks every part and notes,
per bar, how far its content reaches (overall and per `<voice>`). `planBars()` then lays the bars
out once for the whole piece: a bar is as long as its time signature says, unless *no* part fills
it that way — then the length most parts agree on (a pickup/anacrusis, a bar split around a
repeat; "Nachtigall" opens with a single eighth-note upbeat in 3/8, "As torrents" has 2+1 split
bars). Pass 2 walks every part again, starting each bar exactly where the plan says. So one part
whose bar is too long or too short can no longer drift out of step with the others (or with the
bar lines) for the rest of the piece, which the earlier per-part "the bar is as long as its
content" rule allowed. A voice whose content overruns its bar (typically an unmarked triplet from
a scan) is fitted into the bar proportionally.

Concretely reported: **Mondlicht bar 49** was shifted against the PDF. The scan (Soundslice
export) writes every whole-bar rest (`<rest measure="yes"/>`) with a 4/4 whole rest's duration,
also in the piece's 12/8 bars — 4 beats instead of 6. Each part lost 2 beats per such rest, at
different bars (the soprano already from bar 2, soprano/alto at 45–46, tenor/bass at 47–48), so by
bar 49 every voice was somewhere else. A whole-bar rest now always lasts its bar, whatever its
`<duration>` says, and has no say in the bar's length. Only Mondlicht and Space Oddity (an alto
missing a sixteenth in bar 51, unmarked triplets in 52/55) parse differently from before; every
other song in the library comes out identical.

The first part supplies the piece-level information: bar numbers, time and key signatures per
bar, rehearsal marks.

**Directions** (`<direction>`) are read into `Score.marks` per part: dynamics (`<dynamics>`),
hairpins (`<wedge>` crescendo/diminuendo to its stop), tempo marks (a `<metronome>`, `<sound
tempo>`, or words starting with a tempo term — Andante, rit., a tempo, …) and other printed words.
Left out: titles and credits typed as words (large type or set high above the staff), syllables
typed as words among the lyrics, and chord symbols.

**`<clef>` (sign/line/clef-octave-change) is now read from `<attributes>` and stored on
`PartInfo.clef`**, rather than every part's staff-view clef being purely a heuristic guess from
its average pitch. Most concretely, this fixes the real-engraving choir "tenor clef" convention —
a treble (G) clef with a small 8 printed below it (MusicXML `clef-octave-change: -1`, "sounds an
octave lower than written") — which previously either got guessed as a plain bass or treble clef
by average pitch, or (even when the heuristic happened to guess "treble" correctly) was
positioned on the staff at its literal sounding octave, landing on many ledger lines below the
staff instead of where a real tenor clef actually places it. See §4.8 for how `staffView.ts`
resolves and applies this (`resolveClef`, `octaveShift`) — the `<pitch>` data itself (and
therefore MIDI/playback) is unaffected either way, since clef only ever changes where a note is
*positioned* on the page, never what pitch it actually is.

**`<direction><direction-type><rehearsal>` marks are parsed into `Score.rehearsalMarks`**
(label + beat position), from the first part only (a rehearsal mark is a piece-level concept, and
real scores conventionally print one only once, usually on the top staff), recorded at the
`<direction>`'s position in the bar. See the feature descriptions above's "Section markers" for how
`main.ts` uses this (and what happens when a file has none).

**MIDI import** (`midi.ts`) is a from-scratch standard MIDI file (SMF) reader — no external
library — supporting format 0, 1, and 2 files, running status, and both text/lyric meta-event
conventions. It parses directly into the same `Score` model, notably *without* going through
MusicXML at all: a MIDI note is already a plain numeric pitch (0–127, and note 60 = C4 in both
MIDI's own numbering and this app's `midi` field), so there's no step/alter "spelling" to
reconstruct the way a MusicXML writer would need. Each MIDI track becomes a voice/part (named
from its Sequence/Track Name meta event, or "Track N"; a track using more than one channel is
split further, one part per channel); Lyric (and Text) meta events are attached to whichever
note-on comes next in that track, matching the common karaoke-MIDI convention; Time Signature
meta events drive the same measure-boundary construction MusicXML import does. A MIDI file's own
tempo (Set Tempo meta events) is read only far enough to be skipped — like MusicXML, tempo
always comes from the app's own BPM control, never the source file. Because the resulting
`Score` has no natural MusicXML-equivalent text form worth manufacturing, MIDI imports are
stored in the shared library as a JSON-serialized `Score` rather than XML text — see
`StoredSong.format` in `library.ts`, which every load path branches on.

**Clapping, stamping, drums** (`percussion.ts`). MIDI keeps percussion on channel 10, where a key
is an instrument (General MIDI: 36 bass drum — how a stamp is usually written —, 39 hand clap,
42 hi-hat …); played as pitches they sounded as piano notes. Each MIDI part keeps its channel
(`PartInfo.midiChannel`), and when a song loads (`applyVoiceSetup` → `applyPercussion`) a part
becomes percussion (`NoteEvent.unpitched`, as MusicXML's `<unpitched>`; percussion clef) when it
is on channel 10, when its name says so (Klatschen/clap, Stampfen/stomp, Schnipsen/snap,
Patschen/pat — one instrument — or percussion/Schlagwerk/drums/kit), or — a MIDI song stored
before the channel was kept — when its notes look like a drum track (only short hits on a few
of the usual drum keys). The notes are placed as drum notation prints them (stamp/bass drum
low on F4, clap high on E5 with a cross, hi-hat and snaps on G5 …): by General MIDI's keys, by
the instrument the name gives, or — body percussion written on ordinary pitches — lowest pitch
the feet, highest the hands. MusicXML parts named so keep their printed places. Played as taps
(`audioEngine.ts playTap`): low places as a thump (a falling sine), high crossed ones as a clap
(three quick bursts of noise), the rest as before. The keys stay in the stored score, so it is
reversible: for MIDI imports each voice's ⋯ menu has **Als Schlagwerk (Klatschen, Stampfen)** to
switch it on or off, for everyone (`StoredSong.percussion`, per part id, overriding the
recognition either way). MusicXML songs don't get it: their files write percussion themselves,
and a part with claps written on pitches is recognised by its name.

### 4.3 Rendering (`pianoRoll.ts`)

This is the most performance-sensitive part of the app — it has to redraw smoothly during
playback, every animation frame, on everything from a phone to a 4K desktop monitor. The
design went through several rounds of performance/sharpness fixes; the current approach:

**Pre-rendered scrolling buffers, blitted per frame.** Gridlines, note bars, lyrics, and slurs
don't change relative to each other during playback — only the horizontal scroll offset does. So instead of re-issuing hundreds of fill/stroke/text calls every frame, they're
rasterized *once* into a wide offscreen canvas (`contentBuffer`, spanning several
viewport-widths of beats) whenever something structural actually changes (mute/solo,
transpose, zoom, resize, or the playhead nearing the buffer's edge). Every frame then does a
single cheap `drawImage` blit of just the visible slice. The ruler's measure-number labels get
the same treatment in a matching `rulerBuffer`, rather than being `fillText`'d fresh every
frame.

**An even clock for the picture.** The playing position drawn each frame is not read straight
from `AudioContext.currentTime`: on many browsers that advances in steps of an audio buffer
(10-20 ms), so the roll moved a full step one frame and half of one the next (measured: 27, 12,
27, 27, 15 thousandths of a beat per frame) -- the judder that made moving lyrics hard to read.
`AudioEngine.visualBeat(ms)` tracks the context's time against the page's clock instead (the
highest offset seen, since a reading lags its true value by up to a step and never leads it,
easing down slowly to follow drift or a stalled audio thread; the output delay smoothed too), and
`renderLoop` asks for it at the frame's `requestAnimationFrame` timestamp plus the usual delay
before the frame is drawn (smoothed). The picture now moves the same distance every frame (22,
22, 22, ...) and stays within a millisecond or two of the sound. Everything that needs the sound's
exact position (publishing it, the loop/end check) still uses `getCurrentBeat()`. The played-music
shade left of the reading line is a flat fill plus a gradient over just its fading strip, not a
gradient across the whole played area (the same picture, far cheaper per frame). In development
`window.__frames` logs each frame's position and render time.

**Painting ahead, a slice per frame.** The buffer is large -- three screen-widths of the roll,
on a 16" laptop 8192 x 3144 device px -- and repainting it in one go while playing stalled the
motion for several frames (measured 45-90 ms on a phone-sized view, every couple of seconds): the
regular hitch that made moving text hard to read. Now, while the view moves on, the next stretch
is painted into a second set of buffers (`prepareNextBuffer`) in slices about 512 device px wide,
one per frame (more while the frame has spent under 2.5 ms on them), and swapped in when the view
reaches the end of the current one (`swapInNext`). Slices are clipped on whole pixels of each
canvas, so they meet without a seam -- checked pixel for pixel against a one-piece repaint,
including at a 1.5 pixel ratio; syllables far from a slice aren't even rasterised for it. A buffer
reaches a quarter screen behind the view and the rest ahead (the old rule only looked at the
reading line, not the screen's right edge, so the "doesn't cover the screen" safety repaint fired
every time). Changes to what the roll shows (`invalidateBuffers`: mix, transpose, zoom, rows,
sections, resize) drop the slices painted so far and repaint at once, as before; the second set is
allocated and touched at that first paint, not in the first seconds of playback. The paper's
grain is anchored to the music (`paper.ts`, `paperFrame`), so it doesn't jump when buffers change.

**Measuring a device.** Opening the app with `?fps=1` (this visit only) shows a small probe while
playing: frames per second, the typical gap between frames, how many came late in the last two
seconds, how long drawing a frame takes (average and longest) and the pixel ratio -- for finding out
what a particular device really shows (a browser's energy saver, or an iPhone in Low Power Mode,
caps pages at 30 frames per second).

**Backing stores of the exact device size** (`pixels.ts`). Where the browser reports it
(Chromium: ResizeObserver's 'device-pixel-content-box'), the roll's, the sheet view's and the
overview's canvases get exactly the device-pixel size they are shown at, so they aren't resampled
to fit at a fractional pixel ratio (a browser zoomed to 90% on a Retina screen is 1.8x).

**A hint when an energy saver caps the frames** (`powerHint.ts`). An iPhone in Low Power Mode, or
a browser's energy saver on battery, caps pages at 30 frames a second -- measured on a MacBook in
Brave: 30 on battery, 120 on the charger, drawing a frame taking about a millisecond either way --
and moving lyrics smear. A page can't ask whether such a mode is on, but it sees the effect: while
playing, frames steadily ~33 ms apart (median and lower quartile) while drawing one stays quick.
After three seconds of that a note on paper says what is likely behind it (Low Power Mode on an
iPhone or iPad, an energy saver elsewhere): once per visit, and never again after *Nicht mehr
zeigen*.

**Pixel-snapped blitting.** Even a nominally 1:1-scale `drawImage` blurs slightly if its
destination lands on a fractional device pixel — which, mid-playback, it does essentially
every frame, since the scroll offset follows continuous audio time rather than discrete pixel
steps. `snapToDevicePx()` rounds every blit's destination (content buffer, ruler buffer,
playhead line, note-preview label) to the nearest whole device pixel before drawing, which
keeps text and note bars crisp instead of subtly resampling every frame. Canvas image
smoothing is also explicitly disabled as a second line of defense.

**Lyric text is cached as bitmaps**, not re-shaped from `fillText` on every buffer rebuild —
each distinct syllable is rasterized once into its own small offscreen canvas and reused.

**`devicePixelRatio` is capped at 2×** (`MAX_DPR`), covering standard Retina displays without
needlessly quadrupling backing-store size on 3× phone screens. A defensive
`MAX_BUFFER_DEVICE_PX` cap (8192px) also bounds the content buffer's absolute width, since some
browser/GPU combinations silently clamp or fail to paint canvases beyond roughly that size —
this only ever engages on unusually wide and/or high-DPI displays.

**View vs. playhead are two separate beat values.** `render(displayBeat, playheadBeat)` takes:
- `displayBeat` — the view's own horizontal reference point (what the content is scrolled to).
- `playheadBeat` — where the piece actually is (or will resume from).

They coincide, and the playhead line sits at its usual fixed screen position, whenever the
view hasn't been panned away from the actual position — which is always true during playback
(panning is locked then) and usually true while paused. While paused, though, panning is still
allowed to browse the score, and the playhead line is computed from `playheadBeat`
independently, so it correctly drifts away from (or entirely off) its usual spot rather than
silently relabeling whatever beat the pan happened to land on.

**The fixed pitch-row range (`minMidi`/`maxMidi`) tracks the current transpose, not just the
untransposed notes.** Notes are drawn at `note.midi + this.transpose`, but this range used to be
computed once at construction from the untransposed pitches alone and never revisited when
transpose changed. Transposing far enough (down, most noticeably — reported as bass notes
becoming permanently invisible and unreachable by scrolling) could put a note's row outside
`[minMidi, maxMidi]` entirely: `rowY()` would place it beyond the content area's bottom/top, and
`maxScrollY()` (itself derived from that same range) couldn't scroll far enough to reach it.
Fixed by recomputing the range from the untransposed extremes (`basePitchMin`/`basePitchMax`)
plus the current transpose every time `setTranspose()` runs, rather than fixing it forever at
construction. Both bounds shift by the same amount, so the range's *size* — and therefore
`contentHeightPx()`/`maxScrollY()` — stays constant across any transpose value; only which
pitches the existing scroll position shows changes, so this needed no `scrollY` adjustment of its
own and doesn't disturb the untransposed case at all.

**Piano-key gutter, reintroduced in a non-persistent form.** An earlier version kept a full
keyboard permanently down the left edge (removed in favor of click-to-preview, see §2); a
simplified version is back — a light/dark band per semitone row (matching real piano key
coloring, not literal interlocking key shapes) drawn once immediately before beat 0, painted
directly into `contentBuffer`/`paintContent` like gridlines or notes rather than as a separate
pinned overlay. Because it lives in the same beat-space-positioned buffer as everything else, it
scrolls out of view naturally once playback moves past the piece's start, with no extra pinning
logic needed, and it redraws for free on every existing buffer-rebuild trigger (zoom, resize,
etc.) without a new one. Its pixel width is converted to an equivalent beat-width at the buffer's
current `pixelsPerBeat` (`KEYBOARD_WIDTH_PX / pixelsPerBeat`), so it renders as a consistent
physical size regardless of zoom level. `hitTestKeyboard()` (used by the same click handler
`hitTestNote()` already wires up, as a fallback when no actual note is hit) maps a click back to
a MIDI pitch the same way `hitTestNote()` does, previewing the tone through the same
`audioEngine.previewNote()` path — just without a note-name label, since a keyboard key isn't a
real `NoteEvent` with its own beat position to anchor one to.

**Self-correcting buffer bounds.** Before blitting, `render()` verifies the content buffer
actually covers the full visible width and forces an immediate rebuild if it doesn't — a
defensive invariant added after an intermittent, never-reliably-reproduced "black unpainted
strip" report, rather than trusting the incremental rebuild-margin heuristic blindly. A
`ResizeObserver` on the canvas (in addition to the `window.resize` listener) catches mobile
viewport size changes — address bar show/hide, dynamic toolbars — that don't fire a `resize`
event but do change the canvas's actual laid-out box.

**Gold-ink markings (`goldInk.ts`).** Dynamics, hairpins, tempo and printed words from
`Score.marks`, written above the staves of the sheet view in gold ink with a pen (Italianno): ink
on the paper, so nothing glows or sparkles as the reading line passes. On by default;
`?zeichen=aus` hides them on a device. As a choral score prints them: dynamics and hairpins over
each staff (one after another when several fall on the same spot), tempo marks and words every
voice shares once, over the top staff; words repeated bar after bar are written the first time
only. (Tried in the piano roll too, and dropped there: too much over the lit notes.)

### 4.4 Audio (`audioEngine.ts`)

Two playback sounds, chosen per device in the player ⋯ menu (`ai-capella-sound`, not synced):
- **Grand piano** (default): recorded samples of the **Salamander Grand Piano V3** (Alexander Holm,
  Yamaha C5, CC BY 3.0 — credited in `public/samples/piano/ATTRIBUTION.txt`), velocity layer 8 of
  16, one note every third semitone from A1 to C7 (22 files, 1.7 MB: leading silence removed,
  shortened to 5–8 s with a fade, mono, 96 kbit/s MP3, named by MIDI number). Each note plays the
  nearest recording re-pitched by at most 1.5 semitones, with a damper at note-off. Loaded once per
  page and shared by every engine; the service worker stores them for offline use. Until they're
  loaded (or if they can't be), the earlier synthesized piano plays — triangle + sines with a
  sweeping lowpass and an attack/decay/release envelope.
- **Voice (oo)**: a sustained sung tone for long notes, where a piano dies away — two slightly
  detuned sawtooth sources through the "u" vowel formants of the starting-tone "du" (darker for low
  voices), vibrato fading in on longer notes.
- **Mix**: voices stand across the stereo field like a choir seen from the front (first voice left,
  last right); a small generated room (convolution with a noise impulse that darkens as it decays,
  1.6 s) on everything but the metronome; bus compressor, then a limiter — measured over a six-voice
  passage, the old synthesized sound peaked at 1.15 (clipping), now every sound stays below 0.95 at
  matched loudness.
- **The light follows what is heard.** The context's clock runs ahead of the loudspeaker by the
  output latency (`outputLatency`, or `baseLatency` where a browser reports none, plus the bus
  compressor's 6 ms look-ahead): a few milliseconds on a laptop, 150 ms and more over Bluetooth.
  Adding `baseLatency` on top of `outputLatency` overshot (reported: the sound came slightly before
  the light). Loudspeakers differ, so each device can fine-tune it in the ⋯ menu → Settings ("Light and sound",
  ±150 ms, `ai-capella-light-offset`). `getCurrentBeat()` — which every view
  draws from — is the beat being *heard*, so the light reaches a note as it sounds (reported: the
  piano came after the light). The scheduler itself keeps the context's clock
  (`scheduledBeat()`), and a synced start hands the audio to the output early by the latency, so
  every device sounds at the shared instant. Each piano recording also starts right at its attack
  (`attackOnset()`: 4 ms before the first sample above 2 % of its peak, fading in over those
  4 ms -- starting cold on the noise before the attack clicked, most audibly on chords), skipping
  the recording's and the MP3 decoder's leading silence. The final limiter grips within 3 ms, not 1:
  instant limiting distorted the attacks of full chords, also heard as a click.
- **Brighter piano**: each voice's chain has a high shelf (+5 dB above 2.6 kHz) and a low shelf
  (−2 dB below 180 Hz), active for the piano only.
- Playback works by **scheduling every note's oscillators up front** at the moment `play()` is
  called, using the Web Audio clock (`AudioContext.currentTime` plus each note's beat offset
  converted via the current BPM) — not by ticking through notes one at a time in JS. This is
  what keeps timing sample-accurate regardless of main-thread jank from rendering.
- Each voice has its own `GainNode`; mute/solo/duck states are just gain-node level changes
  (`setTargetAtTime` for a short, click-free ramp), routed through a shared
  `DynamicsCompressorNode` before the destination — doubled/unison voices (common in choral
  writing) stack gain and can clip without it.
- **Printed dynamics are heard, gently** (`dynamics.ts`): each note plays through a small gain
  set from its part's dynamic at its start, relative to mf — pp 0.6 (about −4 dB), p 0.75,
  mp 0.88, f 1.12, ff 1.24 (about +2 dB) — and hairpins ramp from the level where they start to
  the dynamic printed at their end (or ×1.2 / ×0.83 when none is). Before a part's first
  dynamic it plays at mf; a part with no dynamics of its own follows the others'. Enough to hear
  the shape of a phrase without losing a quiet voice in the mix.
- **`pause()` clears every scheduled-but-not-yet-fired oscillator**, and the context keeps
  running (it rests -- is suspended -- only after a 90 s pause, so the next Play, here or on
  another device of a rehearsal, starts on time; see §4.7 "Keeping devices together"). Clearing
  matters for the suspended case too: suspending alone freezes the clock but doesn't cancel
  already-scheduled `.start()`/`.stop()` calls — they just wait, and since clicking a note to
  preview its pitch (`previewNote()`) resumes the context, a paused-but-still-scheduled note
  would fire in a burst the moment you clicked anything. Resuming always goes through `play()`
  again, which reschedules everything from the current position anyway.
- Changing BPM, transpose, or the metronome toggle mid-playback all just call `play()` again
  from the current beat — full re-schedule, not an incremental patch — which is simple and, in
  practice, imperceptible. **Exception**: a metronome toggle that arrives while a count-in is
  still sounding does *not* immediately call `play()` — see below.
- `play()` takes an optional `startAtEpochMs`: a wall-clock instant (`Date.now()`-style) to
  begin at, translated into this device's own `AudioContext` clock, instead of the default "as
  soon as possible." This is what §4.7's multi-device sync uses to make every device start at
  the same real moment; if that instant has already passed by the time `play()` runs, playback
  joins already in progress from wherever it would be right now rather than starting late.
- `play()` also takes optional `countInBeats`/`countInPulseBeats`: when set, that many
  metronome-style clicks (first one accented, spaced `countInPulseBeats` quarter-beats apart —
  the pulse spacing, not just the raw beats count, so a 6/8 count-in clicks 6 correctly-spaced
  eighths rather than 6 quarter-beats) are scheduled ending exactly at the music's start
  instant. If there isn't actually room before that instant (a late-joining/late-delivered
  device), the count-in is silently skipped rather than started late — same principle as the
  "join already in progress" behavior above. `isCountingIn()` reports whether one is currently
  playing, so `main.ts` can show a "Count-in…" label instead of the normal position readout.
- **Click/pop fix.** Every scheduled oscillator/gain pair is tracked as a `Voice`
  (`scheduledVoices`), and `clearSchedule()` — called at the top of every `play()`/`pause()`/
  `stop()`, including the re-schedule calls above, which is why this used to click on almost
  any mid-playback control change — fades each voice's gain to (near-)zero
  (`cancelAndHoldAtTime` + a short `linearRampToValueAtTime`) *before* stopping its
  oscillators, instead of calling `.stop()` immediately on whatever the waveform happened to be
  doing. An abrupt stop mid-waveform is a textbook Web Audio discontinuity — audible as a
  click/pop, exactly matching feedback that playback "sometimes clicks or clips... like when
  you plug a cable into a speaker." A second, related bug in the note envelope itself (a
  sustain-hold automation event landing *before* the decay ramp's own end time, which Web Audio
  resolves by holding flat at peak volume and then jumping straight to the sustain level instead
  of actually decaying, for most notes under ~0.4s) is fixed alongside it.
- **Metronome-active-but-silent / can't-toggle bug (found and fixed)**: root cause was
  `setMetronomeEnabled()`'s handling of a toggle that arrives *while a count-in is still
  sounding*. It used to just skip the reschedule outright — deliberately, since a full `play()`
  reschedule right then would cut the still-sounding count-in short and desync it from every
  other synced device — but the flag change was then silently dropped, not deferred. `tick()`'s
  ordinary incremental top-up doesn't pick it up either: its horizon check is keyed on
  `scheduledUpToBeat`, which the count-in's own `play()` call already advanced up to
  `LOOKAHEAD_SEC` (8s) ahead using whatever `metronomeEnabled` was at that moment —
  `scheduleMetronomeInRange`'s range starts from that already-advanced point, so every beat
  marker before it is skipped forever, never revisited. Net effect: toggling the metronome
  during a count-in could produce up to 8 seconds of silence (toggling on) or up to 8 seconds of
  clicks that wouldn't stop (toggling off) once the count-in ended — matching the reported
  "shows on but stays silent, and won't toggle" symptom. **Fix**: a new
  `pendingMetronomeReschedule` flag. A toggle mid-count-in sets it instead of no-op'ing;
  `tick()` checks it first on every call and, the moment `isCountingIn()` goes false, applies
  the deferred toggle via a normal full `play()` reschedule (the same one the non-count-in path
  already did immediately) — without ever touching the count-in's own already-scheduled clicks.
  An ordinary toggle outside a count-in is unaffected, still applied immediately as before.
  Verified with a scripted regression test (mocked Web Audio API, real `AudioEngine` class, a
  manually-advanceable fake clock) covering toggle-off-mid-count-in, toggle-on-mid-count-in, and
  the ordinary non-count-in path; the same test fails against the pre-fix code and passes against
  the fix.

### 4.5 Input handling (`main.ts`)

- **The view travels, it doesn't jump.** Whenever playback moves — a new start point, a bar or
  section jump, a synced change from another device, the end of the piece — the view keeps what
  it showed at that instant and then travels to the new position (`recenterSmoothly()`): the
  distance eases in and out (cubic) over 0.5–1.25 s depending on how far it goes, so the reader
  sees where the music went instead of having to find their place again (reported from
  rehearsal). The compensation happens in `applyPlaybackState()`, where the position really
  changes: a synced start arrives a moment after the tap, and compensating at the tap already
  showed a mirrored jump for those few frames (reported as a flash). Panning or dragging
  the overview stops a glide where it is; with reduced motion requested, the view jumps as before.
- All view-affecting input (wheel, drag, resize) goes through `scheduleRender()`, which
  coalesces any number of same-frame requests into a single `requestAnimationFrame` callback —
  wheel/pointermove events fire far faster than the display refreshes, and rendering
  synchronously per event was the original source of scroll stutter.
- Wheel and pointer-drag panning both use **dominant-axis locking**: once a gesture commits to
  being mostly horizontal or mostly vertical (based on accumulated delta since the gesture
  started), only that axis's pan is applied for the rest of the gesture. Real trackpad/touch
  input is rarely perfectly axis-aligned, and applying both deltas on every event let an
  intended vertical scroll bleed a little unwanted horizontal pan into the view (and vice
  versa).
- The canvas's layout rect (`getBoundingClientRect()`) is cached (`updateCanvasRect()`) and
  only re-read on actual resize/view-mode-change events, not on every pointer event or frame —
  reading layout geometry inside a hot per-frame path forces synchronous layout thrashing in
  the browser.
- `setPositionText()` skips the DOM write entirely when the displayed string hasn't changed
  (which is most frames, since the "Measure N · Beat M" text only changes once per beat) —
  another avoided source of unnecessary style/layout invalidation during playback.
- A ruler tap's raw pixel-derived beat is snapped to `measureAtBeat()`'s containing measure's
  `startBeat` before it's used — floor semantics (a tap anywhere in measure 5 snaps to measure
  5's start, not measure 6's), reusing the existing beat→measure lookup rather than adding a new
  one. Deliberately not applied to loop-region dragging: snapping both drag endpoints to their
  own containing measure's start could collapse a short drag entirely inside one measure to a
  zero-length region.
- **`seekToBeat(beat, opts?)`** distinguishes a grid-lock tap from a deliberate jump via an
  optional `recenterView` flag: a plain ruler tap (piano roll or sheet music) only moves the
  playback-start line, leaving the view exactly where it was, while bar jumps (Go to bar, previous/next bar, sections) pass
  `recenterView: true` so the view actually snaps to the target — the two gestures have
  different intents (mark a start point while still looking at the current spot, vs. actually
  go look at a different part of the piece).
- **No collapsible settings panel any more.** The old layout needed a collapse toggle (and a
  vertical-flick gesture on the canvas) because its controls took half a phone screen; the
  redesign's dock and sheets leave the score most of the height, so both were removed — the
  flick also fired by accident when scrolling fast.
- **The Go-to-bar field proactively clamps itself** (on submit, in `gotoBlock()`) rather than relying on the input's
  native `min`/`max` validation — an out-of-range value left for the browser's own validation to
  catch was the likely cause of a reported visual "wobble" on mobile (a native shake animation
  outside this app's control), so the fix is to never let the field hold an out-of-range value
  in the first place.
- **The sheet-music view now supports touch/pointer drag-to-scroll.** `#staff` has always set
  `touch-action: none` (so a touch drag doesn't fight the browser's own native page-scroll
  gesture), but until now nothing filled in the JS side of that — the canvas only had a `wheel`
  handler (mouse/trackpad only) and a plain `click` handler for ruler tap-to-seek, so a phone or
  tablet had no way to scroll the stacked staves at all once they didn't all fit vertically (a
  real, confirmed gap, not a perception issue). A `pointerdown`/`pointermove`/`pointerup` set
  below the ruler strip mirrors the piano roll's axis-locked drag (vertical scroll, horizontal
  pan via the same shared `displayBeat()`/`viewOffsetBeats` mechanism both views already read
  from) — without the piano roll's ruler-drag loop-selection or tap-to-preview, which are
  piano-roll-only features.
- **Two-finger pinch-to-zoom** (`PinchZoomTracker`) is wired into both canvases' existing pointer
  handlers, sharing the same `applyZoom()` the +/− zoom buttons use. It tracks every currently-
  down pointer by id; once exactly two are down, each move reports the ratio of the new
  inter-finger distance to the *previous move's* (not the gesture's starting distance, which
  would make the reported ratio cumulative rather than the per-call multiplicative factor
  `applyZoom()` expects). A second finger landing mid-drag abandons whatever single-pointer
  gesture (pan, scroll, or a piano-roll ruler loop-selection) was already in progress rather than
  letting both run at once — the existing single-pointer drag state is reset the moment a pinch
  starts, and isn't resumed for whichever finger remains once the pinch ends (lifting both and
  re-touching is an accepted, minor UX cost for keeping the two gestures from fighting).
- **Audio scheduling top-up and the loop/end-of-piece boundary check run on their own
  `setInterval`, independent of the visual `requestAnimationFrame` loop.** They used to live
  inside the same rAF-driven `renderLoop` that draws each frame — but most browsers throttle rAF
  to near-zero or stop firing it entirely once the tab/screen is backgrounded, and
  `AudioEngine`'s scheduled-ahead window is bounded (`LOOKAHEAD_SEC`, 8s), so playback (and the
  metronome) would just go silent a few seconds after switching away from the app, and a piece
  that should loop or stop at its end wouldn't do either while backgrounded. `audioTick()`
  (`AUDIO_TICK_INTERVAL_MS`, 200ms) now owns `audioEngine.tick()` and the boundary check;
  `renderLoop` only reads the current beat and draws. `setInterval` is throttled too (to roughly
  once a second in most browsers when hidden) but isn't halted the way rAF often is — comfortably
  within `LOOKAHEAD_REFILL_SEC`'s (3s) margin to keep the schedule topped up. Verified by freezing
  `requestAnimationFrame` entirely and confirming new notes/clicks keep getting scheduled well
  past the initial 8s lookahead regardless (fails against the pre-fix code, where scheduling
  visibly stalls at the very first lookahead window once rAF stops firing).
- **Song/voice renames apply optimistically, with a rollback and a visible error on failure.**
  Previously the inline-edit element's text waited until the server write's `.then()`
  resolved, so every rename visibly flashed back to the *old* value the instant you committed it,
  then (if and only if the write actually succeeded) jumped to the new one a moment later — itself
  enough to read as "unstable," and a failed write (permissions, network) surfaced nowhere but a
  console.warn, i.e. a silent, unexplained revert. Both rename handlers (song title, voice name)
  now update the local text/state immediately and only roll it back — checking the edited
  song/part is still the one on screen, in case the user has since navigated elsewhere — if the
  write actually rejects, surfacing the failure via `setImportStatus` instead of the console.


### 4.6 Shared library & access (`library.ts`, `domain-client.ts`)

The authenticated API stores pieces and immutable score versions in PostgreSQL
and object storage. Ensemble membership and capabilities authorize each request.
Better Auth owns account sessions; Socket.IO invalidates cached library views.
Source XML remains immutable when part display names change.

### 4.7 Synced multi-device playback (`src/rehearsal/`, `main.ts`)

Together owns an authenticated Socket.IO connection to `/rehearsal` for the active
account and ensemble. Every current member can control playback; piece editing
still requires its separate capability. Typed commands carry a UUID, base revision,
ensemble, and (where applicable) immutable piece/version. The server serializes
commands, persists a complete canonical state in PostgreSQL and broadcasts it to
all members including the sender. Stale revisions receive the latest snapshot;
commands are never buffered for replay after reconnect.

The canonical anchor is a beat and server timestamp. Accepted changes normally
become effective 400 ms in the future. Tempo changes preserve the position at that
effective instant, integrating the score's tempo map. Loop anchors, starting tones
and count-in grids share the same timeline. Late join skips expired pre-roll.
The server publishes stopped at the natural end. Server startup recovers moving
sessions as paused at their recovery-time position; playback never auto-resumes.

Each client calibrates its clock with timed Socket.IO pings, retaining low-RTT
samples and reporting uncertainty. Controls require an authorized snapshot and a
usable clock (uncertainty at most 100 ms). Reconnect, visibility, audio resume and
sleep detection trigger calibration. The audio engine maps server instants onto
AudioContext time, schedules notes against the tempo map and checks drift.
Suspended audio displays a tap-to-listen banner. Device output-latency correction
is adjustable from −500 to 500 ms; positive values schedule earlier.

Solo opens no rehearsal socket. Voice mute/solo, view, zoom and output correction
remain device-local. Account, ensemble and mode changes dispose the shared owner.
`?debug=sync` exposes clock/revision diagnostics and the read-only
`window.__lightscoreSync` timing hook. `npm run test:browser:sync` runs three real
accounts in headless Chromium against a built app and disposable database.
Measurements are scheduled starts and browser positions, not acoustic output:
Bluetooth, Safari and physical devices require separate hardware validation.

### 4.8 Sheet music view (`staffView.ts`)

A second, independent renderer (`StaffView`, same constructor shape as `PianoRoll` —
`canvas, score, partColor`, reusing the `partColor` callback (`colorForPart`) as-is) owning
its own `<canvas>`, toggled with the piano roll's rather than replacing it. Deliberately *not*
sharing `PianoRoll`'s code: the two are different enough (staff positions vs. piano-key rows,
noteheads/stems vs. proportional bars) that a shared base would mostly be indirection.
Deliberately simpler than `PianoRoll`'s pipeline too — no offscreen content buffer, it redraws
directly every frame — since this view is read-only (no click-to-seek/loop-drag of its own; see
§2) and meant primarily for reading rather than driving playback, where `PianoRoll`'s buffering
exists specifically to keep long continuous-scroll playback sessions smooth.

**Pitch spelling.** `NoteEvent` carries optional `step`/`alter`/`octave` — MusicXML's `<pitch>`
is already parsed in `musicxml.ts` but previously only the derived MIDI number survived; the
original spelling is now threaded through too, so accidentals render correctly (F♯ vs. G♭)
without needing to parse or guess a key signature. MIDI imports have no source spelling to
preserve, so `staffView.ts` falls back to a fixed sharps-preferred chromatic table for those —
noted as a known limitation (§6): MIDI-imported songs' notation isn't always the "correct"
enharmonic spelling, only a reasonable one.

**Layout.** Diatonic staff position is computed from `(step, octave)` via a simple letter-index
formula (`octave*7 + letterIndex`), independent of accidental — the standard trick that makes
adjacent-letter steps exactly half a line-spacing apart regardless of sharps/flats. Ledger lines
are derived from the same position, drawn under each notehead (also each tied segment) in the
paper tone. **Lit notes**: a head sounding now glows in its voice's colour -- the whole note with it: head, stem, flag, dot, and with the first head its accidental. **Chords and two voices**: the noteheads of one part struck at the same moment --
a note's own head, or a tied note's head carried on past a bar line -- are grouped by how long
they last. Heads of one length are a chord with one stem, as engraved: its direction set by the
note furthest from the middle line, drawn from the note at the stem's far end through to the
other, a second's head displaced to the stem's other side. Heads of different lengths at once are
two voices on one staff (a held bass note under a moving line): the upper voice stems up, the
lower down (by the file's voice numbers when each length is its own voice -- voice 1 up --
otherwise by pitch), rather than two stems drawn over each other. **Clef per part** is a heuristic, since no clef is parsed
anywhere in this app's pipeline: each part's average MIDI pitch decides treble vs. bass at
construction time. **Note duration shape** (filled vs. hollow notehead, stem, flag count) is
classified from the nearest standard duration to the note's continuous `durationBeats` value
(including dotted variants) — the only duration representation the rest of the app carries, so
this is inherently a best-fit approximation, not a re-derivation of the source file's actual
notated rhythm. **Beams** come from the file: `musicxml.ts` keeps each note's `<beam number=n>`
marks (begin / continue / end / forward hook / backward hook, per level, per tied segment) and
its `<voice>`; the sheet view chains a stem's marks within its voice (begin → continue → end) and
draws the group's stems under one beam (`drawBeams`): one common direction (forced in a
two-voice situation, otherwise set by the note furthest from the middle line), a slope following
the first and last notes but at most one space over the group and flat when tiny, the line moved
out so no stem gets shorter than 2.5 spaces; secondary beams join consecutive stems that carry
that level, hooks are short stubs. A sounding note lights its stem and its stretch of the beams:
from halfway back to the note before to halfway on to the next (from its own stem, for the first
and the last), every level that runs there. Where the file has no beams (or a group would hold one stem), the notes keep their
flags -- no beaming is invented from the metre.

**Each voice gets its own staff, stacked vertically** (top to bottom in score order, like a
choral octavo), never overlaid on a shared staff — a hard requirement, since SATB voices sharing
or nearly sharing a pitch would be unreadable overlaid even in different colors. Barlines are
drawn once per measure, spanning from the top staff to the bottom staff, so the stack reads as
one synchronized system rather than N unrelated staves.

**Clef resolution** (`resolveClef`) prefers the actually-notated MusicXML `<clef>` (§4.2) over the
average-pitch heuristic whenever it's present and one of the two shapes this view can draw (a
plain G or F clef) — the heuristic remains the fallback for MIDI imports and any other clef sign
(a true C-clef, say — rare in choir writing, and this view has no C-clef glyph to draw anyway).
The resolved `octaveShift` (in whole octaves) only ever affects *positioning*: it's folded
straight into the part's `bottomLineIndex` (`CLEF_BOTTOM_LINE[clef] - octaveShift * 7`, 7
diatonic steps per octave) rather than touching a note's own pitch/spelling. Its most common real
value is +1, for the standard choir "tenor clef" convention — a G clef printed with a small 8
below it (MusicXML `clef-octave-change: -1`, "this clef sounds an octave lower than written") —
so a tenor part's notes land on/near the staff the way they're actually engraved, instead of
plotting them at their literal sounding octave against a plain treble clef (which would hang them
on many ledger lines below it).

All notation symbols are glyphs from **Eugene** (bundled as a 24 KB subset, Bravura behind it for
the few it lacks — see §2 Design). SMuFL fonts are drawn at 4 staff spaces per em with each glyph's origin
at its musical reference point, so `fillText` at a staff position places it exactly: a G clef
on the G line, an F clef on the F line, a notehead on its line/space, rests on the middle line
(the whole rest on the 4th). The tenor's `clef-octave-change -1` uses the `gClef8vb` glyph (the
small 8 underneath). Stems attach at the font's own `stemUpSE`/`stemDownNW` anchors (Eugene's:
0.1 staff spaces above a black notehead's centre going up, 0.148 below it going down; a half
note's 0.152 and 0.212), are 3.5 spaces long (longer for 16ths/32nds), and flags are
the font's flag glyphs placed at the stem end. Accidentals and augmentation dots are font glyphs
too (a dot on a line moves up into the space). Ties are slim filled crescents. Each notehead is
nudged a few pixels right of its exact beat position (`NOTE_X_OFFSET_PX`) so a note starting on a
barline doesn't sit on the barline itself. The final barline is a classical thin+thick double bar.

The **pinned margin** on the left (`drawMargin`) holds each voice's name, clef and key signature;
music scrolls under it and fades out at its edge. Its width is sized for the widest key signature
anywhere in the (transposed) piece, so the playhead doesn't shift sideways past a key change. The
playhead sits a fixed fraction of the remaining width to the right of the margin (a larger
fraction on narrow screens). Muted voices leave the stack (`visibleLayouts()` restacks each frame).

**Key signature** (`fifths`, from MusicXML's `<key><fifths>`, parsed the same
carry-forward-across-measures way as `beats`/`beatType` — see `MeasureInfo.fifths`) is drawn
right after the clef, using a fixed table of verified staff positions for each possible
sharp/flat count per clef. It sits in the pinned margin with the clef, tracking
whichever measure currently governs the left edge of the visible viewport, rather than being
anchored to the beat where a signature change happens — correct for the overwhelming common case
(one key signature for the whole piece) and, for a piece with a genuine mid-piece change, updates
as you scroll past the change point; a change occurring *inside* the visible viewport isn't also
marked inline at its own beat position (a known limitation, §6). The time signature is
deliberately **not** drawn (an earlier version showed it stacked just after the key signature;
removed as unnecessary clutter).

**Lyrics sit at one fixed height per staff** (`LYRIC_BASELINE_OFFSET_PX` below the staff's bottom
line), not following each note's own pitch, so a whole lyric line reads level instead of bouncing
up and down with the melody. Accepted trade-off: an extreme low note (most likely after a large
negative transpose) can sit below this fixed line, putting its lyric above/near its own notehead
instead of under it — inherent to "one fixed height per staff" versus an unbounded ledger-line
range, not fixable by tuning the constant. **A second lyric line** (`lyricLines`): where two
voices on one staff sing different words at the same time (one holding "drop" while the other sings
"Mind-less de-"), the later voice's words go on a line under the first, as an engraver sets them --
within a phrase (that voice's notes up to a rest) from the first colliding word to the last, whole
words, so the line doesn't hop in the middle; words around them stay on the first line, and a
syllable both voices sing at the same moment is printed once. A staff that needs the second line
anywhere gets the room for it throughout (`staffSpan`), so the staves don't shift while scrolling.
The piano roll keeps one lane per row: where two voices share a pitch and sing different words, the
first one's syllable is shown -- and lit -- there, the other's left out.

**Accidental-awareness**: an accidental is only drawn on a note when its alter actually differs
from what the key signature (or an earlier note of the same letter+octave earlier in the same
measure) already implies — not on every altered note unconditionally, which would clutter a
piece with a real key signature. This bookkeeping needs to see every note from the start of
whichever measure governs the viewport's left edge, not just the ones currently on-screen, so
scrolling to a mid-measure position can't skip an earlier same-measure note that already
established an accidental (which would show a wrong accidental, or a missing one, on the first
visible note). It does **not** need to start that walk from the very first note of the whole
piece, though: the per-measure `accidentalMap` is cleared on every measure change regardless of
what came before, so nothing an earlier measure did can leak into the current one no matter where
the walk starts, as long as it starts at or before a measure boundary. `firstIndexAtOrAfter`
binary-searches the part's (startBeat-sorted) note list for the first note at or after that
measure's start, and the loop `break`s the moment it passes the visible range, rather than
scanning the remaining notes for the rest of the piece too. Before this, the walk ran from note
zero of the entire piece on **every single animation frame** during playback — since this view has
no offscreen-buffer pipeline like `PianoRoll`'s (see above; it redraws directly every frame), that
was real, measurable per-frame cost that scaled with the piece's total note count, not what was
actually visible — a concrete, confirmed contributor to reported playback jank specifically in
this view (a multi-minute arrangement's per-frame cost dropping from "every note in the piece" to
"roughly what's on screen"). The rests loop gets the same treatment (binary-search to the first
gap that could still be visible, `break` once past the visible range) for the same reason.

**Ties** are rendered as real notation, not one elongated notehead. MusicXML ties are still
merged into a single `NoteEvent` with an extended `durationBeats` at parse time (§4.2, for
piano-roll/audio purposes) — but `StaffView` splits that merged duration back into individually-
notatable segments for drawing. It prefers the note's own `tieSegments` (§4.2 — the *original*
tie-note boundaries the source file actually notated) whenever they're present, via
`segmentsFromTieLengths`, a plain cumulative-sum expansion with no barline logic needed (each
original `<note>` element could never cross a measure boundary in MusicXML to begin with, so
these segments are inherently already barline-safe). This is what makes a tied pair that
mathematically sums to one "clean" value (e.g. two tied eighths summing to exactly one quarter)
still render as two connected noteheads with a visible tie, matching the source engraving,
instead of silently collapsing into one undivided notehead. `splitIntoNotatedSegments` — forcing
a split at every barline crossing, and within a barline-clipped span greedily picking the
*largest* standard duration that fits without exceeding it (not the *nearest*, which is what
`classifyDuration` picks and would overflow past what's actually left) — remains the fallback for
MIDI imports (no tie concept in the source) and any non-tied note with an unusually long single
duration. Either way, each resulting segment gets its own notehead/stem/flags, connected to the
next by a shallow tie curve. This machinery is what fixes a concretely observed bug where a tied
note (e.g. the "Butterfly" arrangement's opening notes) rendered as a single illegibly-long note
instead of readable rhythm.

**Rests** fill in the inferred silent gaps in each part's own note list — notes sharing a
startBeat count as one chord/event, using the latest end-time among them, so a gap is only
reported once everything sounding at that point has actually finished. Each gap is split with
the same `splitIntoNotatedSegments` ties use, so a rest spanning a barline correctly becomes two
(or more) rest glyphs rather than one that visually crosses the barline. Scoped to one
monophonic voice per part — true for typical SATB choir writing, this app's primary use case; a
genuinely multi-voice part (MusicXML `<backup>`/`<forward>` producing overlapping non-chord
content within one part) may infer incorrect/overlapping gaps (§6). Rests are the font's rest
glyphs, drawn slightly transparent so they don't compete with the notes.

**Transpose is fully modeled here**, not ignored — both the key signature and every note's
spelling shift together when the app's transpose control is used, driven by the same
circle-of-fifths math: `fifthsShift = ((7×semitones) mod 12 + 12) mod 12`, normalized into
roughly −5..+6 (the conventional flat-side tie-break, e.g. +1 semitone lands on Db major's 5
flats rather than C♯ major's 7 sharps). The note-respelling **letter shift is derived from that
same fifths shift**, not independently rounded from the semitone count — a naive independent
rounding can pick the *opposite* enharmonic side from the one the fifths shift already chose for
the key signature (verified concretely at ±6 semitones, the tritone case), which would show a
sharp-heavy key signature next to flat-spelled notes. `TRANSPOSE_TABLE` holds the verified
fifths-shift/letter-shift pair for every semitone count in the app's ±7 range; respelling then
shifts a note's letter by that amount and solves for whichever `alter` hits the exact target
pitch, so the spelling always matches both the transposed key signature and the real sounding
pitch.

**Note duration shape** (filled vs. hollow notehead, stem, flag count) is classified from the
nearest standard duration to a segment's continuous `durationBeats` value (including dotted
variants) — the only duration representation the rest of the app carries below the segment
level, so this is inherently a best-fit approximation for whatever `splitIntoNotatedSegments`
already produced, not a re-derivation of the source file's actual notated rhythm. Unbeamed:
consecutive eighth/16th notes each get their own flagged stem rather than being grouped under a
beam — full beam-grouping (grouping rules, cross-barline handling) is a materially larger
typesetting problem, left as a possible follow-up rather than built speculatively.

---

