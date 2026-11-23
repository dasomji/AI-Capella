/**
 * A long, dense, multi-voice MusicXML piece for the playback profile (perf-playback.mjs).
 * Deterministic: the same arguments always give the same score. Nothing here is product data.
 */
const STEPS = [
  ['C', 0], ['C', 1], ['D', 0], ['E', -1], ['E', 0], ['F', 0],
  ['F', 1], ['G', 0], ['A', -1], ['A', 0], ['B', -1], ['B', 0],
];
const SYLLABLES = ['la', 'lu', 'do', 'na', 'ri', 'so', 'mi', 'ta', 've', 'no', 'glo', 'ri', 'a', 'san', 'ctus', 'do', 'mi', 'nus'];
// Rhythm cells in sixteenths, each filling one quarter note or two.
const CELLS = [[4], [2, 2], [2, 1, 1], [1, 1, 2], [1, 1, 1, 1], [3, 1], [8], [4, 2, 2], [6, 2]];
const TYPES = { 1: ['16th', 0], 2: ['eighth', 0], 3: ['eighth', 1], 4: ['quarter', 0], 6: ['quarter', 1], 8: ['half', 0] };

export function denseScore({ parts = 8, measures = 160, tempo = 112, seed = 7 } = {}) {
  let s = seed;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const pick = (list) => list[Math.floor(random() * list.length)];
  // Voices from high to low, each within a ninth of its centre.
  const centres = Array.from({ length: parts }, (_, i) => Math.round(76 - (i * 36) / Math.max(1, parts - 1)));
  const names = ['Soprano', 'Mezzo', 'Alto', 'Countertenor', 'Tenor', 'Baritone', 'Bass', 'Contrabass'];
  const list = centres.map((_, i) => `<score-part id="P${i + 1}"><part-name>${names[i % names.length]}${i >= names.length ? ` ${1 + Math.floor(i / names.length)}` : ''}</part-name></score-part>`).join('');
  const body = centres.map((centre, p) => {
    let pitch = centre;
    let slurOpen = false;
    let wordLeft = 0;
    const out = [];
    for (let m = 1; m <= measures; m++) {
      let xml = `<measure number="${m}">`;
      if (m === 1) {
        const clef = centre >= 60 ? '<sign>G</sign><line>2</line>' : '<sign>F</sign><line>4</line>';
        xml += `<attributes><divisions>4</divisions><key><fifths>${-1}</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef>${clef}</clef></attributes>`;
        if (p === 0) xml += `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${tempo}</per-minute></metronome></direction-type><sound tempo="${tempo}"/></direction>`;
      }
      if (p === 0 && m > 1 && m % 16 === 1) xml += `<direction placement="above"><direction-type><rehearsal>${String.fromCharCode(64 + Math.min(26, (m - 1) / 16))}</rehearsal></direction-type></direction>`;
      let left = 16;
      while (left > 0) {
        const cell = pick(CELLS.filter((c) => c.reduce((a, b) => a + b, 0) <= left));
        // A bar of rest now and then, as real voices have.
        const rest = random() < 0.06;
        for (const dur of cell) {
          left -= dur;
          const [type, dots] = TYPES[dur];
          if (rest) {
            xml += `<note><rest/><duration>${dur}</duration><voice>1</voice><type>${type}</type>${dots ? '<dot/>' : ''}</note>`;
            continue;
          }
          pitch = Math.max(centre - 7, Math.min(centre + 7, pitch + Math.round((random() - 0.5) * 5)));
          const [step, alter] = STEPS[((pitch % 12) + 12) % 12];
          const octave = Math.floor(pitch / 12) - 1;
          let notations = '';
          if (slurOpen) {
            notations = '<notations><slur type="stop" number="1"/></notations>';
            slurOpen = false;
          } else if (dur <= 2 && random() < 0.22) {
            notations = '<notations><slur type="start" number="1"/></notations>';
            slurOpen = true;
          }
          let lyric = '';
          if (!notations.includes('stop')) {
            const text = pick(SYLLABLES);
            let syllabic = 'single';
            if (wordLeft > 0) {
              syllabic = --wordLeft > 0 ? 'middle' : 'end';
            } else if (random() < 0.4) {
              wordLeft = 1 + Math.floor(random() * 2);
              syllabic = 'begin';
            }
            lyric = `<lyric number="1"><syllabic>${syllabic}</syllabic><text>${text}</text></lyric>`;
          }
          xml += `<note><pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ''}<octave>${octave}</octave></pitch><duration>${dur}</duration><voice>1</voice><type>${type}</type>${dots ? '<dot/>' : ''}${notations}${lyric}</note>`;
        }
      }
      out.push(`${xml}</measure>`);
    }
    return `<part id="P${p + 1}">${out.join('')}</part>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><work><work-title>Dense profile piece</work-title></work><part-list>${list}</part-list>${body}</score-partwise>`;
}

if (process.argv[1] === new URL(import.meta.url).pathname) process.stdout.write(denseScore());
