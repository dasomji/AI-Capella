import { createHash } from 'node:crypto';
import { pool } from './db/index.server';
/** All account-mail paths share recipient budgets, including internal Better Auth API calls. */
export async function allowAccountMail(email:string) {
  const key='account-mail:'+createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
  const db=await pool.connect();
  try {
    await db.query('begin');
    await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[key]);
    for(const [suffix,window,max] of [['hour',3600000,3],['day',86400000,10]] as const){
      const row=(await db.query('select count,last_request from rate_limit where key=$1',[key+suffix])).rows[0];
      if(row && Number(row.last_request)>Date.now()-window && row.count>=max){await db.query('rollback');return false;}
    }
    for(const [suffix,window] of [['hour',3600000],['day',86400000]] as const) await db.query(`insert into rate_limit(key,count,last_request) values($1,1,$2) on conflict(key) do update set count=case when rate_limit.last_request <= $2-$3 then 1 else rate_limit.count+1 end,last_request=case when rate_limit.last_request <= $2-$3 then $2 else rate_limit.last_request end`,[key+suffix,Date.now(),window]);
    await db.query('commit');return true;
  } catch(error){await db.query('rollback');throw error;} finally{db.release();}
}
