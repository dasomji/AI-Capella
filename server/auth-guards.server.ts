import { createHash } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { pool } from './db/index.server';
const requesters = new AsyncLocalStorage<string>();
export function withMailRequester<T>(ip: string, run: () => T): T { return requesters.run(ip, run); }
/** Per kind cooldown, generous recipient ceiling and a smaller requester share.
 * Only delivered mail consumes budgets; repeated suppressed requests cannot extend cooldown. */
export async function allowAccountMail(email:string, kind:'verify'|'reset', request?:Request) {
  const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
  const key='account-mail:'+digest(email.trim().toLowerCase())+':'+kind;
  const ip=request?.headers.get('x-lightscore-socket-ip') ?? requesters.getStore() ?? 'internal';
  const budgets = [[key+':interval',60000,1],[key+':day',86400000,100],[key+':ip:'+digest(ip),86400000,5]] as const;
  const db=await pool.connect();
  try {
    await db.query('begin');
    await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[key]);
    const now=Date.now();
    for(const [budget,window,max] of budgets){
      const row=(await db.query('select count,last_request from rate_limit where key=$1',[budget])).rows[0];
      if(row && Number(row.last_request)>now-window && row.count>=max){
        await db.query('rollback');
        console.info(JSON.stringify({timestamp:new Date().toISOString(),level:'info',event:'auth.mail_suppressed',kind,reason:budget.endsWith(':interval')?'interval':budget.endsWith(':day')?'recipient_daily':'requester_share'}));
        return false;
      }
    }
    for(const [budget,window] of budgets) await db.query(`insert into rate_limit(key,count,last_request) values($1,1,$2) on conflict(key) do update set count=case when rate_limit.last_request <= $2-$3 then 1 else rate_limit.count+1 end,last_request=case when rate_limit.last_request <= $2-$3 then $2 else rate_limit.last_request end`,[budget,now,window]);
    await db.query('commit');return true;
  } catch(error){await db.query('rollback');throw error;} finally{db.release();}
}
