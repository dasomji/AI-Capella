// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const script = path.resolve('scripts/ci/summary.mjs');
const dirs: string[] = [];

function records(jobs: Array<{ job: string; status: string }>) {
  const dir = mkdtempSync(path.join(tmpdir(), 'ci-summary-'));
  dirs.push(dir);
  jobs.forEach((j, i) => {
    mkdirSync(path.join(dir, String(i)));
    writeFileSync(path.join(dir, String(i), 'job.json'), JSON.stringify({ ...j, title: j.job, started: 1, finished: 2 + i }));
  });
  return dir;
}

function overview(dir: string, needs: Record<string, { result: string }>) {
  const env = { ...process.env, NEEDS_JSON: JSON.stringify(needs), GATED_JOBS: Object.keys(needs).join(' ') };
  delete env.GITHUB_STEP_SUMMARY;
  return spawnSync(process.execPath, [script, 'overview', dir], { env, encoding: 'utf8' });
}

afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('CI overview for matrix jobs', () => {
  it('stays red when a failed matrix job has one passing leg and one leg without a record', () => {
    const run = overview(records([{ job: 'integration-domain', status: 'success' }]), { integration: { result: 'failure' } });
    expect(run.stdout).toContain('## ❌ CI: 1 of 2 jobs did not pass');
    expect(run.stdout).toContain('integration (leg without a result record)');
    expect(run.status).toBe(1);
  });

  it('reports green when every leg passed', () => {
    const run = overview(
      records([{ job: 'integration-domain', status: 'success' }, { job: 'integration-transcription', status: 'success' }]),
      { integration: { result: 'success' } },
    );
    expect(run.stdout).toContain('## ✅ CI: all 2 jobs passed');
    expect(run.status).toBe(0);
  });

  it('does not add a placeholder when an uploaded leg already shows the failure', () => {
    const run = overview(
      records([{ job: 'integration-domain', status: 'success' }, { job: 'integration-transcription', status: 'failure' }]),
      { integration: { result: 'failure' } },
    );
    expect(run.stdout).toContain('## ❌ CI: 1 of 2 jobs did not pass');
    expect(run.stdout).not.toContain('leg without a result record');
  });
});
