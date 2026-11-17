// Shared helpers for the CI scripts: log parsing into test-level failures, formatting.
// Recognises the formats our suites actually print: node:test TAP (test:integration),
// Vitest (npm test), tsc, and uncaught Node errors with stacks (browser/ops/check scripts).
import path from 'node:path';

export const stripAnsi = (text) => text.replace(/\x1b\[[0-9;?]*[ -\/]*[@-~]/g, '').replace(/\r(?!\n)/g, '\n');

// GitHub's runner log timestamps are not in our files, but strip them if a log was downloaded.
const noStamp = (line) => line.replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z /, '');

export function duration(seconds) {
  const s = Math.round(seconds);
  return s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`;
}

/** Path relative to the workspace for a stack frame / location, or null if outside the repo. */
export function repoLocation(raw, workspace) {
  if (!raw) return null;
  let m = raw.match(/((?:file:\/\/)?(?:\/|[A-Za-z]:\\)?[^\s()'"]*?\.(?:[cm]?[jt]sx?)):(\d+)(?::(\d+))?/);
  if (!m) return null;
  let file = m[1].replace(/^file:\/\//, '');
  if (path.isAbsolute(file)) {
    const rel = path.relative(workspace, file);
    if (rel.startsWith('..')) return null;
    file = rel;
  }
  if (/(^|\/)node_modules\//.test(file) || file.startsWith('node:')) return null;
  return { file: file.split(path.sep).join('/'), line: Number(m[2]) };
}

function firstRepoFrame(lines, workspace) {
  for (const l of lines) {
    if (!/^\s*at\s|❯|^\s*file:\/\//.test(l)) continue;
    const loc = repoLocation(l, workspace);
    if (loc) return loc;
  }
  return null;
}

/** node:test TAP output: `not ok N - name` followed by an indented YAML diagnostic block. */
function parseTap(lines, workspace) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)not ok \d+ - (.*?)(?:\s+#\s*(?:TODO|SKIP).*)?$/);
    if (!m) continue;
    const indent = m[1].length;
    const block = [];
    let j = i + 1;
    if (lines[j]?.trim() === '---') {
      for (j++; j < lines.length && lines[j].trim() !== '...'; j++) block.push(lines[j]);
    }
    const yaml = block.join('\n');
    if (/failureType:\s*'?(subtestsFailed|cancelledByParent)/.test(yaml)) continue;
    const field = (name) => {
      const k = block.findIndex((l) => new RegExp(`^\\s*${name}:`).test(l));
      if (k < 0) return null;
      const inline = block[k].replace(new RegExp(`^\\s*${name}:\\s*`), '');
      if (!/^[|>]-?$/.test(inline)) return inline.replace(/^'(.*)'$/, '$1');
      const base = block[k].search(/\S/);
      const body = [];
      for (let n = k + 1; n < block.length && (block[n].search(/\S/) > base || !block[n].trim()); n++) body.push(block[n].trim());
      return body.join('\n').trim();
    };
    const message = [field('name'), field('error')].filter(Boolean).join(': ') || 'test failed';
    const extra = ['expected', 'actual'].map((k) => (field(k) ? `${k}: ${field(k)}` : null)).filter(Boolean);
    const stack = (field('stack') ?? '').split('\n').map((l) => `at ${l}`);
    let loc = firstRepoFrame(stack, workspace) ?? repoLocation(field('location'), workspace);
    let text = [message, ...extra].join('\n');
    if (/^(Error: )?test failed$/.test(message)) {
      // A whole test file failed (crash, missing build…): node:test only says "test failed"; the
      // real error is in the file's `# ` output lines just before this `not ok`.
      const output = [];
      for (let k = i - 1; k >= 0 && k > i - 400 && !/^\s*(not )?ok \d+ - /.test(lines[k]); k--) {
        const c = lines[k].match(/^\s*# ?(.*)$/);
        if (c && !/^Subtest: /.test(c[1])) output.unshift(c[1]);
      }
      const cause = parseUncaught(output, workspace)[0];
      if (cause) { text = `${cause.message}\n(${m[2].trim()} exited before its tests completed)`; loc = cause.file ? cause : loc; }
    }
    out.push({ test: m[2].trim(), message: text, file: loc?.file ?? null, line: loc?.line ?? null, depth: indent });
  }
  return out;
}

