// @vitest-environment node
import { test,expect } from 'vitest';
import { options,evaluate } from '../scripts/eval-transcription';
import { estimatedCost,priceTable } from '../server/transcription-cost';
test('paid mode refuses without explicit confirmation, key or under CI',()=>{const old=process.env.CI;process.env.CI='1';try{expect(()=>options(['--confirm-paid'])).toThrow('forbidden in CI');expect(options(['--dry-run']).dry).toBe(true);}finally{if(old===undefined)delete process.env.CI;else process.env.CI=old;}});
test('prices must be finite and nonnegative; unknown is not free',()=>{expect(estimatedCost('missing',{},{})).toBeNull();expect(estimatedCost('model',{inputTokens:1e6,outputTokens:1e6},priceTable('{"model":{"input":2,"output":8}}'))).toBe(10);expect(()=>priceTable('{"m":{"input":-1,"output":0}}')).toThrow();});
test('offline replay runs renderer, real provider parser, assembly and musical comparison',async()=>{const report=await evaluate(['--dry-run','--limit','1','--out','.transcription-tmp/eval-test.json']);expect(report.jobs).toHaveLength(1);expect(report.jobs[0].accuracy.metrics.notes.f1).toBe(1);expect(report.jobs[0].pages).toHaveLength(2);expect(report.jobs[0].validation.structurallyValid).toBe(true);},60000);
