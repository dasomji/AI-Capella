/** Mutations exist only in Vite/Vitest transforms, never in the working tree. */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const evidence=path.resolve(process.env.BROWSER_EVIDENCE??'.review-evidence/design-mutants');fs.mkdirSync(evidence,{recursive:true});
const unitCases={
  'dom-toast':['/src/design-system/dom/index.ts','attrs: p.toastPart(options.kind)','attrs: {}','compares normalized React and DOM specimen markup'],
  'dom-button':['/src/design-system/dom/index.ts','  updateButton(button, options);','  updateButton(button, options); button.classList.add("mutant-extra");','compares normalized React and DOM specimen markup'],
  tab:['/src/design-system/behavior/dialog.ts','if (event.key === "Tab")','if (false)','wraps Tab in both directions'],
  escape:['/src/design-system/behavior/dialog.ts','if (event.key === "Escape")','if (false)','wraps Tab in both directions'],
};
const results=[];
for(const [name,[file,from,to,test]] of Object.entries(unitCases)) {
 const config=path.join(evidence,`${name}.config.mjs`);
 fs.writeFileSync(config,`export default {root:${JSON.stringify(process.cwd())},plugins:[{name:'review-mutant',enforce:'pre',transform(code,id){if(!id.endsWith(${JSON.stringify(file)}))return;if(!code.includes(${JSON.stringify(from)}))throw Error('Mutant target changed');return code.replace(${JSON.stringify(from)},${JSON.stringify(to)});}}]};`);
 const run=spawnSync(process.execPath,['node_modules/vitest/vitest.mjs','run','tests/design-primitives.test.ts','--config',config,'-t',test],{encoding:'utf8'});
 fs.writeFileSync(path.join(evidence,name+'.log'),run.stdout+run.stderr);
 assert.notEqual(run.status,0,name+' must fail');
 assert.match(run.stdout+run.stderr,/AssertionError/,name+' must fail an assertion, not setup');
 results.push({name,caught:true,test});
}
for(const name of ['roll','staff']) {
 const run=spawnSync(process.execPath,['scripts/browser-renderer-themes.mjs'],{encoding:'utf8',env:{...process.env,P2_MUTANT:name,P2_MODES:name,BROWSER_EVIDENCE:path.join(evidence,name)}});
 fs.writeFileSync(path.join(evidence,name+'.log'),run.stdout+run.stderr);
 assert.notEqual(run.status,0,name+' cache revision mutation must fail');
 assert.match(run.stdout+run.stderr,/retained pixels differ from fresh target/,name+' must fail the retained/fresh pixel comparison');
 results.push({name,caught:true,test:'retained pixels equal fresh target after theme swap'});
}
const loud=spawnSync(process.execPath,['scripts/browser-theme-extension.mjs'],{encoding:'utf8',env:{...process.env,THEME_PROOF_MUTANT:'hardcoded',BROWSER_EVIDENCE:path.join(evidence,'hardcoded')}});
fs.writeFileSync(path.join(evidence,'hardcoded.log'),loud.stdout+loud.stderr);
assert.notEqual(loud.status,0,'Hard-coded button/heading color must fail');
assert.match(loud.stdout+loud.stderr,/loud-theme acceptance/);
results.push({name:'hardcoded',caught:true,test:'rendered loud-theme paint differs'});
const reset=spawnSync(process.execPath,['scripts/browser-theme-extension.mjs'],{encoding:'utf8',env:{...process.env,THEME_PROOF_MUTANT:'reset',BROWSER_EVIDENCE:path.join(evidence,'reset')}});
fs.writeFileSync(path.join(evidence,'reset.log'),reset.stdout+reset.stderr);
assert.notEqual(reset.status,0,'Lost reset inheritance must fail');
assert.match(reset.stdout+reset.stderr,/First-run landing invitation copy inherits centering/);
results.push({name:'reset',caught:true,test:'actual landing invitation copy inherits centered alignment'});
fs.writeFileSync(path.join(evidence,'results.json'),JSON.stringify(results,null,2));console.log('All final-review mutants caught',results);
