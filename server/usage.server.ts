import { pool } from './db/index.server';
import { env } from './env.server';
export function usageRange(from:string,to:string){
 const explicit=/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/;
 if(!explicit.test(from)||!explicit.test(to)||!Number.isFinite(Date.parse(from))||!Number.isFinite(Date.parse(to))||Date.parse(from)>=Date.parse(to))throw Error('Expected from < to as ISO instants with explicit offsets');
 return [new Date(from),new Date(to)] as const;
}
/** Dates are calendar labels in the centrally configured zone; instants are filtered [from,to). */
export const usageSQL=`select to_char(c.started_at at time zone $3,'YYYY-MM-DD') as day,
 c.model,c.prompt_version,j.ensemble_id,c.outcome,count(*)::int as calls,
 count(*) filter(where c.attempt>1)::int as retries,
 coalesce(sum((c.usage->>'inputTokens')::numeric),0) as input_tokens,
 coalesce(sum((c.usage->>'outputTokens')::numeric),0) as output_tokens,
 count(*) filter(where c.usage is null or c.usage->>'inputTokens' is null)::int as unknown_usage_calls,
 percentile_cont(0.5) within group(order by extract(epoch from(c.finished_at-c.started_at))*1000) as latency_p50_ms,
 percentile_cont(0.95) within group(order by extract(epoch from(c.finished_at-c.started_at))*1000) as latency_p95_ms,
 count(distinct c.page_id)::int as pages,count(distinct c.job_id)::int as jobs,
 case when count(*) filter(where c.estimated_cost is null)>0 then null else sum(c.estimated_cost::text::numeric) end as estimated_cost_usd,
 count(*) filter(where c.estimated_cost is null)::int as unpriced_calls,
 case when count(*) filter(where c.estimated_cost is null)>0 then null else sum(c.estimated_cost::text::numeric)/nullif(count(distinct c.page_id),0) end as estimated_cost_per_page_usd,
 case when count(*) filter(where c.estimated_cost is null)>0 then null else sum(c.estimated_cost::text::numeric)/nullif(count(distinct c.job_id),0) end as estimated_cost_per_job_usd
 from provider_calls c join transcription_jobs j on j.id=c.job_id
 where c.started_at >= $1 and c.started_at < $2
 group by day,c.model,c.prompt_version,j.ensemble_id,c.outcome order by day,c.model,c.prompt_version,j.ensemble_id,c.outcome`;
export async function transcriptionUsage(from:string,to:string){const range=usageRange(from,to);return {timeZone:env.APP_TIME_ZONE,currency:'USD',range:'[from,to)',groups:(await pool.query(usageSQL,[...range,env.APP_TIME_ZONE])).rows};}
