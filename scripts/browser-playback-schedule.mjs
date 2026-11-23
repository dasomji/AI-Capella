/**
 * Real player, stubbed API: the audio schedule is laid a little at a time (audioEngine.ts), and
 * must still start every note exactly once, at its own time, well before it sounds -- with the
 * usual timer, with one slowed to a second (a background tab), across a seek and for both sounds.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { ownerFixture } from './owner-decisions-fixture.mjs';
import { denseScore } from './perf-dense-score.mjs';

const out = path.resolve(process.env.BROWSER_EVIDENCE ?? '.review-evidence/playback-schedule');
await fs.mkdir(out, { recursive: true });
const hooks = `
window.scheduleCheck = {
  load: async () => { sessionMode = 'solo'; await loadSongLocally({ id: 'schedule-check', title: 'Schedule check', xml: window.ownerXML.dense, format: 'musicxml' }); renderNow(); },
  seekBar: (n) => seekToBeat(currentScore.measures.find((m) => m.number === n).startBeat),
  toggle: () => togglePlay(),
  engine: () => audioEngine,
  notes: () => currentScore.notes.map((n) => [n.startBeat, n.durationBeats, n.midi, n.partId]),
};`;
const { server, base } = await ownerFixture(out, hooks);
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const results = [];

async function run(name, { sound = 'piano', slowTimer = false, seek = false, throttle = 1 }) {
  const context = await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(({ sound, slowTimer }) => {
    localStorage.setItem('ai-capella-lang', 'en');
    localStorage.setItem('ai-capella-sound', sound);
    // The top-up's timer as a background tab runs it: once a second.
    if (slowTimer) {
      const set = window.setInterval.bind(window);
      window.setInterval = (fn, ms, ...rest) => set(fn, ms === 200 ? 1000 : ms, ...rest);
    }
    // Every source started, with the context's time at that moment.
    window.started = [];
    for (const proto of [AudioScheduledSourceNode.prototype, AudioBufferSourceNode.prototype]) {
      const start = proto.start;
      proto.start = function (when, ...rest) {
        window.started.push({ when: when ?? 0, now: this.context.currentTime, kind: this.constructor.name, lfo: this instanceof OscillatorNode && this.frequency.value < 20 });
        return start.call(this, when, ...rest);
      };
    }
  }, { sound, slowTimer });
  await page.routeWebSocket('**', (ws) => ws.close());
  await page.goto(`${base}owner.html`);
  await page.waitForFunction(() => window.ownerReady, null, { timeout: 120_000 });
  await page.evaluate((dense) => { window.ownerXML.dense = dense; }, denseScore({ measures: 60 }));
  await page.evaluate(() => window.scheduleCheck.load());
  await page.evaluate(() => window.scheduleCheck.seekBar(9));
  await page.waitForTimeout(2500); // the piano's samples are in
  const cdp = await context.newCDPSession(page);
  if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  await page.evaluate(() => {
    // Where the last Play (or seek) began laying: what an earlier schedule's top-up started just
    // before it is stopped by it, and is none of its notes.
    const engine = window.scheduleCheck.engine();
    const play = engine.play.bind(engine);
    engine.play = (...a) => { window.laidFrom = window.started.length; window.askedFrom = window.asked.length; return play(...a); };
    // Every note the engine asks for: when, which pitch, which voice.
    window.asked = [];
    const playNote = engine.playNote.bind(engine);
    engine.playNote = (destination, start, duration, midi, level) => {
      let part = '';
      for (const [id, gain] of engine.partGains) if (gain === destination) part = id;
      window.asked.push({ start, midi, part });
      return playNote(destination, start, duration, midi, level);
    };
    window.scheduleCheck.toggle();
  });
  await page.waitForFunction(() => window.scheduleCheck.engine().isPlaying() && !window.scheduleCheck.engine().isHeldUp());
  if (seek) {
    await page.waitForTimeout(3000);
    await page.evaluate(() => { window.scheduleCheck.seekBar(30); });
    await page.waitForTimeout(300);
    await page.evaluate(() => window.scheduleCheck.seekBar(20));
  }
  await page.waitForTimeout(9000);
  const state = await page.evaluate(() => {
    const engine = window.scheduleCheck.engine();
    return { started: window.started.slice(window.laidFrom), asked: window.asked.slice(window.askedFrom), notes: window.scheduleCheck.notes(), from: engine.playStartBeat, at: engine.playStartCtxTime, spb: engine.secPerBeat, upTo: engine.scheduledUpToBeat, now: engine.context.currentTime, voices: engine.scheduledVoices.length };
  });
  await page.evaluate(() => window.scheduleCheck.toggle());
  await page.waitForFunction(() => !window.scheduleCheck.engine().isPlaying());
  const after = await page.evaluate(() => window.scheduleCheck.engine().scheduledVoices.length);
  await context.close();
  assert.deepEqual(errors, [], `${name}: page errors`);

  // One source per note with the piano's samples; with the voice two (and a vibrato on long notes).
  const perNote = sound === 'piano' ? 1 : 2;
  const sources = state.started.filter((s) => !s.lfo);
  if (sound === 'piano') assert.ok(sources.every((s) => s.kind === 'AudioBufferSourceNode'), `${name}: the sampled piano plays`);
  const expected = [];
  const key = (t) => Math.round(t * 1e4);
  // Each note by itself -- its time, pitch and voice --, so one played twice for another left out shows.
  const wanted = new Map();
  for (const [start, duration, midi, part] of state.notes) {
    if (start + duration <= state.from || start >= state.upTo) continue;
    const when = state.at + Math.max(0, start - state.from) * state.spb;
    expected.push(when);
    const id = `${key(when)}|${midi}|${part}`;
    wanted.set(id, (wanted.get(id) ?? 0) + 1);
  }
  const got = new Map();
  for (const a of state.asked) {
    const id = `${key(a.start)}|${a.midi}|${a.part}`;
    got.set(id, (got.get(id) ?? 0) + 1);
  }
  assert.equal(state.asked.length, expected.length, `${name}: as many notes asked for as are due (${state.asked.length} of ${expected.length})`);
  for (const [id, n] of wanted) assert.equal(got.get(id) ?? 0, n, `${name}: note ${id} (time|pitch|voice) laid ${n} time(s)`);
  const count = new Map();
  for (const s of sources) count.set(key(s.when), (count.get(key(s.when)) ?? 0) + 1);
  const want = new Map();
  for (const t of expected) want.set(key(t), (want.get(key(t)) ?? 0) + perNote);
  assert.equal(sources.length, expected.length * perNote, `${name}: every note laid once (${sources.length} sources for ${expected.length} notes)`);
  for (const [t, n] of want) assert.equal(count.get(t) ?? 0, n, `${name}: ${n} source(s) at ${t / 1e4}s`);
  // Never late. After the first lay (which starts 60 ms ahead) a note is laid about three seconds
  // before it sounds; less only where the page itself stalled (a slowed CPU, a busy machine), which
  // is reported, not judged, here.
  const first = Math.min(...sources.map((s) => s.now));
  const lead = Math.min(...sources.filter((s) => s.now > first + 0.01).map((s) => s.when - s.now));
  assert.ok(sources.every((s) => s.when >= s.now), `${name}: nothing laid in the past`);
  // The horizon: four seconds, never much more.
  const horizon = (state.upTo - state.from) * state.spb - (state.now - state.at);
  assert.ok(horizon > 0 && horizon < 4.6, `${name}: ${horizon.toFixed(2)} s laid ahead`);
  // Voices that have sounded are let go of: what is kept is what sounds or is still to come.
  const live = state.notes.filter(([start, duration]) => state.at + (start + duration - state.from) * state.spb > state.now - (throttle > 1 || slowTimer ? 4 : 1) && start < state.upTo && start + duration > state.from).length;
  assert.ok(state.voices <= live, `${name}: ${state.voices} voices kept for ${live} sounding or to come`);
  assert.ok(state.voices < expected.length * 0.75, `${name}: ended voices forgotten (${state.voices} of ${expected.length})`);
  assert.equal(after, 0, `${name}: nothing kept after Pause`);
  results.push(`${name}: ${expected.length} notes, ${sources.length} sources, least lead ${lead.toFixed(2)} s, ${horizon.toFixed(2)} s ahead, ${state.voices} voices kept`);
}

try {
  await run('piano', {});
  await run('piano on a slow CPU', { throttle: 4 });
  await run('piano, timer once a second', { slowTimer: true });
  await run('piano after a seek', { seek: true });
  await run('voice', { sound: 'voice' });
  await fs.writeFile(path.join(out, 'results.json'), JSON.stringify(results, null, 1));
  console.log(results.join('\n'));
  console.log('playback schedule: ok');
} finally {
  await browser.close();
  await server.close();
}
