#!/usr/bin/env node
// CI result records and the run overview.
//
//   node scripts/ci/summary.mjs job               last step of every job: writes .review-evidence/ci/job.json
//   node scripts/ci/summary.mjs overview <dir>    gate job: one table for the whole run in $GITHUB_STEP_SUMMARY
//
// Records come from run-suite.mjs (results.jsonl, one line per suite) plus job.json.
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { duration } from './lib.mjs';

const [mode, dir] = process.argv.slice(2);
const now = Math.floor(Date.now() / 1000);

if (mode === 'job') {
  const ciDir = path.resolve('.review-evidence/ci');
  mkdirSync(ciDir, { recursive: true });
  const started = Number(process.env.CI_JOB_STARTED) || now;
  // Cache restore results of the steps with these ids (setup-node and actions/cache `cache-hit`).
  const cacheSteps = { node: 'npm', 'pw-cache': 'playwright', 'firebase-cache': 'firebase', 'rules-cache': 'rules-test' };
  let steps = {};
  try { steps = JSON.parse(process.env.CI_STEPS ?? '{}'); } catch {}
  const cache = Object.fromEntries(
    Object.entries(cacheSteps)
      .filter(([id]) => steps[id]?.outcome === 'success')
      .map(([id, name]) => [name, String(steps[id].outputs?.['cache-hit'] ?? 'false')]),
  );
  const suites = readSuites(ciDir);
  const record = {
    job: process.env.CI_JOB_LABEL ?? process.env.GITHUB_JOB ?? 'local',
    title: process.env.CI_JOB_TITLE ?? process.env.CI_JOB_LABEL ?? process.env.GITHUB_JOB ?? 'local',
    status: process.env.CI_JOB_STATUS ?? 'unknown',
    started,
    finished: now,
    cache,
  };
  writeFileSync(path.join(ciDir, 'job.json'), JSON.stringify(record, null, 2));
  const failed = suites.filter((s) => s.status !== 'passed');
  const line = `${record.title}: ${record.status} in ${duration(now - started)} — ${suites.map((s) => `${s.id} ${duration(s.seconds)}`).join(', ') || 'no suites ran'}`;
  console.log(line);
  if (record.status !== 'success' && !failed.length && process.env.GITHUB_STEP_SUMMARY) {
    // A setup step failed before any suite ran: say so instead of leaving the summary empty.
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### ❌ ${record.title}: ${record.status} before or between suites\n\nA setup step (checkout, caches, npm ci, Playwright, fixtures) failed or the job was cancelled/timed out. Open the job log and look for the first red step.\n`);
  }
  process.exit(0);
}

