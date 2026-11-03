import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from '../env.server';
import * as schema from './schema.server';
export const pool = new pg.Pool({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 5000 });
export const db = drizzle(pool, { schema });
