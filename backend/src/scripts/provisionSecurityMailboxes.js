import pool from '../config/database.js';
import { provisionSecurityMailbox, securityMailboxAgencies } from '../services/securityMailbox.service.js';

// Dry-run by default. Uses the existing Workspace app-group owner/manager policy.
try {
  const apply = process.argv.includes('--apply');
  const selected = process.argv.filter(value => value.startsWith('--agency-id=')).map(value => Number(value.split('=')[1]));
  if (apply && (!selected.length || selected.some(id => !Number.isSafeInteger(id) || id <= 0))) throw new Error('Applying requires explicit --agency-id=<id> selections.');
  for (const agency of (await securityMailboxAgencies()).filter(row => !selected.length || selected.includes(Number(row.id)))) {
    try { console.log(JSON.stringify(await provisionSecurityMailbox(agency, { apply }))); }
    catch (error) { console.error(JSON.stringify({ agencyId: agency.id, error: error.message })); process.exitCode = 1; }
  }
} finally { await pool.end(); }
