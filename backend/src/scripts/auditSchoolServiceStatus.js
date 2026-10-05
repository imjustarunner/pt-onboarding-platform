// Read-only by default. --apply reconciles only current-year service evidence.
import pool from '../config/database.js';
import ClientCompliancePromotionService from '../services/clientCompliancePromotion.service.js';
const agencyArg = process.argv.find(arg => arg.startsWith('--agency='));
const agencyId = agencyArg ? Number(agencyArg.split('=')[1]) : null;
try {
  if (agencyArg && (!Number.isInteger(agencyId) || agencyId <= 0)) throw new Error('Invalid --agency id');
  console.log(JSON.stringify(await ClientCompliancePromotionService.run({
    dryRun: !process.argv.includes('--apply'), agencyId
  }), null, 2));
} finally { await pool.end(); }
