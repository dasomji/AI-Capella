#!/usr/bin/env node
// Guards the CI split against silently dropping coverage.
// 1. `npm run test:browser` without BROWSER_SCRIPT runs a fixed sequence of browser scripts
//    (scripts/browser-isolated.mjs). CI runs each of them as its own BROWSER_SCRIPT, in separate
//    jobs; every script of that sequence must appear in the workflow.
// 2. Every `test*` / `check:*` npm script must be run by the workflow or be listed below with a
//    reason it is not part of CI.
// 3. `npm run test:integration` runs in parallel legs, one per group of scripts/integration-groups.mjs;
//    the workflow's integration matrix must list exactly those groups.
import { readFileSync } from 'node:fs';
import { INTEGRATION_FILES, INTEGRATION_GROUPS } from '../integration-groups.mjs';

const workflowFile = process.argv[2] ?? '.github/workflows/deploy.yml';
const workflow = readFileSync(workflowFile, 'utf8');
const harness = readFileSync('scripts/browser-isolated.mjs', 'utf8');
const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts;

const NOT_IN_CI = {
  'test:browser:foundation': 'needs an already running built server (BROWSER_BASE); manual verification suite',
  'test:design-mutants': 'mutation proof of the design guard; manual, slow',
};

const problems = [];
const defaults = [...new Set(harness.match(/scripts\/browser-[\w-]+\.mjs/g) ?? [])];
if (defaults.length < 4) problems.push(`could not read the default browser sequence from scripts/browser-isolated.mjs (found ${defaults.join(', ') || 'nothing'})`);
const runs = (name) => new RegExp(`npm run ${name.replace(/[:.]/g, '\\$&')}(?![:\\w-])`).test(workflow);
for (const script of defaults) {
  const direct = new RegExp(`BROWSER_SCRIPT[=:]\\s*${script.replace(/[.]/g, '\\.')}\\b`).test(workflow);
  const viaNpm = Object.entries(scripts).some(([name, body]) => body.includes(`BROWSER_SCRIPT=${script} `) && runs(name));
  if (!direct && !viaNpm) {
    problems.push(`${script} is part of \`npm run test:browser\` but no CI step runs it (add a step with BROWSER_SCRIPT=${script})`);
  }
}
for (const name of Object.keys(scripts).filter((n) => /^(test|check)(:|$)/.test(n))) {
  if (NOT_IN_CI[name]) continue;
  const used = name === 'test' ? /\bnpm (run )?test(?![:\w-])/.test(workflow) : runs(name);
  if (!used) problems.push(`npm script "${name}" is not run by ${workflowFile}; run it in a job or add it to NOT_IN_CI in scripts/ci/check-coverage.mjs with a reason`);
}
const integrationJob = workflow.match(/\n  integration:\n([\s\S]*?)\n  [\w-]+:\n/)?.[1] ?? '';
const legs = [...integrationJob.matchAll(/-\s*\{\s*group:\s*([\w-]+)/g)].map((m) => m[1]);
if (!/npm run test:integration -- --group "\$GROUP"/.test(integrationJob)) problems.push('the integration job no longer runs `npm run test:integration -- --group "$GROUP"` per matrix leg');
for (const group of Object.keys(INTEGRATION_GROUPS)) {
  if (!legs.includes(group)) problems.push(`integration group "${group}" (${INTEGRATION_GROUPS[group].join(', ')}) has no leg in the integration job matrix`);
}
for (const leg of legs) if (!Object.hasOwn(INTEGRATION_GROUPS, leg)) problems.push(`integration matrix leg "${leg}" is not a group in scripts/integration-groups.mjs`);
if (new Set(legs).size !== legs.length) problems.push(`integration matrix lists a group more than once (${legs.join(', ')})`);
if (problems.length) {
  for (const p of problems) console.log(`::error file=${workflowFile},title=CI coverage::${p}`);
  process.exit(1);
}
console.log(`CI coverage OK: ${defaults.length} default browser scripts, all test/check npm scripts (${Object.keys(NOT_IN_CI).length} documented exceptions) and ${legs.length} integration legs covering ${INTEGRATION_FILES.length} files are run.`);
