// Verifies Google events and recipient routing without sending or creating jobs.
import pool from '../config/database.js';
import { runSchoolVisitReminders } from '../services/schoolVisitReminder.service.js';
try { console.log(JSON.stringify(await runSchoolVisitReminders({ dryRun: true, sendUpcoming: process.argv.includes('--upcoming') }), null, 2)); }
finally { await pool.end(); }
