import { AsyncLocalStorage } from 'node:async_hooks';
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { logError } from "../logger.server";
import { env } from "../env.server";
import * as schema from "./schema.server";
const key = Symbol.for("lightscore.database");
const globals = globalThis as typeof globalThis & { [key]?: pg.Pool };
export const pool = (globals[key] ??= new pg.Pool({
  connectionString: env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
  statement_timeout: 30000,
  query_timeout: 35000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 5000,
  max: env.DB_POOL_MAX,
}));
if (pool.listenerCount("error") === 0)
  pool.on("error", (error) => logError("database.pool", error));
if (pool.listenerCount("connect") === 0)
  pool.on("connect", (client) =>
    client.on("error", (error) => logError("database.client", error)),
  );
export const db = drizzle(pool, { schema });

// Bound worker statements without imposing the deadline on admin/usage queries.
const workerContext=new AsyncLocalStorage<boolean>();
const workerPool=new pg.Pool({connectionString:env.DATABASE_URL,connectionTimeoutMillis:5000,query_timeout:5000,statement_timeout:5000,max:env.DB_POOL_MAX});
workerPool.on('error',error=>logError('database.worker',error));
export const workerQueries=<T>(work:()=>Promise<T>)=>workerContext.run(true,work);
const adminContext=new AsyncLocalStorage<boolean>();
const adminPool=new pg.Pool({connectionString:env.DATABASE_URL,connectionTimeoutMillis:5000,query_timeout:125000,statement_timeout:120000,max:2});
adminPool.on('error',error=>logError('database.admin',error));
export const adminQueries=<T>(work:()=>Promise<T>)=>adminContext.run(true,work);
const ordinaryQuery=pool.query.bind(pool);
pool.query=function(...args:any[]){return workerContext.getStore()?(workerPool.query as any)(...args):adminContext.getStore()?(adminPool.query as any)(...args):(ordinaryQuery as any)(...args);} as typeof pool.query;
const ordinaryEnd=pool.end.bind(pool);
pool.end=(async()=>{await adminPool.end();await workerPool.end();await ordinaryEnd();}) as typeof pool.end;
