/**
 * Playback profile on a throttled mobile device: the real player (stubbed API) playing in the piano
 * roll or the sheet view, measured for frame pacing, main-thread work, garbage collection and the
 * audio path. See docs/agents/playback-performance.md.
 *
 *   node scripts/perf-playback.mjs [--scenario name[,name]] [--throttle 4] [--seconds 20]
 *                                  [--label baseline] [--trace] [--profile] [--runs 1]
 *
 * Results (JSON per scenario, summary.md) go to PERF_EVIDENCE, outside Git by default.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { ownerFixture } from './owner-decisions-fixture.mjs';
import { denseScore } from './perf-dense-score.mjs';

const args = Object.fromEntries(process.argv.slice(2).flatMap((a, i, all) => (a.startsWith('--') ? [[a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : '1']] : [])));
const label = args.label ?? 'run';
const out = path.resolve(process.env.PERF_EVIDENCE ?? '.review-evidence/perf-playback', label);
const throttle = Number(args.throttle ?? 4);
const seconds = Number(args.seconds ?? 20);
const runs = Number(args.runs ?? 1);
await fs.mkdir(out, { recursive: true });

// What a scenario plays, in which view, and what it does meanwhile.
const SCENARIOS = {
  'roll-demo': { piece: 'demo', view: 'roll' },
  'roll-dense': { piece: 'dense', view: 'roll', fromBar: 40 },
  'roll-dense-voice': { piece: 'dense', view: 'roll', fromBar: 40, sound: 'voice' },
  'roll-dense-mixer': { piece: 'dense', view: 'roll', fromBar: 40, mixer: true },
  'roll-dense-gel': { piece: 'dense', view: 'roll', fromBar: 40, theme: 'gel' },
  'staff-demo': { piece: 'demo', view: 'staff' },
  'staff-dense': { piece: 'dense', view: 'staff', fromBar: 40 },
};
const chosen = (args.scenario ?? Object.keys(SCENARIOS).join(',')).split(',');

const hooks = `
window.perfHooks = {
  load: async (key) => {
    sessionMode = 'solo';
    await loadSongLocally({ id: 'perf-' + key, title: 'Profile ' + key, xml: window.ownerXML[key], format: 'musicxml' });
    renderNow();
  },
  view: (v) => { setActiveView(v); renderNow(); },
  seekBar: (n) => { const m = currentScore.measures.find((m) => m.number === n); if (m) seekToBeat(m.startBeat); },
  toggle: () => togglePlay(),
  solo: (index) => { toggleTrueSolo(currentScore.parts[index].id); scheduleRender(); },
  engine: () => audioEngine,
  state: () => ({ playing: !!audioEngine?.isPlaying(), beat: engineBeat(), total: currentScore?.totalBeats, parts: currentScore?.parts.length, notes: currentScore?.notes.length, view: activeView, bpm, follow: followPref, sound: playbackSound, roll: pianoRoll?.debugInfo(), drift: audioEngine?.clockDrift() }),
};`;

// In the page, before the app: counts and clocks the profile reads afterwards.
function collectors() {
  const perf = (window.__perf = { raf: [], long: [], loaf: [], audio: [], nodes: [], ticks: [], load: [], running: false, tapped: 0 });
  // The tap on Play, to tell how long the music takes to start moving.
  addEventListener('pointerdown', (e) => { if (perf.running && !perf.tapped) perf.tapped = e.timeStamp; }, { capture: true });
  const loop = (ts) => {
    if (perf.running) perf.raf.push(ts);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (perf.running) perf.long.push({ t: e.startTime, ms: e.duration });
    }).observe({ type: 'longtask', buffered: false });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (!perf.running) continue;
        perf.loaf.push({
          t: e.startTime, ms: e.duration, blocking: e.blockingDuration, render: e.renderStart ? e.startTime + e.duration - e.renderStart : 0,
          layout: e.styleAndLayoutStart ? e.startTime + e.duration - e.styleAndLayoutStart : 0,
          scripts: (e.scripts ?? []).map((s) => ({ ms: s.duration, fn: s.sourceFunctionName, invoker: s.invoker, layout: s.forcedStyleAndLayoutDuration })),
        });
      }
    }).observe({ type: 'long-animation-frame', buffered: false });
  } catch { /* not observed here */ }
  // Audio nodes made, by the moment they were made: a scheduling burst shows as a spike.
  let made = 0;
  for (const name of Object.getOwnPropertyNames(BaseAudioContext.prototype)) {
    if (!name.startsWith('create') || name === 'createBuffer' || name === 'createPeriodicWave') continue;
    const original = BaseAudioContext.prototype[name];
    BaseAudioContext.prototype[name] = function (...a) {
      made++;
      return original.apply(this, a);
    };
  }
  perf.start = (ctx, engine) => {
    perf.raf.length = perf.long.length = perf.loaf.length = perf.audio.length = perf.nodes.length = perf.ticks.length = perf.load.length = 0;
    perf.running = true;
    perf.tapped = 0;
    // The audio thread's own load, where the browser reports it (an experimental feature).
    if (ctx.renderCapacity && !perf.capacity) {
      perf.capacity = ctx.renderCapacity;
      perf.capacity.addEventListener('update', (e) => { if (perf.running) perf.load.push({ t: performance.now(), average: e.averageLoad, peak: e.peakLoad, underrun: e.underrunRatio }); });
      perf.capacity.start({ updateInterval: 1 });
    }
    made = 0;
    let last = 0;
    // The engine's top-up, timed: how long each call keeps the main thread.
    const tick = engine.tick.bind(engine);
    engine.tick = () => {
      const t0 = performance.now();
      const before = made;
      tick();
      const ms = performance.now() - t0;
      if (made > before) perf.ticks.push({ t: t0, ms, nodes: made - before });
    };
    perf.timer = setInterval(() => {
      // The context's clock against the page's: where the sound stalls, the first falls behind.
      const stamp = ctx.getOutputTimestamp?.();
      perf.audio.push({ perf: performance.now(), ctx: ctx.currentTime, out: stamp?.contextTime ?? 0, outPerf: stamp?.performanceTime ?? 0, state: ctx.state });
      if (made !== last) perf.nodes.push({ t: performance.now(), n: made - last });
      last = made;
    }, 20);
  };
  perf.stop = (ctx) => {
    perf.running = false;
    clearInterval(perf.timer);
    const stats = ctx.playbackStats;
    return {
      raf: perf.raf, long: perf.long, loaf: perf.loaf, audio: perf.audio, nodes: perf.nodes, ticks: perf.ticks, load: perf.load, tapped: perf.tapped,
      playbackStats: stats ? { fallbackFramesDuration: stats.fallbackFramesDuration, fallbackFramesEvents: stats.fallbackFramesEvents, totalFramesDuration: stats.totalFramesDuration, averageLatency: stats.averageLatency, maximumLatency: stats.maximumLatency } : null,
      baseLatency: ctx.baseLatency, outputLatency: ctx.outputLatency, sampleRate: ctx.sampleRate,
      frames: (window.__frames ?? []).slice(),
    };
  };
}

