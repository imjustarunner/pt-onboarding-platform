// Schedule as a Cloud Run Job when the web service has request-based CPU.
import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import { runBankFeedSync } from '../services/bankFeed.service.js';
try {
  const results = await runBankFeedSync();
  console.log(JSON.stringify({ accounts: results.length, imported: results.reduce((n, r) => n + (r.imported || 0), 0), needsReview: results.filter(r => r.needsReview).length }));
} catch {
  console.error('Bank import could not complete; check configuration and migrations.');
  process.exitCode = 1;
} finally { await pool.end(); await clinicalPool.end(); }
