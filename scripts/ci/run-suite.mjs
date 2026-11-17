#!/usr/bin/env node
// Runs one CI suite, keeps its full log, and turns a failure into a short, actionable report:
// ::error annotations (file:line when known), a $GITHUB_STEP_SUMMARY section and a result record
// that scripts/ci/summary.mjs aggregates. The child's exit status is preserved.
//
//   node scripts/ci/run-suite.mjs --id unit-utc --title "Unit tests (UTC)" -- npm test
//
// Works outside GitHub Actions too (annotations/summary are then just printed or skipped).
import { spawn } from 'node:child_process';
import { appendFileSync, createWriteStream, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { duration, parseFailures, stripAnsi } from './lib.mjs';

const argv = process.argv.slice(2);
const split = argv.indexOf('--');
if (split < 0 || split === argv.length - 1) {
  console.error('usage: run-suite.mjs --id <id> --title <title> [--repro <command>] -- <command...>');
  process.exit(2);
}
const opts = {};
for (let i = 0; i < split; i += 2) opts[argv[i].replace(/^--/, '')] = argv[i + 1];
const command = argv.slice(split + 1);
const id = opts.id;
const title = opts.title ?? id;
const repro = opts.repro ?? command.join(' ');
if (!id || !/^[\w.-]+$/.test(id)) throw Error(`run-suite: invalid --id ${id}`);

const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd();
const ciDir = path.resolve('.review-evidence/ci');
const logDir = path.join(ciDir, 'logs');
mkdirSync(logDir, { recursive: true });
const logFile = path.join(logDir, `${id}.log`);
const log = createWriteStream(logFile);
const job = process.env.CI_JOB_LABEL ?? process.env.GITHUB_JOB ?? 'local';
const artifact = process.env.CI_FAILURE_ARTIFACT ?? `failure-${job}`;
const started = Date.now();

const inActions = process.env.GITHUB_ACTIONS === 'true';
if (inActions) console.log(`::group::${title}  —  ${command.join(' ')}`);
else console.log(`▶ ${title}: ${command.join(' ')}`);

const child = spawn(command[0], command.slice(1), { stdio: ['inherit', 'pipe', 'pipe'], env: process.env });
child.stdout.on('data', (chunk) => { process.stdout.write(chunk); log.write(chunk); });
child.stderr.on('data', (chunk) => { process.stderr.write(chunk); log.write(chunk); });
// A job timeout or run cancellation sends SIGINT (then SIGTERM ~7 s later). Report what the log
// shows so far instead of vanishing without a summary, e.g. for a suite that hangs.
let interrupted = null;
const code = await new Promise((resolve) => {
  child.on('error', (error) => { log.write(`\nrun-suite: could not start ${command[0]}: ${error.message}\n`); resolve(127); });
  child.on('close', (status, signal) => resolve(interrupted ? 130 : status ?? (signal ? 128 : 1)));
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => {
    if (interrupted) return;
    interrupted = sig;
    log.write(`\nrun-suite: received ${sig} (job timeout or run cancelled); stopping the suite and reporting.\n`);
    child.kill('SIGTERM');
    setTimeout(() => resolve(130), 2000).unref();
  });
});
await new Promise((resolve) => log.end(resolve));
const seconds = Math.round((Date.now() - started) / 100) / 10;
if (inActions) console.log('::endgroup::');

const record = { job, id, title, command: command.join(' '), status: code === 0 ? 'passed' : interrupted ? 'interrupted' : 'failed', exitCode: code, seconds, log: path.relative(process.cwd(), logFile), failures: [] };