const quantile = (sorted, q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0);
const round = (n, d = 2) => Number(n.toFixed(d));

function summarize(raw, trace, profile, heap) {
  // Only the frames while the music played (the app's own frame log says when that was).
  const played = raw.frames.length ? [raw.frames[0].t - 20, raw.frames.at(-1).t + 20] : [0, Infinity];
  const raf = raw.raf.filter((t) => t >= played[0] && t <= played[1]);
  const gaps = raf.slice(1).map((t, i) => t - raf[i]);
  const sorted = [...gaps].sort((a, b) => a - b);
  const wall = raf.length ? raf.at(-1) - raf[0] : 0;
  const typical = quantile(sorted, 0.5);
  const draws = raw.frames.map((f) => f.ms).sort((a, b) => a - b);
  // Motion: how far the picture moved each frame against how far it should have for the time passed.
  const frames = raw.frames;
  let jerk = 0;
  let jerks = 0;
  const steps = [];
  for (let i = 1; i < frames.length; i++) {
    const dt = frames[i].t - frames[i - 1].t;
    const db = frames[i].beat - frames[i - 1].beat;
    if (dt > 0 && dt < 250) steps.push({ dt, db });
  }
  const rate = steps.reduce((a, s) => a + s.db, 0) / Math.max(1, steps.reduce((a, s) => a + s.dt, 0)); // beats per ms
  for (const s of steps) {
    const error = Math.abs(s.db / rate - s.dt); // ms of motion off the even pace
    jerk = Math.max(jerk, error);
    if (error > 4) jerks++;
  }
  // The sound: the context's clock falling behind the page's between two samples is a stall.
  let stall = 0;
  let stalls = 0;
  let stalled = 0;
  for (let i = 1; i < raw.audio.length; i++) {
    const a = raw.audio[i - 1];
    const b = raw.audio[i];
    if (a.state !== 'running' || b.state !== 'running') continue;
    const behind = b.perf - a.perf - (b.ctx - a.ctx) * 1000;
    if (behind > 25) {
      stalls++;
      stalled += behind;
    }
    stall = Math.max(stall, behind);
  }
  const audioSpan = raw.audio.length > 1 ? { perf: raw.audio.at(-1).perf - raw.audio[0].perf, ctx: (raw.audio.at(-1).ctx - raw.audio[0].ctx) * 1000 } : { perf: 0, ctx: 0 };
  const tickMs = raw.ticks.map((t) => t.ms).sort((a, b) => a - b);
  const last = frames.at(-1) ?? {};
  const first = frames[0] ?? {};
  return {
    frames: {
      count: gaps.length, seconds: round(wall / 1000, 1), fps: round(gaps.length / (wall / 1000 || 1), 1),
      p50: round(typical), p95: round(quantile(sorted, 0.95)), p99: round(quantile(sorted, 0.99)), max: round(sorted.at(-1) ?? 0),
      over25: gaps.filter((g) => g > 25).length, over34: gaps.filter((g) => g > 34).length, over50: gaps.filter((g) => g > 50).length, over100: gaps.filter((g) => g > 100).length,
      // Time lost to late frames, as a share of the time played.
      lateShare: round(gaps.filter((g) => g > 25).reduce((a, g) => a + g - 16.7, 0) / (wall || 1), 3),
    },
    draw: { p50: round(quantile(draws, 0.5)), p95: round(quantile(draws, 0.95)), p99: round(quantile(draws, 0.99)), max: round(draws.at(-1) ?? 0), mean: round(draws.reduce((a, b) => a + b, 0) / (draws.length || 1)) },
    motion: { maxErrorMs: round(jerk), over4ms: jerks },
    roll: { rebuilds: (last.rebuilds ?? 0) - (first.rebuilds ?? 0), swaps: (last.swaps ?? 0) - (first.swaps ?? 0), drops: (last.drops ?? 0) - (first.drops ?? 0) },
    longTasks: { count: raw.long.length, total: round(raw.long.reduce((a, l) => a + l.ms, 0)), max: round(Math.max(0, ...raw.long.map((l) => l.ms))) },
    longFrames: { count: raw.loaf.length, blocking: round(raw.loaf.reduce((a, l) => a + l.blocking, 0)), max: round(Math.max(0, ...raw.loaf.map((l) => l.ms))) },
    audio: {
      maxStallMs: round(stall), stalls, stalledMs: round(stalled), clockRatio: round(audioSpan.ctx / (audioSpan.perf || 1), 4),
      scheduling: { bursts: raw.ticks.length, nodes: raw.ticks.reduce((a, t) => a + t.nodes, 0), maxNodes: Math.max(0, ...raw.ticks.map((t) => t.nodes)), p50: round(quantile(tickMs, 0.5)), max: round(tickMs.at(-1) ?? 0), total: round(tickMs.reduce((a, b) => a + b, 0)) },
      load: raw.load.length ? { average: round(raw.load.reduce((a, l) => a + l.average, 0) / raw.load.length, 3), peak: round(Math.max(...raw.load.map((l) => l.peak)), 3), underrun: round(Math.max(...raw.load.map((l) => l.underrun)), 3) } : null,
      playbackStats: raw.playbackStats, baseLatency: raw.baseLatency, outputLatency: raw.outputLatency,
    },
    // From the tap on Play to the end of the first frame of moving music.
    startMs: raw.tapped && frames.length ? round(frames[0].t + frames[0].ms - raw.tapped, 0) : null,
    ...(heap ? { heap } : {}),
    ...(trace ? { trace } : {}),
    ...(profile ? { profile } : {}),
  };
}

