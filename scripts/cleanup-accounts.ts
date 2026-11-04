import { cleanupUnverifiedAccounts } from '../server/cleanup.server';
import { pool } from '../server/db/index.server';
try { console.log(JSON.stringify({ timestamp: new Date().toISOString(), deleted: await cleanupUnverifiedAccounts() })); } finally { await pool.end(); }