/** Vitest: ` FAIL  tests/x.test.ts > suite > test` then the error and ` ❯ file:line:col` frames. */
function parseVitest(lines, workspace) {
  const out = [];
  const seen = new Set();
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*FAIL\s+(\S+\.(?:[cm]?[jt]sx?))\s+>\s+(.*)$/);
    if (!m) continue;
    const key = `${m[1]} > ${m[2]}`;
    if (seen.has(key)) continue;
    const body = [];
    for (let j = i + 1; j < lines.length && j < i + 60; j++) {
      if (/^\s*FAIL\s|^\s*⎯{3,}|^\s*(Test Files|Tests)\s+\d/.test(lines[j])) break;
      body.push(lines[j]);
    }
    if (!body.some((l) => l.trim())) continue; // the short list printed before details
    seen.add(key);
    const msg = body.filter((l) => l.trim() && !/^\s*❯|^\s*\d+\s*\||^\s*\|/.test(l)).slice(0, 8).join('\n').trim();
    const loc = firstRepoFrame(body, workspace) ?? { file: m[1], line: null };
    out.push({ test: m[2].trim(), message: msg || 'test failed', file: loc.file, line: loc.line });
  }
  return out;
}

/** tsc: `src/x.ts(12,5): error TS2322: message`. */
function parseTsc(lines) {
  const out = [];
  for (const l of lines) {
    const m = l.match(/^(\S+\.[cm]?[jt]sx?)\((\d+),\d+\): error (TS\d+): (.*)$/);
    if (m) out.push({ test: m[3], message: m[4], file: m[1], line: Number(m[2]) });
  }
  return out;
}

const WRAPPER = /Command failed \(|^Error: Process completed|Fixture migration failed|^npm (error|ERR!)/;

/** Uncaught Node errors (browser/ops scripts): the innermost meaningful error with a repo frame. */
function parseUncaught(lines, workspace) {
  const header = /^\s*(?:Uncaught\s+)?((?:[A-Z]\w*)?(?:Error|Exception)(?: \[[A-Z_]+\])?|TimeoutError|AssertionError(?: \[ERR_ASSERTION\])?):\s?(.*)$/;
  const candidates = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(header);
    if (!m || WRAPPER.test(lines[i])) continue;
    const body = [lines[i].trim()];
    let frames = [];
    for (let j = i + 1; j < lines.length && j < i + 80; j++) {
      if (/^\s+at\s/.test(lines[j])) { frames.push(lines[j]); continue; }
      if (frames.length) break;
      if (body.length < 14) body.push(lines[j].replace(/\s+$/, ''));
    }
    if (!frames.length) continue;
    // Node prints `file:///…/x.mjs:207` + the source line just above the header: prefer that.
    const above = lines.slice(Math.max(0, i - 4), i).reverse().map((l) => repoLocation(l.trim(), workspace)).find(Boolean);
    const loc = firstRepoFrame(frames, workspace) ?? above;
    candidates.push({ index: i, test: null, message: body.join('\n').trim(), file: loc?.file ?? null, line: loc?.line ?? null });
  }
  if (!candidates.length) return [];
  // The last error printed before the harness/npm wrappers is the one that ended the suite.
  const withRepo = candidates.filter((c) => c.file);
  const pick = (withRepo.length ? withRepo : candidates).at(-1);
  // Name the failing step if the harness reported which sub-script failed.
  const wrapper = lines.slice(pick.index).find((l) => /Command failed \(\d+\): (.*)/.test(l));
  const script = wrapper?.match(/Command failed \(\d+\): (.*)/)?.[1]?.trim();
  const progress = lines.slice(0, pick.index).reverse().find((l) => /^[a-z][\w ,'/&-]{3,80}(passed|verified)?$/i.test(l.trim()) && !/^\s*at\s/.test(l));
  return [{ ...pick, test: script ? `${script}${progress ? ` (after “${progress.trim()}”)` : ''}` : null }];
}

export function parseFailures(text, workspace = process.cwd()) {
  const lines = text.split('\n').map(noStamp);
  const tap = parseTap(lines, workspace);
  if (tap.length) {
    // Parents that failed only because of their subtests were already dropped: these are leaves.
    return dedupe(tap.map(({ depth, ...f }) => f));
  }
  for (const parser of [parseVitest, parseTsc]) {
    const found = parser(lines, workspace);
    if (found.length) return dedupe(found);
  }
  return parseUncaught(lines, workspace).map(({ index, ...f }) => f);
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((f) => {
    const key = `${f.test}|${f.file}|${f.line}|${f.message.split('\n')[0]}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
