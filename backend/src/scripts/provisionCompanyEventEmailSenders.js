import pool from '../config/database.js';
import { provisionCompanyEventEmailSenders } from '../services/companyEventEmailProvisioning.service.js';

const args = process.argv.slice(2), allowed = /^(--apply|--dry-run|--agency-id=\d+|--domain=[a-z0-9.-]+)$/;
if (args.some(arg => !allowed.test(arg)) || args.includes('--apply') && args.includes('--dry-run')) {
  console.error('Usage: node backend/src/scripts/provisionCompanyEventEmailSenders.js [--dry-run | --apply] [--agency-id=ID] [--domain=DOMAIN]');
  process.exitCode = 1;
} else {
  try {
    const results = await provisionCompanyEventEmailSenders({ apply: args.includes('--apply'),
      agencyIds: args.filter(a => a.startsWith('--agency-id=')).map(a => Number(a.split('=')[1])),
      domain: args.find(a => a.startsWith('--domain='))?.split('=')[1] || null });
    console.log(JSON.stringify({ apply: args.includes('--apply'), results }, null, 2));
    if (results.some(r => r.status === 'blocked')) process.exitCode = 1;
  } catch (error) {
    console.error('Event sender setup failed:', error.code || 'SETUP_FAILED'); process.exitCode = 1;
  } finally { await pool.end(); }
}
