/**
 * Fall 2026 backfill: school+provider clients created/submitted before 2026-07-01
 * - No real weekday (NULL / blank / Unknown CPA) → pending
 * - Has weekday → current
 *
 * Usage (from repo root, dry run by default):
 *   node backend/src/scripts/backfillFallPendingReturningSchoolClients.js
 * Apply:
 *   CONFIRM=1 node backend/src/scripts/backfillFallPendingReturningSchoolClients.js
 * Optional: BACKFILL_AGENCY_ID=123
 */
import pool from '../config/database.js';
import Client from '../models/Client.model.js';
import ClientStatusHistory from '../models/ClientStatusHistory.model.js';
import { getClientStatusIdByKey } from '../utils/clientStatusCatalog.js';

const CUTOFF = '2026-07-01';
const WEEKDAYS = new Set(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);

function hasWeekday(serviceDayCsv) {
  const parts = String(serviceDayCsv || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.some((d) => WEEKDAYS.has(d));
}

async function main() {
  const confirm = String(process.env.CONFIRM || '').trim() === '1';
  const envAgency = process.env.BACKFILL_AGENCY_ID
    ? Number.parseInt(String(process.env.BACKFILL_AGENCY_ID), 10)
    : null;
  const agencyId = Number.isFinite(envAgency) && envAgency > 0 ? envAgency : null;

  const [rows] = await pool.execute(
    `SELECT
       c.id,
       c.agency_id,
       c.client_status_id,
       cs.status_key AS client_status_key,
       c.identifier_code,
       c.initials,
       c.submission_date,
       c.created_at,
       c.provider_id,
       (
         SELECT GROUP_CONCAT(DISTINCT cpa.service_day SEPARATOR ',')
         FROM client_provider_assignments cpa
         WHERE cpa.client_id = c.id AND cpa.is_active = TRUE
       ) AS service_days,
       (
         SELECT COUNT(*)
         FROM client_provider_assignments cpa
         WHERE cpa.client_id = c.id AND cpa.is_active = TRUE
       ) AS active_cpa_count
     FROM clients c
     LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
     WHERE c.client_type = 'school'
       AND (c.status IS NULL OR UPPER(c.status) <> 'ARCHIVED')
       AND (cs.status_key IS NULL OR LOWER(cs.status_key) NOT IN ('waitlist', 'terminated', 'archived'))
       AND (
         (c.submission_date IS NOT NULL AND DATE(c.submission_date) < ?)
         OR (c.submission_date IS NULL AND DATE(c.created_at) < ?)
       )
       AND (
         c.provider_id IS NOT NULL
         OR EXISTS (
           SELECT 1 FROM client_provider_assignments cpa0
           WHERE cpa0.client_id = c.id AND cpa0.is_active = TRUE
         )
       )
       AND (? IS NULL OR c.agency_id = ?)`,
    [CUTOFF, CUTOFF, agencyId, agencyId]
  );

  const toPending = [];
  const toCurrent = [];
  for (const r of rows) {
    const weekday = hasWeekday(r.service_days);
    const key = String(r.client_status_key || '').toLowerCase();
    if (!weekday) {
      if (key !== 'pending') toPending.push(r);
    } else if (key !== 'current') {
      toCurrent.push(r);
    }
  }

  console.log(
    `Found ${rows.length} pre-${CUTOFF} school+provider client(s). ` +
      `Would set pending: ${toPending.length}; would set current: ${toCurrent.length}.`
  );
  if (!confirm) {
    console.log('Dry run only — re-run with CONFIRM=1 to apply. Sample pending:');
    for (const r of toPending.slice(0, 25)) {
      console.log(
        `  #${r.id} ${r.identifier_code || r.initials || '?'} status=${r.client_status_key || '(none)'} days=${r.service_days || '(none)'} cpa=${r.active_cpa_count}`
      );
    }
    console.log('Sample current:');
    for (const r of toCurrent.slice(0, 15)) {
      console.log(
        `  #${r.id} ${r.identifier_code || r.initials || '?'} status=${r.client_status_key || '(none)'} days=${r.service_days}`
      );
    }
    return;
  }

  const statusCache = new Map();
  const statusId = async (aId, key) => {
    const cacheKey = `${aId}:${key}`;
    if (!statusCache.has(cacheKey)) {
      statusCache.set(cacheKey, await getClientStatusIdByKey({ agencyId: aId, statusKey: key }));
    }
    return statusCache.get(cacheKey);
  };

  let updatedPending = 0;
  let updatedCurrent = 0;
  let skipped = 0;

  for (const r of toPending) {
    const pendingId = await statusId(Number(r.agency_id), 'pending');
    if (!pendingId) {
      skipped++;
      continue;
    }
    await Client.update(r.id, { client_status_id: pendingId }, null);
    await ClientStatusHistory.create({
      client_id: r.id,
      changed_by_user_id: null,
      field_changed: 'client_status_id',
      from_value: r.client_status_id ? String(r.client_status_id) : null,
      to_value: String(pendingId),
      note: 'Fall 2026: no assigned day — set pending'
    }).catch(() => {});
    updatedPending++;
  }

  for (const r of toCurrent) {
    const currentId = await statusId(Number(r.agency_id), 'current');
    if (!currentId) {
      skipped++;
      continue;
    }
    await Client.update(r.id, { client_status_id: currentId }, null);
    await ClientStatusHistory.create({
      client_id: r.id,
      changed_by_user_id: null,
      field_changed: 'client_status_id',
      from_value: r.client_status_id ? String(r.client_status_id) : null,
      to_value: String(currentId),
      note: 'Fall 2026: weekday assigned — set current'
    }).catch(() => {});
    updatedCurrent++;
  }

  console.log(
    `Done. Pending updates: ${updatedPending}, current updates: ${updatedCurrent}, skipped: ${skipped}.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