/** Main-thread work by kind, from a trace of the page's renderer. */
function readTrace(events, seconds) {
  const names = new Map();
  for (const e of events) if (e.ph === 'M' && e.name === 'thread_name') names.set(`${e.pid}:${e.tid}`, e.args.name);
  // The renderer that ran the page's script: the busiest CrRendererMain.
  const busy = new Map();
  for (const e of events) if (e.ph === 'X' && e.name === 'FunctionCall') busy.set(`${e.pid}:${e.tid}`, (busy.get(`${e.pid}:${e.tid}`) ?? 0) + e.dur);
  const main = [...busy].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!main) return null;
  const pid = main.split(':')[0];
  const sums = {};
  const add = (key, dur) => {
    sums[key] ??= { ms: 0, count: 0, max: 0 };
    sums[key].ms += dur / 1000;
    sums[key].count++;
    sums[key].max = Math.max(sums[key].max, dur / 1000);
  };
  const kinds = new Set(['RunTask', 'FunctionCall', 'EvaluateScript', 'TimerFire', 'FireAnimationFrame', 'EventDispatch', 'UpdateLayoutTree', 'Layout', 'PrePaint', 'Paint', 'Layerize', 'Commit', 'MinorGC', 'MajorGC', 'V8.GC_SCAVENGER', 'V8.GC_MARK_COMPACTOR', 'HitTest', 'ParseHTML', 'RasterTask', 'ImageDecodeTask', 'GPUTask', 'DrawFrame', 'DroppedFrame', 'CanvasResourceProvider::FlushCanvas', 'Canvas2DLayerBridge::FlushRecording']);
  const tasks = [];
  for (const e of events) {
    if (String(e.pid) !== pid && e.name !== 'GPUTask') continue;
    const thread = names.get(`${e.pid}:${e.tid}`) ?? '';
    if (e.ph === 'I' || e.ph === 'i') {
      if (e.name === 'DroppedFrame' || e.name === 'DrawFrame') add(e.name, 0);
      continue;
    }
    if (e.ph !== 'X' || !kinds.has(e.name)) continue;
    if (`${e.pid}:${e.tid}` === main) {
      add(e.name, e.dur);
      if (e.name === 'RunTask') tasks.push(e.dur / 1000);
    } else if (e.name === 'RasterTask' || e.name === 'ImageDecodeTask' || e.name === 'GPUTask') add(`${e.name} (${thread.replace(/\d+$/, '') || 'other'})`, e.dur);
  }
  const perSecond = Object.fromEntries(Object.entries(sums).map(([k, v]) => [k, { msPerSec: round(v.ms / seconds), count: v.count, max: round(v.max) }]));
  tasks.sort((a, b) => a - b);
  return { perSecond, tasks: { over16: tasks.filter((t) => t > 16.7).length, over50: tasks.filter((t) => t > 50).length, max: round(tasks.at(-1) ?? 0), busyShare: round(tasks.reduce((a, b) => a + b, 0) / (seconds * 1000), 3) } };
}

