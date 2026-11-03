import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
await client.connect();
try {
  await client.query("select pg_advisory_lock(17031501)");
  await migrate(drizzle(client), { migrationsFolder: './drizzle' });
} finally { await client.end(); }
