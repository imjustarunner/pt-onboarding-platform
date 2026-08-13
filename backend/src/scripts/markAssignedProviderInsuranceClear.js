/**
 * Mark insurance/eligibility clear for assigned-provider clients whose agency
 * action is currently Insurance check.
 *
 * Dry run (default):
 *   node backend/src/scripts/markAssignedProviderInsuranceClear.js
 * Apply:
 *   CONFIRM=1 node backend/src/scripts/markAssignedProviderInsuranceClear.js
 * Optional: BACKFILL_AGENCY_ID=2
 */
import { markInsuranceOkForAssignedProviders } from '../services/clientYearDisposition.service.js';

async function run() {
  const confirm = String(process.env.CONFIRM || '').trim() === '1';
  const agencyId = process.env.BACKFILL_AGENCY_ID
    ? Number(process.env.BACKFILL_AGENCY_ID)
    : null;
  const result = await markInsuranceOkForAssignedProviders({
    actorUserId: 501,
    agencyId: Number.isFinite(agencyId) && agencyId > 0 ? agencyId : null,
    dryRun: !confirm
  });
  console.log(confirm ? 'Applied' : 'Dry run (CONFIRM=1 to apply)', result);
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
