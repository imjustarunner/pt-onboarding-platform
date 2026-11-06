// Explicit operator command. Dry-run by default. No communications are sent.
import pool from '../config/database.js';
import { listNarrivaClinicalAgencies, publishNarrivaServiceAmendment } from '../services/narrivaServicePublication.service.js';
const apply = process.argv.includes('--apply');
const actorArgument = process.argv.find(value => value.startsWith('--actor-user-id='));
const actorUserId = actorArgument ? Number(actorArgument.split('=')[1]) : null;
if (actorArgument && (!Number.isSafeInteger(actorUserId) || actorUserId < 1)) throw new Error('actor-user-id must be a positive user ID.');
try {
  for (const agency of await listNarrivaClinicalAgencies()) {
    console.log(JSON.stringify(await publishNarrivaServiceAmendment({agencyId:agency.id,actorUserId,apply})));
  }
} finally { await pool.end(); }