if (mode === 'overview') {
  const needs = JSON.parse(process.env.NEEDS_JSON ?? '{}');
  const gated = (process.env.GATED_JOBS ?? '').split(/\s+/).filter(Boolean);
  const jobs = [];
  if (dir && existsSync(dir)) {
    for (const name of readdirSync(dir).sort()) {
      const sub = path.join(dir, name);
      const jobFile = path.join(sub, 'job.json');
      if (!existsSync(jobFile)) continue;
      jobs.push({ ...JSON.parse(readFileSync(jobFile, 'utf8')), suites: readSuites(sub) });
    }
  }
  // Jobs that never uploaded a record (cancelled, runner lost, failed before the first step).
  for (const [id, need] of Object.entries(needs)) {
    if (id === 'checks') continue; // matrix legs report individually
    // Matrix legs label themselves `<job>-<leg>` (integration-domain, integration-transcription).
    if (!jobs.some((j) => j.job === id || j.job.startsWith(`${id}-`))) jobs.push({ job: id, title: id, status: need.result, suites: [], missing: true });
  }
  const order = (j) => (j.job.startsWith('checks-') ? 1 : 0);
  jobs.sort((a, b) => order(a) - order(b) || (b.finished - b.started || 0) - (a.finished - a.started || 0));

  const icon = (s) => ({ success: '✅', passed: '✅', failure: '❌', failed: '❌', cancelled: '⏹️', skipped: '⏭️' })[s] ?? '⚠️';
  const timed = jobs.filter((j) => j.started && j.finished);
  const wall = timed.length ? Math.max(...timed.map((j) => j.finished)) - Math.min(...timed.map((j) => j.started)) : null;
  const longest = timed.reduce((a, j) => (!a || j.finished - j.started > a.finished - a.started ? j : a), null);
  const bad = jobs.filter((j) => j.status !== 'success');
  const out = [];
  out.push(
    bad.length
      ? `## ❌ CI: ${bad.length} of ${jobs.length} jobs did not pass`
      : `## ✅ CI: all ${jobs.length} jobs passed${wall ? ` in ${duration(wall)}` : ''}`,
    '',
  );
  if (wall) out.push(`Wall clock from first job start to last job end: **${duration(wall)}**; longest job: **${longest.title}** (${duration(longest.finished - longest.started)}). Queue time is not included.`, '');

  const failures = jobs.flatMap((j) => j.suites.filter((s) => s.status !== 'passed').map((s) => ({ j, s })));
  if (failures.length || bad.length) {
    out.push('### What failed', '');
    for (const { j, s } of failures) {
      const f = s.failures?.[0];
      const where = f?.file ? ` at \`${f.file}${f.line ? `:${f.line}` : ''}\`` : '';
      const what = f ? `${f.test ? `**${f.test}**: ` : ''}${f.message.split('\n')[0].slice(0, 200).replace(/\.+$/, '')}` : 'see the job summary below';
      out.push(`- ❌ **${j.title}** → ${s.title}${where} — ${what}. Evidence: artifact \`failure-${j.job}\`, log \`${s.log}\`.`);
    }
    for (const j of bad.filter((j) => !failures.some((f) => f.j === j))) {
      out.push(`- ${icon(j.status)} **${j.title}**: ${j.status}${j.missing ? ' (no result record: cancelled, timed out or failed before its first step)' : ' in a setup step (no test suite failed): open the job and find the first red step'}.`);
    }
    out.push('', 'Each failed suite also has its own section on this page (from its job) with the assertion, the location, the re-run command and the last log lines.', '');
  }

  out.push('### Jobs', '', '| Job | Result | Duration | Setup¹ | Suites | Cache² |', '|---|---|---:|---:|---|---|');
  for (const j of jobs) {
    const total = j.started && j.finished ? j.finished - j.started : null;
    const suiteTime = j.suites.reduce((n, s) => n + s.seconds, 0);
    const setup = total != null && j.suites.length ? Math.max(0, total - suiteTime) : null;
    const suites = j.suites.map((s) => `${s.status === 'passed' ? '' : '❌ '}${s.id} ${duration(s.seconds)}`).join(' · ') || '—';
    const cache = Object.entries(j.cache ?? {}).map(([k, v]) => `${k} ${v === 'true' ? 'hit' : 'miss'}`).join(', ') || '—';
    out.push(`| ${j.title} | ${icon(j.status)} | ${total != null ? duration(total) : '—'} | ${setup != null ? duration(setup) : '—'} | ${suites} | ${cache} |`);
  }
  out.push('', '¹ Job time outside the test suites: checkout, cache restore, npm ci, Playwright, fixtures and uploads.', '² Exact-key cache restore per job (`miss` on the first run of a new lockfile/Playwright version; the job then saves it).', '');
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, out.join('\n') + '\n');
  else console.log(out.join('\n'));

  const gateFailed = gated.filter((id) => needs[id]?.result !== 'success');
  for (const id of gateFailed) console.log(`::error title=integration-browser gate::Required job '${id}' finished with '${needs[id]?.result ?? 'missing'}'. See the CI overview in the run summary.`);
  process.exit(gateFailed.length ? 1 : 0);
}

console.error('usage: summary.mjs job | overview <dir>');
process.exit(2);

function readSuites(d) {
  const file = path.join(d, 'results.jsonl');
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}