if (code !== 0) {
  const text = stripAnsi(readFileSync(logFile, 'utf8'));
  const failures = parseFailures(text, workspace);
  record.failures = failures;
  const evidence = recentEvidence(started);
  record.evidence = evidence;
  const runUrl = process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : null;

  // Annotations: at most five, each one line of context (GitHub caps a step at ten).
  const shown = failures.slice(0, 5);
  if (shown.length === 0) shown.push({ test: null, message: lastLines(text, 8).join('\n'), file: null, line: null });
  for (const f of shown) {
    const props = [`title=${prop(`${title} ${interrupted ? 'stopped (timeout/cancel)' : 'failed'}${f.test ? `: ${f.test}` : ''}`)}`];
    if (f.file) props.unshift(`file=${prop(f.file)}`, ...(f.line ? [`line=${f.line}`] : []));
    console.log(`::error ${props.join(',')}::${data(`${f.message}\n\nLog: ${record.log} (artifact ${artifact}). Re-run locally: ${repro}`)}`);
  }
  if (!inActions) for (const f of shown) console.error(`✖ ${f.test ?? title}${f.file ? ` (${f.file}:${f.line ?? '?'})` : ''}\n${f.message}`);

  const md = [];
  md.push(interrupted
    ? `### ⏹️ ${title} — stopped after ${duration(seconds)}: job timeout or run cancelled while it was still running (possible hang)`
    : `### ❌ ${title} — failed after ${duration(seconds)} (exit ${code})`, '');
  md.push('| | |', '|---|---|');
  md.push(`| Job | \`${job}\` |`);
  md.push(`| Command | \`${command.join(' ')}\` |`);
  md.push(`| Re-run locally | \`${repro}\` |`);
  md.push(`| Full log | \`${record.log}\` in artifact [**${artifact}**](${runUrl ? `${runUrl}#artifacts` : '#'}) |`);
  if (evidence.screenshots.length || evidence.traces.length) {
    md.push(`| Evidence | ${evidence.screenshots.length} screenshot(s), ${evidence.traces.length} Playwright trace(s) in the same artifact — open a trace with \`npx playwright show-trace <file.zip>\` |`);
  }
  md.push('');
  if (failures.length) {
    md.push(`**${failures.length} failure(s)${failures.length > shown.length ? `, first ${shown.length} annotated` : ''}:**`, '');
    for (const f of failures.slice(0, 10)) {
      md.push(`- ${f.test ? `**${escapeMd(f.test)}**` : '**error**'}${f.file ? ` — \`${f.file}${f.line ? `:${f.line}` : ''}\`` : ''}`);
      md.push('', '  ```text', ...f.message.split('\n').slice(0, 12).map((l) => `  ${l}`), '  ```');
    }
  } else {
    md.push('No test-level failure could be parsed; last log lines:', '');
  }
  md.push('', '<details><summary>Last 40 log lines</summary>', '', '```text', ...lastLines(text, 40), '```', '</details>');
  if (evidence.screenshots.length || evidence.traces.length) {
    md.push('', '<details><summary>Evidence files</summary>', '');
    for (const f of [...evidence.traces, ...evidence.screenshots].slice(0, 30)) md.push(`- \`${f}\``);
    md.push('</details>');
  }
  md.push('');
  summary(md.join('\n'));
}

appendFileSync(path.join(ciDir, 'results.jsonl'), JSON.stringify(record) + '\n');
console.log(`${code === 0 ? '✔' : '✖'} ${title}: ${code === 0 ? 'passed' : `FAILED (exit ${code})`} in ${duration(seconds)}`);
process.exit(code);

function summary(markdown) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + '\n');
}
function data(value) { return String(value).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A'); }
function prop(value) { return data(value).replace(/:/g, '%3A').replace(/,/g, '%2C'); }
function escapeMd(value) { return value.replace(/[|*_`<>]/g, (c) => `\\${c}`); }
function lastLines(text, n) {
  return text.split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l && !/^npm (error|ERR!) (A complete log|code|path|workspace|location|command|$)/.test(l)).slice(-n);
}
function recentEvidence(since) {
  const screenshots = [], traces = [];
  const root = path.resolve('.review-evidence');
  const skip = /^(browser-build-|browsers$|npm$|vite-cache$|ci$|node_modules$)/;
  (function walk(dir, depth) {
    if (depth > 5) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (!skip.test(e.name)) walk(full, depth + 1); continue; }
      if (!/\.(png|zip)$/.test(e.name)) continue;
      try { if (statSync(full).mtimeMs < since) continue; } catch { continue; }
      (e.name.endsWith('.zip') ? traces : screenshots).push(path.relative(workspace, full));
    }
  })(root, 0);
  return { screenshots, traces };
}
