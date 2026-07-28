/**
 * Correct auto clock-out payroll rows when the employee kiosk sheet shows an
 * earlier checkout than the auto-generated punch/claim time.
 *
 * Usage:
 *   node backend/src/scripts/repair-payroll-from-employee-sheet-checkout.mjs
 *   node backend/src/scripts/repair-payroll-from-employee-sheet-checkout.mjs --apply
 *   node backend/src/scripts/repair-payroll-from-employee-sheet-checkout.mjs --apply --since=2025-07-01
 */
import pool from '../config/database.js';
import { updateEventTimeSubmission } from '../services/eventPayrollSubmissions.service.js';

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const sinceArg = [...args].find((a) => a.startsWith('--since='));
const sinceDate = sinceArg ? sinceArg.split('=')[1] : '2025-07-01';

function parseIso(raw) {
  if (!raw) return null;
  const dt = new Date(raw);
  return Number.isFinite(dt.getTime()) ? dt : null;
}

async function main() {
  const [rows] = await pool.execute(
    `SELECT DISTINCT
       ptc.agency_id,
       ptc.user_id,
       ptc.claim_date,
       JSON_UNQUOTE(JSON_EXTRACT(ptc.payload_json, '$.kioskPunchInId')) AS punch_in_id,
       JSON_UNQUOTE(JSON_EXTRACT(ptc.payload_json, '$.companyEventId')) AS event_id,
       JSON_UNQUOTE(JSON_EXTRACT(ptc.payload_json, '$.clockOutAt')) AS claim_clock_out,
       JSON_UNQUOTE(JSON_EXTRACT(ptc.payload_json, '$.source')) AS punch_source
     FROM payroll_time_claims ptc
     WHERE ptc.claim_type = 'skill_builder_event'
       AND ptc.status IN ('submitted', 'deferred')
       AND ptc.claim_date >= ?
       AND (
         JSON_UNQUOTE(JSON_EXTRACT(ptc.payload_json, '$.source')) = 'auto_all_clients_out'
         OR JSON_EXTRACT(ptc.payload_json, '$.needsVerification') = true
       )
     ORDER BY ptc.claim_date ASC, ptc.user_id ASC`,
    [sinceDate]
  );

  const seen = new Set();
  const repairs = [];

  for (const row of rows || []) {
    const punchInId = Number(row.punch_in_id);
    const eventId = Number(row.event_id);
    const userId = Number(row.user_id);
    const key = `${row.agency_id}:${punchInId}`;
    if (!punchInId || !eventId || !userId || seen.has(key)) continue;
    seen.add(key);

    const claimClockOut = parseIso(row.claim_clock_out);
    if (!claimClockOut) continue;

    const [sheetRows] = await pool.execute(
      `SELECT checked_out_at
       FROM event_day_kiosk_checkins
       WHERE company_event_id = ?
         AND user_id = ?
         AND kiosk_date = ?
         AND person_type = 'employee'
         AND action = 'check_out'
         AND checked_out_at IS NOT NULL
       ORDER BY checked_out_at ASC
       LIMIT 1`,
      [eventId, userId, row.claim_date]
    );
    const sheetClockOut = parseIso(sheetRows?.[0]?.checked_out_at);
    if (!sheetClockOut || sheetClockOut >= claimClockOut) continue;

    repairs.push({
      agencyId: Number(row.agency_id),
      punchInId,
      eventId,
      userId,
      claimDate: row.claim_date,
      from: claimClockOut.toISOString(),
      to: sheetClockOut.toISOString(),
      source: row.punch_source
    });
  }

  if (!repairs.length) {
    console.log('No auto payroll rows with earlier employee sheet checkout found.');
    await pool.end();
    return;
  }

  console.log(`${apply ? 'Applying' : 'Dry run —'} ${repairs.length} correction(s) since ${sinceDate}:`);
  for (const r of repairs) {
    console.log(
      `  user ${r.userId} event ${r.eventId} ${r.claimDate}: ${r.from} → ${r.to} (was ${r.source})`
    );
    if (apply) {
      // eslint-disable-next-line no-await-in-loop
      const result = await updateEventTimeSubmission({
        agencyId: r.agencyId,
        punchInId: r.punchInId,
        clockOutAt: r.to,
        editedBy: { role: 'payroll' }
      });
      if (result?.error) {
        console.error(`    FAILED: ${result.error.message}`);
      }
    }
  }

  if (!apply) {
    console.log('\nRe-run with --apply to update punches and claims.');
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
