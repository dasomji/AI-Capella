// @vitest-environment node
import { test,expect,vi } from 'vitest';
vi.mock('../server/db/index.server',()=>({pool:{query:vi.fn(async()=>({rows:[]}))}}));
vi.mock('../server/env.server',()=>({env:{APP_TIME_ZONE:'America/New_York'}}));
import { usageRange,transcriptionUsage,usageSQL } from '../server/usage.server';
import { pool } from '../server/db/index.server';
test('spring and fall DST days use explicit half-open instants, not 24 hour arithmetic',async()=>{
 const [a,b]=usageRange('2026-03-08T00:00:00-05:00','2026-03-09T00:00:00-04:00');expect(b.getTime()-a.getTime()).toBe(23*3600000);
 const [c,d]=usageRange('2026-11-01T00:00:00-04:00','2026-11-02T00:00:00-05:00');expect(d.getTime()-c.getTime()).toBe(25*3600000);
 const r=await transcriptionUsage('2026-11-01T00:00:00-04:00','2026-11-02T00:00:00-05:00');expect(r.timeZone).toBe('America/New_York');expect(pool.query).toHaveBeenCalledWith(usageSQL,[c,d,'America/New_York']);expect(usageSQL).toContain('c.started_at >= $1 and c.started_at < $2');expect(usageSQL).toContain('at time zone $3');
});
test('rejects naive, invalid, empty and reversed ranges',()=>{for(const args of [['2026-11-01','2026-11-02'],['badZ','badZ'],['2026-11-01T00:00:00Z','2026-11-01T00:00:00Z']])expect(()=>usageRange(args[0],args[1])).toThrow();});

test('usage groups expose operator account failures and explicitly unknown usage',()=>{
 expect(usageSQL).toContain('c.error_kind');expect(usageSQL).toContain("c.usage->>'usage_unknown'='true'");
});

test('rejects normalized impossible dates and excessive ranges',()=>{for(const a of ['2026-02-30T00:00:00Z','2026-04-31T00:00:00Z','2026-01-01T24:00:00Z'])expect(()=>usageRange(a,'2026-12-01T00:00:00Z')).toThrow();expect(()=>usageRange('2025-01-01T00:00:00Z','2026-02-01T00:00:00Z')).toThrow('366');});
test('response aggregates are numeric and null costs stay null',async()=>{vi.mocked(pool.query).mockResolvedValueOnce({rows:[{day:'2026-11-01',model:'m',calls:2,input_tokens:'20',known_cost_usd:'0.25',estimated_cost_usd:null,unpriced_calls:1}]} as any);const r=await transcriptionUsage('2026-11-01T00:00:00Z','2026-11-02T00:00:00Z');expect(r.groups[0].known_cost_usd).toBe(.25);expect(r.groups[0].input_tokens).toBe(20);expect(r.groups[0].estimated_cost_usd).toBeNull();});
