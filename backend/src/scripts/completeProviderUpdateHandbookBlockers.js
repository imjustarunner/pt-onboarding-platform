import pool from '../config/database.js';
import {completeProviderUpdateAdministratively} from '../services/providerUpdateAdministrativeCompletion.service.js';

// Default is a read-only eligibility report. Requires explicit agency, push,
// administrator, recipient IDs and a reason even when used for a dry run.
const args = process.argv.slice(2);
const value = name => args[args.indexOf(name) + 1];
const options = {agencyId: Number(value('--agency-id')), pushId: Number(value('--push-id')), actorUserId: Number(value('--actor-user-id')), reason: value('--reason'), apply: args.includes('--apply')};
const ids = args.includes('--recipient-ids') ? value('--recipient-ids').split(',').map(Number) : [];
try {
  if (!ids.length || !args.includes('--reason')) throw Error('Specify --agency-id --push-id --actor-user-id --recipient-ids and --reason. Add --apply only after reviewing the dry run.');
  for (const recipientId of [...new Set(ids)]) {
    console.log(JSON.stringify(await completeProviderUpdateAdministratively({...options, recipientId})));
  }
} catch (error) {
  console.error(JSON.stringify({error: error.message, missing: error.missing}));
  process.exitCode = 1;
} finally { await pool.end(); }
process.exit(process.exitCode || 0);
