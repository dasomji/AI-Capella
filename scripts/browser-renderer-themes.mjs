import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import tailwind from '@tailwindcss/vite';
import { chromium } from 'playwright';

// A real canvas/browser boundary, with deterministic clocks, fonts and animation frames.
// Mutations are Vite transforms in this disposable harness; never edits to the owner preview.
const mutant = process.env.P2_MUTANT;
const mutations = {
  roll: ['/src/pianoRoll.ts', 'this.themeRevision !== this.theme.revision', 'false'],
  lantern: ['/src/pianoRoll.ts', 'if (LANTERN) this.lantern ??= new Lantern();\n    else this.lantern = null;', '/* construction-only Lantern */'],
  paper: ['/src/paper.ts', 'made.clear(); composed.clear(); patterns = new WeakMap();', '/* stale paper tiles */'],
  overview: ['/src/overview.ts', 'this.themeRevision !== theme.revision', 'false'],
  stage: ['/src/theme.ts', ' && stageCache.revision === theme.revision', ''],
  print: ['/src/exportPdf.ts', 'Object.freeze({ ...(req.print ?? readTheme().print) })', 'new Proxy({ ...(req.print ?? readTheme().print) }, { get: (_target, key) => readTheme().print[key] })'],
  gloss: ['/src/theme.ts', "shine: theme.color('material-gel-gloss-color')", 'shine: theme.print.paper'],
  idle: ['/src/paper.ts', 'if (job !== textureJob || revision !== getThemeRevision()) return;', '/* late texture may apply */'],
  gelcache: ['/src/theme.ts', 'gelShades.clear();', '/* stale gel shades */'],
  ribbon: ['/src/artwork.ts', "const current = readTheme().titleDraft === 'current';", 'const current = START_DRAFT;'],
};
const mutantMode = { roll: 'roll', lantern: 'roll', paper: 'paper', overview: 'overview', stage: 'stage-fill', gelcache: 'gel', ribbon: 'ribbons' };
if (mutant && !mutations[mutant]) throw Error('Unknown P2_MUTANT ' + mutant);
let mutated = false;
const evidence = path.resolve(process.env.BROWSER_EVIDENCE || '.review-evidence/renderer-themes');
await fs.mkdir(evidence, { recursive: true });
const fixture = await fs.readFile(new URL('./renderer-theme-fixture.js', import.meta.url), 'utf8');
const server = await createServer({
  root: process.cwd(), configFile: false, cacheDir: path.join(evidence, 'vite-cache'),
  plugins: [tailwind(), {
    name: 'renderer-regression', enforce: 'pre',
    configureServer(server) {
      server.middlewares.use('/renderer-test.html', (_req, res) => {
        res.setHeader('Content-Type', 'text/html');
        res.end('<!doctype html><html><head><link rel="stylesheet" href="/src/design-system/app.css"></head><body></body></html>');
      });
    },
    transform(code, id) {
      const mutation = mutations[mutant];
      if (!mutation || !id.endsWith(mutation[0])) return;
      assert.ok(code.includes(mutation[1]), 'Mutant target changed: ' + mutant);
      mutated = true;
      const changed = code.replace(mutation[1], mutation[2]);
      if (mutant === 'lantern') {
        const constructor = /(?:private )?lantern(?:: Lantern \| null)? = null;/;
        assert.ok(constructor.test(changed), 'Lantern constructor mutant target changed');
        return changed.replace(constructor, 'lantern = LANTERN ? new Lantern() : null;');
      }
      return mutant === 'ribbon' ? changed.replace('LOGO_DRAFT, type LogoDraft', 'LOGO_DRAFT, START_DRAFT, type LogoDraft') : changed;
    },
  }],
  server: { host: '127.0.0.1', port: 0, hmr: false, watch: null,
    fs: { allow: [process.cwd(), await fs.realpath(path.join(process.cwd(), 'node_modules')), evidence] } },
});
let browser;
const results = [];
const digest = value => createHash('sha256').update(value).digest('hex');
try {
  await server.listen();
  const base = server.resolvedUrls.local[0];
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--disable-accelerated-2d-canvas'] });
  const browserOptions = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, reducedMotion: 'reduce', colorScheme: 'dark' };
  async function pageFor(theme, overrides = {}) {
    const page = await browser.newPage(browserOptions);
    await page.addInitScript(() => {
      window.textureJobs = [];
      window.requestIdleCallback = fn => { window.textureJobs.push(fn); return window.textureJobs.length; };
    });
    await page.goto(base + 'renderer-test.html?design=' + theme);
    await page.evaluate(overrides => {
      for (const [key, value] of Object.entries(overrides)) document.documentElement.style.setProperty('--ds-' + key, value);
    }, overrides);
    await page.evaluate(fixture);
    await page.evaluate(async () => {
      window.checks = await import('/scripts/renderer-theme-checks.mjs');
    });
    return page;
  }
  async function equalImages(actualPage, expectedPage, label) {
    const [actual, expected] = await Promise.all([actualPage.evaluate(() => checks.images()), expectedPage.evaluate(() => checks.images())]);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      for (let i = 0; i < Math.max(actual.length, expected.length); i++) {
        if (actual[i] === expected[i]) continue;
        for (const [side, images] of [['retained', actual], ['fresh', expected]]) if (images[i]) {
          await fs.writeFile(path.join(evidence, `${label}-${side}-${i}.png`), Buffer.from(images[i].split(',')[1], 'base64'));
        }
      }
      if (label.endsWith('-paper')) {
        for (const [name, page] of [['retained', actualPage], ['fresh', expectedPage]]) {
          const diagnostic = await page.evaluate(() => checks.paperLayers());
          for (const [layer, value] of Object.entries(diagnostic)) await fs.writeFile(path.join(evidence, name + '-' + layer + '.png'), Buffer.from(value.split(',')[1], 'base64'));
        }
      }
      assert.fail(label + ': retained pixels differ from fresh target');
    }
    results.push({ label, canvases: actual.length, sha256: digest(actual.join('|')) });
  }
  const themes = ['night-paper', 'parchment', 'velvet'];
  const modes = (process.env.P2_MODES?.split(',') || ['roll', 'staff', 'overview', 'paper', 'gel', 'stage-fill', 'cover', 'light', 'stage', 'title-staff', 'ribbons', 'backdrop']);
  for (const from of themes) for (const to of themes) {
    if (from === to) continue;
    for (const mode of modes) {
      if (mutant && mode !== mutantMode[mutant]) continue;
      const actual = await pageFor(from), fresh = await pageFor(to);
      try {
        await actual.evaluate(mode => checks.draw(mode), mode);
        await actual.evaluate(to => checks.swap(to), to);
        await fresh.evaluate(mode => checks.draw(mode), mode);
        await equalImages(actual, fresh, `${from}-to-${to}-${mode}`);
        const voices = await actual.evaluate(() => checks.verifyVoices());
        assert.ok(voices, 'DOM --c must use the target snapshot');
      } finally { await actual.close(); await fresh.close(); }
    }
  }
  // Same-kind token edits expose paper/shade caches even when two themes share a palette.
  for (const [mode, overrides] of [
    ['paper', { 'material-paper-strand-shadow': 'rgb(240,180,100)' }],
    ['gel', { 'material-gel-gloss': '0.1', 'material-gel-deep': 'rgb(50,80,100)' }],
    ['stage-fill', { 'score-stage-top': 'rgb(50,80,100)' }],
  ]) {
    if (mutant && mode !== mutantMode[mutant]) continue;
    const actual = await pageFor('night-paper'), fresh = await pageFor('night-paper', overrides);
    try {
      await actual.evaluate(mode => checks.draw(mode), mode);
      await actual.evaluate(overrides => checks.changeInputs(overrides), overrides);
      await fresh.evaluate(mode => checks.draw(mode), mode);
      await equalImages(actual, fresh, `${mode}-input-edit`);
    } finally { await actual.close(); await fresh.close(); }
  }
  if (!mutant || ['print', 'gloss', 'idle'].includes(mutant)) {
    const page = await pageFor('night-paper');
    try { results.push(await page.evaluate(() => checks.verifyLifecycle())); }
    finally { await page.close(); }
    // Rasterize exported PDFs so timestamps/document IDs cannot mask print-freeze behavior.
    const { execFileSync } = await import('node:child_process');
    for (const swapped of [false, true]) {
      const page = await pageFor('night-paper');
      try {
        const pdf = await page.evaluate(swapped => checks.frozenPdf(swapped), swapped);
        const file = path.join(evidence, swapped ? 'print-mid-swap.pdf' : 'print-at-start.pdf');
        await fs.writeFile(file, Buffer.from(pdf, 'base64'));
        try { execFileSync('pdftoppm', ['-scale-to', '1280', '-png', '-singlefile', file, file]); }
        catch (error) {
          if (error.code !== 'ENOENT') throw error;
          execFileSync('python3', ['-c', 'import fitz,sys; d=fitz.open(sys.argv[1]); p=d[0]; p.get_pixmap(matrix=fitz.Matrix(1280/p.rect.height,1280/p.rect.height)).save(sys.argv[1]+".png")', file]);
        }
      } finally { await page.close(); }
    }
    assert.deepEqual(await fs.readFile(path.join(evidence, 'print-mid-swap.pdf.png')), await fs.readFile(path.join(evidence, 'print-at-start.pdf.png')), 'PDF must retain the print inputs captured at job start');
    results.push({ label: 'PDF mid-job print override and theme swap', equal: true });
  }
  if (mutant) assert.ok(mutated, 'Mutant was applied');
  await fs.writeFile(path.join(evidence, 'results.json'), JSON.stringify({ mutant, results }, null, 2));
  console.log(JSON.stringify({ cases: results.length, mutant, results }, null, 2));
} finally { await browser?.close(); await server.close(); }
