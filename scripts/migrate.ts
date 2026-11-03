import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from '../server/db/index.server';
try { await migrate(db, { migrationsFolder: './drizzle' }); } finally { await pool.end(); }
