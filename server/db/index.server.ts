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
