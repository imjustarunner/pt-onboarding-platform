import pool from '../config/database.js';
import { auditExpiredOfficeAssignments } from '../services/officeAssignmentExpiry.service.js';
try {
  console.log(JSON.stringify(await auditExpiredOfficeAssignments({ apply: process.argv.includes('--apply') })));
} catch (error) {
  console.error(JSON.stringify({ error: 'Office assignment audit failed', code: error.code || 'AUDIT_FAILED' }));
  process.exitCode = 1;
} finally { await pool.end(); }
