// Read-only preview; no send mode. --at permits reviewing the next delivery window.
import pool from '../config/database.js';
import { runSchoolClosureNotifications } from '../services/schoolClosureNotification.service.js';
const at = process.argv.find(arg => arg.startsWith('--at='))?.slice(5);
const now = at ? new Date(at) : new Date();
try {
  if (!Number.isFinite(now.getTime())) throw new Error('Use --at=<ISO timestamp>');
  console.log(JSON.stringify(await runSchoolClosureNotifications({ now, dryRun: true }), null, 2));
} finally { await pool.end(); }
