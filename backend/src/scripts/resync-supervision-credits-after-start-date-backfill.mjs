/**
 * Re-apply finalized session hour credits after start-date backfill or parsing fix.
 * Skips payroll rebuild — run after migration 1314 or when normalizeSupervisionStartDateYmd ships.
 *
 * Usage: node backend/src/scripts/resync-supervision-credits-after-start-date-backfill.mjs
 *        node backend/src/scripts/resync-supervision-credits-after-start-date-backfill.mjs --with-payroll
 */
import pool from '../config/database.js';
import { resyncFinalizedSessionHourCreditsForUser } from '../services/supervisionFinalizePipeline.service.js';
import {
  accruePrelicensedSupervisionFromPayroll,
  recomputeSupervisionAccountForUser
} from '../services/supervision.service.js';

const withPayroll = process.argv.includes('--with-payroll');

async function listAffectedMemberships() {
  const [rows] = await pool.execute(
    `SELECT DISTINCT ua.agency_id, ua.user_id
     FROM user_agencies ua
     WHERE ua.supervision_is_prelicensed = 1
       AND ua.supervision_start_date IS NOT NULL
       AND (
         EXISTS (
           SELECT 1
           FROM supervision_session_hour_credits sshc
           WHERE sshc.agency_id = ua.agency_id
             AND sshc.user_id = ua.user_id
         )
         OR EXISTS (
           SELECT 1
           FROM payroll_import_rows pir
           WHERE pir.agency_id = ua.agency_id
             AND pir.user_id = ua.user_id
             AND UPPER(TRIM(pir.service_code)) IN ('99414', '99415', '99416')
         )
       )`
  );
  return rows || [];
}

async function rebuildPayrollEntriesForUser({ agencyId, userId }) {
  await pool.execute(
    `DELETE FROM supervision_period_entries WHERE agency_id = ? AND user_id = ?`,
    [agencyId, userId]
  );
  const [periodRows] = await pool.execute(
    `SELECT pp.id
     FROM payroll_periods pp
     JOIN payroll_imports pi ON pi.payroll_period_id = pp.id
     WHERE pp.agency_id = ?
     GROUP BY pp.id
     ORDER BY MAX(pp.period_end) DESC
     LIMIT 24`,
    [agencyId]
  );
  for (const pr of periodRows || []) {
    // eslint-disable-next-line no-await-in-loop
    await accruePrelicensedSupervisionFromPayroll({
      agencyId,
      payrollPeriodId: Number(pr.id),
      uploadedByUserId: null
    });
  }
}

async function main() {
  const memberships = await listAffectedMemberships();
  console.log(
    `Resyncing supervision credits for ${memberships.length} user/agency pair(s)${withPayroll ? ' (with payroll rebuild)' : ''}...`
  );

  let resynced = 0;
  for (const row of memberships) {
    const agencyId = Number(row.agency_id);
    const userId = Number(row.user_id);
    if (!agencyId || !userId) continue;

    // eslint-disable-next-line no-await-in-loop
    const result = await resyncFinalizedSessionHourCreditsForUser({
      agencyId,
      userId,
      actorUserId: null
    });
    if (withPayroll) {
      // eslint-disable-next-line no-await-in-loop
      await rebuildPayrollEntriesForUser({ agencyId, userId });
    }
    // eslint-disable-next-line no-await-in-loop
    await recomputeSupervisionAccountForUser({ agencyId, userId });

    resynced += 1;
    console.log(
      `  agency=${agencyId} user=${userId} sessions=${result?.sessionCount ?? 0} resynced=${result?.resynced ?? 0}`
    );
  }

  console.log(`Done. Processed ${resynced} membership(s).`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
