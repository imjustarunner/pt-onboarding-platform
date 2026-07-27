/**
 * One-time backfill: school clients with no active provider/day assignment should be `pending`,
 * not `current` (the normal write-path now handles this going forward via setClientAssignedDay's
 * un-assign branch — see schoolSoftSchedule.controller.js `demoteClientToPendingIfNoActiveDay`).
 *
 * Only touches `client_type = 'school'` clients whose catalog status is `current` (or unset) and
 * who have zero active rows in `client_provider_assignments`. Never touches waitlist/terminated/
 * archived/already-pending clients.
 *
 * Usage (from repo root, dry run by default):
 *   node backend/src/scripts/backfillPendingClientsWithNoAssignedDay.js
 * Apply the changes:
 *   CONFIRM=1 node backend/src/scripts/backfillPendingClientsWithNoAssignedDay.js
 * Optional: BACKFILL_AGENCY_ID=123 to limit to one agency.
 */
import pool from '../config/database.js';
import Client from '../models/Client.model.js';
import ClientStatusHistory from '../models/ClientStatusHistory.model.js';
import { getClientStatusIdByKey } from '../utils/clientStatusCatalog.js';

async function main() {
  const confirm = String(process.env.CONFIRM || '').trim() === '1';
  const envAgency = process.env.BACKFILL_AGENCY_ID
    ? Number.parseInt(String(process.env.BACKFILL_AGENCY_ID), 10)
    : null;
  const agencyId = Number.isFinite(envAgency) && envAgency > 0 ? envAgency : null;

  const [rows] = await pool.execute(
    `SELECT c.id, c.agency_id, c.client_status_id, cs.status_key AS client_status_key,
            c.identifier_code, c.initials
     FROM clients c
     LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
     WHERE c.client_type = 'school'
       AND (c.status IS NULL OR UPPER(c.status) <> 'ARCHIVED')
       AND (cs.status_key IS NULL OR LOWER(cs.status_key) = 'current')
       AND (? IS NULL OR c.agency_id = ?)
       AND NOT EXISTS (
         SELECT 1 FROM client_provider_assignments cpa
         WHERE cpa.client_id = c.id AND cpa.is_active = TRUE
       )`,
    [agencyId, agencyId]
  );

  console.log(`Found ${rows.length} school client(s) with no active assigned day.`);
  if (!confirm) {
    console.log('Dry run only — re-run with CONFIRM=1 to apply. Sample:');
    for (const r of rows.slice(0, 20)) {
      console.log(`  client #${r.id} (${r.identifier_code || r.initials || 'unknown'}) — status: ${r.client_status_key || '(none)'}`);
    }
    return;
  }

  const pendingStatusIdByAgency = new Map();
  let updated = 0;
  let skipped = 0;
  for (const r of rows) {
    const aId = Number(r.agency_id);
    if (!pendingStatusIdByAgency.has(aId)) {
      pendingStatusIdByAgency.set(aId, await getClientStatusIdByKey({ agencyId: aId, statusKey: 'pending' }));
    }
    const pendingStatusId = pendingStatusIdByAgency.get(aId);
    if (!pendingStatusId) {
      skipped++;
      continue;
    }
    await Client.update(r.id, { client_status_id: pendingStatusId }, null);
    await ClientStatusHistory.create({
      client_id: r.id,
      changed_by_user_id: null,
      field_changed: 'client_status_id',
      from_value: r.client_status_id ? String(r.client_status_id) : null,
      to_value: String(pendingStatusId),
      note: 'Backfill: auto-set to pending — no assigned day found'
    }).catch(() => {});
    updated++;
  }
  console.log(`Done. Updated ${updated}, skipped ${skipped} (no pending status configured for agency).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
