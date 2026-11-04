// @vitest-environment node
import { test,expect,vi,afterAll } from 'vitest';
import { mkdtemp,mkdir,rm } from 'node:fs/promises';
await mkdir('.transcription-tmp',{recursive:true});
const testRoot=await mkdtemp('.transcription-tmp/eval-unit-');
afterAll(()=>rm(testRoot,{recursive:true,force:true}));
import { options,evaluate } from '../scripts/eval-transcription';
import { estimatedCost,priceTable } from '../server/transcription-cost';
test('paid mode refuses without explicit confirmation, key or under CI',()=>{const old=process.env.CI;process.env.CI='1';try{expect(()=>options(['--confirm-paid'])).toThrow('forbidden in CI');expect(options(['--dry-run']).dry).toBe(true);}finally{if(old===undefined)delete process.env.CI;else process.env.CI=old;}});
test('prices must be finite and nonnegative; unknown is not free',()=>{expect(estimatedCost('missing',{},{})).toBeNull();expect(estimatedCost('model',{inputTokens:1e6,outputTokens:1e6},priceTable('{"model":{"input":2,"output":8}}'))).toBe(10);expect(()=>priceTable('{"m":{"input":-1,"output":0}}')).toThrow();});
test('offline replay runs renderer, real provider parser, assembly and musical comparison',async()=>{const report=await evaluate(['--dry-run','--limit','1','--out',testRoot+'/eval-test.json']);expect(report.jobs).toHaveLength(1);expect(report.jobs[0].accuracy.metrics.notes.f1).toBe(1);expect(report.jobs[0].pages).toHaveLength(2);expect(report.jobs[0].validation.structurallyValid).toBe(true);},60000);

for(const branch of ['no key','no confirmation','CI','unknown option'])test('real refusal: '+branch,()=>{
 vi.stubEnv('CI','');vi.stubEnv('OPENAI_API_KEY','fake-refusal-test');let args=['--confirm-paid'];
 if(branch==='no key')vi.stubEnv('OPENAI_API_KEY','');if(branch==='no confirmation')args=[];if(branch==='CI')vi.stubEnv('CI','1');if(branch==='unknown option')args.push('--unknown');
 try{expect(()=>options(args)).toThrow();}finally{vi.unstubAllEnvs();}
});
test('failed page comparison is checkpointed and next job continues',async()=>{
 const {mkdir,readFile,writeFile}=await import('node:fs/promises');const {resolve}=await import('node:path');const dir=resolve(testRoot,'comparison-failure');await mkdir(dir+'/one',{recursive:true});await mkdir(dir+'/two',{recursive:true});
 const original=JSON.parse(await readFile('eval/fixtures/band/manifest.json','utf8'));
 for(const [index,name] of ['one','two'].entries()){const m=structuredClone(original);m.id=name;for(const p of m.pages){for(const key of ['source','reference','recordedRaster']){const file=resolve('eval/fixtures/band',p[key]);const dest=name+'-'+p[key];await writeFile(dir+'/'+name+'/'+dest,await readFile(file));p[key]=dest;}}if(index===0)await writeFile(dir+'/'+name+'/'+m.pages[0].reference,'<bad');await writeFile(dir+'/'+name+'/manifest.json',JSON.stringify(m));await writeFile(dir+'/'+name+'/'+m.reference,await readFile('eval/fixtures/band/reference.musicxml'));}
 await mkdir(dir+'/three',{recursive:true});await writeFile(dir+'/three/manifest.json','{malformed');
 const r=await evaluate(['--dry-run','--set',dir,'--out',dir+'/report.json']);expect(r.jobs).toHaveLength(3);expect(r.jobs[0].pages[0].outcome).toBe('comparison_failed');expect(r.jobs[1].outcome).toBe('job_failed');expect(r.jobs[2].outcome).toBe('completed');const lines=(await readFile(dir+'/report.json.jsonl','utf8')).trim().split('\n').map(JSON.parse as any);expect(lines.map((l:any)=>l.type)).toEqual(['job','job','job','summary']);
},60000);

test('sorted limit selects distinct photo inputs and labels all replay costs synthetic',async()=>{const {BoundedPageRenderer}=await import('../server/page-renderer.server');const spy=vi.spyOn(BoundedPageRenderer.prototype,'render');try{const r=await evaluate(['--dry-run','--limit','2','--out',testRoot+'/photo-replay.json']);expect(r.jobs.map(j=>j.id)).toEqual(['band','band-photos']);expect(spy.mock.calls.some(([input])=>input.contentType==='image/jpeg'&&input.objectKey.endsWith('photo-1.jpg'))).toBe(true);expect(r.jobs.every(j=>j.costBasis==='synthetic'&&j.pages.every((p:any)=>p.costBasis==='synthetic'))).toBe(true);}finally{spy.mockRestore();}},60000);