/** Self time by function, from a sampling CPU profile. */
function readProfile(profile, seconds) {
  const self = new Map();
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const deltas = profile.timeDeltas ?? [];
  profile.samples.forEach((id, i) => {
    const n = byId.get(id);
    if (!n) return;
    const f = n.callFrame;
    const key = `${f.functionName || '(anonymous)'} ${f.url.split('/').slice(-1)[0].split('?')[0]}:${f.lineNumber + 1}`;
    self.set(key, (self.get(key) ?? 0) + (deltas[i] ?? 0) / 1000);
  });
  const total = [...self.values()].reduce((a, b) => a + b, 0);
  return { top: [...self].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([fn, ms]) => ({ fn, msPerSec: round(ms / seconds), share: round(ms / total, 3) })) };
}

const { server, base } = await ownerFixture(out, hooks);
const demo = await fs.readFile('public/evening-rise.musicxml', 'utf8');
const dense = denseScore();
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--enable-blink-features=AudioContextPlaybackStats,AudioRenderCapacity', ...(args.gpu ? ['--enable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : [])] });
const results = {};
try {
  for (const name of chosen) {
    const scenario = SCENARIOS[name];
    if (!scenario) throw new Error(`Unknown scenario ${name}; one of ${Object.keys(SCENARIOS).join(', ')}`);
    for (let run = 0; run < runs; run++) {
      // A small phone: 360x740 css px at 3x (the roll caps its own density at 2x).
      const context = await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-A136B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36', colorScheme: scenario.scheme ?? 'dark' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.addInitScript(collectors);
      await page.addInitScript(({ sound, theme }) => {
        localStorage.setItem('ai-capella-lang', 'en');
        if (sound) localStorage.setItem('ai-capella-sound', sound);
        if (theme === 'gel') localStorage.setItem('ai-capella-roll', 'gel');
      }, scenario);
      await page.routeWebSocket('**', (ws) => ws.close());
      await page.goto(`${base}owner.html`);
      await page.waitForFunction(() => window.ownerReady, null, { timeout: 120_000 });
      await page.evaluate(({ demo, dense }) => Object.assign(window.ownerXML, { demo, dense }), { demo, dense });
      await page.evaluate((key) => window.perfHooks.load(key), scenario.piece);
      await page.evaluate((view) => window.perfHooks.view(view), scenario.view);
      if (scenario.fromBar) await page.evaluate((bar) => window.perfHooks.seekBar(bar), scenario.fromBar);
      // The piano's samples decoded before the measurement, as on a second Play.
      await page.waitForTimeout(1500);
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
      if (args.trace) await browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'v8', 'disabled-by-default-v8.gc', 'gpu', 'cc'] });
      if (args.profile) {
        await cdp.send('Profiler.enable');
        await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
        await cdp.send('Profiler.start');
      }
      await cdp.send('HeapProfiler.enable');
      const heapBefore = (await cdp.send('Runtime.getHeapUsage')).usedSize;
      await page.evaluate(() => {
        window.__frames.length = 0;
        window.__perf.start(window.perfHooks.engine().context, window.perfHooks.engine());
      });
      // A real tap on Play: the sound starts as it does for a singer.
      await page.locator('[data-action=play]:visible').first().tap();
      const started = Date.now();
      const heapSamples = [];
      let step = 0;
      while (Date.now() - started < seconds * 1000) {
        await page.waitForTimeout(500);
        heapSamples.push((await cdp.send('Runtime.getHeapUsage')).usedSize);
        // The voices' switches during playback: "only this voice" on and off, voice after voice.
        if (scenario.mixer && ++step % 4 === 0) await page.evaluate((i) => window.perfHooks.solo(i), Math.floor(step / 8) % 4);
      }
      const state = await page.evaluate(() => window.perfHooks.state());
      const raw = await page.evaluate(() => window.__perf.stop(window.perfHooks.engine().context));
      let profile = null;
      if (args.profile) profile = readProfile((await cdp.send('Profiler.stop')).profile, seconds);
      let trace = null;
      if (args.trace) {
        const buffer = await browser.stopTracing();
        await fs.writeFile(path.join(out, `${name}.trace.json`), buffer);
        trace = readTrace(JSON.parse(buffer.toString()).traceEvents, seconds);
      }
      // Allocation: every rise of the heap between two samples (a fall is a collection).
      let allocated = 0;
      let collections = 0;
      for (let i = 1; i < heapSamples.length; i++) {
        if (heapSamples[i] > heapSamples[i - 1]) allocated += heapSamples[i] - heapSamples[i - 1];
        else collections++;
      }
      const heap = { startMb: round(heapBefore / 1e6, 1), endMb: round(heapSamples.at(-1) / 1e6, 1), peakMb: round(Math.max(...heapSamples) / 1e6, 1), risenMbPerSec: round(allocated / 1e6 / seconds, 2), falls: collections };
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      await page.screenshot({ path: path.join(out, `${name}.png`) });
      const summary = { scenario: name, run, throttle, seconds, state, errors, ...summarize(raw, trace, profile, heap) };
      results[runs > 1 ? `${name}#${run}` : name] = summary;
      await fs.writeFile(path.join(out, `${name}${runs > 1 ? `-${run}` : ''}.json`), JSON.stringify({ summary, raw: { ...raw, frames: raw.frames.map((f) => ({ t: round(f.t, 1), beat: round(f.beat, 4), ms: round(f.ms), heard: round(f.heard, 4), rebuilds: f.rebuilds, swaps: f.swaps, next: f.next })) } }));
      const f = summary.frames;
      console.log(`${name.padEnd(18)} x${throttle} fps ${String(f.fps).padStart(5)} p50 ${f.p50} p95 ${f.p95} p99 ${f.p99} max ${f.max} | >25ms ${f.over25} >50ms ${f.over50} >100ms ${f.over100} | draw p50 ${summary.draw.p50} p95 ${summary.draw.p95} max ${summary.draw.max} | long ${summary.longTasks.count}/${summary.longTasks.max}ms | sched max ${summary.audio.scheduling.max}ms/${summary.audio.scheduling.maxNodes}n | stall ${summary.audio.maxStallMs}ms x${summary.audio.stalls} load ${summary.audio.load ? `${summary.audio.load.average}/${summary.audio.load.peak}` : '-'} | start ${summary.startMs}ms | heap +${heap.risenMbPerSec}MB/s${errors.length ? ` | ERRORS ${errors.join('; ')}` : ''}`);
      await context.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
}
const rows = Object.entries(results).map(([name, s]) => `| ${name} | ${s.frames.fps} | ${s.frames.p50} | ${s.frames.p95} | ${s.frames.p99} | ${s.frames.max} | ${s.frames.over25} | ${s.frames.over50} | ${s.frames.over100} | ${s.draw.p50} | ${s.draw.p95} | ${s.draw.max} | ${s.longTasks.count} | ${s.longTasks.max} | ${s.audio.scheduling.max} | ${s.audio.scheduling.maxNodes} | ${s.audio.maxStallMs} | ${s.heap.risenMbPerSec} |`);
await fs.writeFile(path.join(out, 'summary.json'), JSON.stringify(results, null, 1));
await fs.writeFile(path.join(out, 'summary.md'), `# Playback profile: ${label} (CPU x${throttle}, ${seconds} s)\n\n| scenario | fps | frame p50 | p95 | p99 | max | >25 ms | >50 ms | >100 ms | draw p50 | draw p95 | draw max | long tasks | longest | sched max ms | sched max nodes | audio stall max | heap MB/s |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n${rows.join('\n')}\n`);
console.log(`\n${path.join(out, 'summary.md')}`);
