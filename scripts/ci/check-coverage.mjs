#!/usr/bin/env node
// Guards the CI split against silently dropping coverage.
// 1. `npm run test:browser` without BROWSER_SCRIPT runs a fixed sequence of browser scripts
//    (scripts/browser-isolated.mjs). CI runs each of them as its own BROWSER_SCRIPT, in separate
//    jobs; every script of that sequence must appear in the workflow.
// 2. Every `test*` / `check:*` npm script must be run by the workflow or be listed below with a
//    reason it is not part of CI.
import { readFileSync } from 'node:fs';

const workflowFile = process.argv[2] ?? '.github/workflows/deploy.yml';
const workflow = readFileSync(workflowFile, 'utf8');
const harness = readFileSync('scripts/browser-isolated.mjs', 'utf8');
const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts;

const NOT_IN_CI = {
  'test:browser:foundation': 'needs an already running built server (BROWSER_BASE); manual verification suite',
  'test:browser:design-parity': 'compares against the prototype checkout; manual parity evidence',
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
if (problems.length) {
  for (const p of problems) console.log(`::error file=${workflowFile},title=CI coverage::${p}`);
  process.exit(1);
}
console.log(`CI coverage OK: ${defaults.length} default browser scripts and all test/check npm scripts are run (${Object.keys(NOT_IN_CI).length} documented exceptions).`);
