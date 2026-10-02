import pool from '../config/database.js';
import { backfillTaxIds } from '../services/taxIdBackfill.service.js';
try {
  console.log(JSON.stringify(await backfillTaxIds(pool, { apply: process.argv.includes('--apply') })));
} catch (error) {
  // Database exceptions can contain SQL parameters. Never print the exception.
  console.error(JSON.stringify({ error: 'Tax ID protection did not finish.', code: error.code || 'PROTECTION_FAILED' }));
  process.exitCode = 1;
} finally { await pool.end(); }
