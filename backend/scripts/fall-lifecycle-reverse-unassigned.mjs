/**
 * Reverse unassigned 2026-2027 appearances, promote provider+weekday to
 * ready_to_schedule, and upgrade packet/none school-staff ROI to limited
 * when the client ROI date is current.
 */
import pool from '../src/config/database.js';
import { computeCurrentSchoolYearLabel, normalizeSchoolYearLabel } from '../src/utils/schoolYear.js';
import { setClientLifecycleStatus } from '../src/services/clientLifecycleStatus.service.js';
import {
  ensureClientSchoolYearMembership,
  removeClientSchoolYearMembership
} from '../src/services/clientSchoolYear.service.js';

const KEEP_UNASSIGNED_ON_CURRENT = new Set([
  'received',
  'packet',
  'pending_corrections',
  'in_process',
  'screener',
  'waitlist'
]);

const PROMOTE_FROM = new Set([
  'confirmation_pending',
  'confirmed_returning',
  'returning',
  'current',
  'pending',
  'onboarded',
  'continuation_unknown'
]);

function yearBefore(label) {
  const n = normalizeSchoolYearLabel(label);
  const m = String(n || '').match(/^(\d{4})-(\d{4})$/);
  if (!m) return null;
  return `${Number(m[1]) - 1}-${Number(m[2]) - 1}`;
}

async function main() {
  const currentYear = computeCurrentSchoolYearLabel();
  const priorYear = yearBefore(currentYear) || '2025-2026';
  console.log('Current school year:', currentYear, 'prior:', priorYear);

  const [unassigned] = await pool.execute(
    `SELECT c.id, c.initials, c.identifier_code, c.school_year, c.agency_id, c.grade,
            c.created_at, c.submission_date, cs.status_key
     FROM clients c
     LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
     WHERE LOWER(COALESCE(c.client_type, '')) = 'school'
       AND UPPER(COALESCE(c.status, '')) <> 'ARCHIVED'
       AND c.provider_id IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM client_provider_assignments cpa
         WHERE cpa.client_id = c.id AND cpa.is_active = TRUE
       )`
  );

  const ids = (unassigned || []).map((r) => Number(r.id)).filter(Boolean);
  const membershipCurrent = new Set();
  if (ids.length) {
    const ph = ids.map(() => '?').join(',');
    const [mem] = await pool.execute(
      `SELECT client_id FROM client_school_years
       WHERE school_year = ? AND client_id IN (${ph})`,
      [currentYear, ...ids]
    );
    for (const row of mem || []) membershipCurrent.add(Number(row.client_id));
  }

  let reverted = 0;
  for (const row of unassigned || []) {
    const key = String(row.status_key || '').toLowerCase();
    if (key === 'terminated' || key === 'archived') continue;
    if (KEEP_UNASSIGNED_ON_CURRENT.has(key)) continue;
    const primary = normalizeSchoolYearLabel(row.school_year);
    const onCurrent = primary === currentYear || membershipCurrent.has(Number(row.id));
    if (!onCurrent) continue;

    if (primary === currentYear) {
      await pool.execute(`UPDATE clients SET school_year = ? WHERE id = ?`, [priorYear, row.id]);
    }
    await removeClientSchoolYearMembership({ clientId: row.id, schoolYear: currentYear });
    await ensureClientSchoolYearMembership({
      clientId: row.id,
      agencyId: row.agency_id,
      schoolYear: priorYear,
      grade: row.grade,
      source: 'unassigned_year_reverse'
    });
    reverted += 1;
    console.log(
      '  reverted',
      row.id,
      row.initials,
      row.identifier_code,
      key,
      primary,
      '→',
      priorYear
    );
  }
  console.log(`Reverted ${reverted} unassigned clients off ${currentYear}`);

  const [weekdayRows] = await pool.execute(
    `SELECT c.id, c.agency_id, c.initials, cs.status_key,
            c.first_service_at, c.services_started_at
     FROM clients c
     LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
     WHERE LOWER(COALESCE(c.client_type, '')) = 'school'
       AND UPPER(COALESCE(c.status, '')) <> 'ARCHIVED'
       AND EXISTS (
         SELECT 1 FROM client_provider_assignments cpa
         WHERE cpa.client_id = c.id
           AND cpa.is_active = TRUE
           AND cpa.service_day IN ('Monday','Tuesday','Wednesday','Thursday','Friday')
       )`
  );

  let promotedRts = 0;
  let promotedSeen = 0;
  for (const row of weekdayRows || []) {
    const key = String(row.status_key || '').toLowerCase();
    const started = !!(row.first_service_at || row.services_started_at);
    if (started) {
      if (key === 'being_seen' || key === 'terminated' || key === 'waitlist') continue;
      const result = await setClientLifecycleStatus({
        clientId: row.id,
        statusKey: 'being_seen',
        actorUserId: 501,
        note: 'Data fix: services started + weekday → being seen'
      });
      if (result?.changed) promotedSeen += 1;
      continue;
    }
    if (!PROMOTE_FROM.has(key)) continue;
    const result = await setClientLifecycleStatus({
      clientId: row.id,
      statusKey: 'ready_to_schedule',
      actorUserId: 501,
      note: 'Data fix: provider + weekday bypasses fall blocks → ready to schedule'
    });
    if (result?.changed) {
      promotedRts += 1;
      console.log('  RTS', row.id, row.initials, key, '→ ready_to_schedule');
    }
  }
  console.log(`Promoted ${promotedRts} weekday clients to ready_to_schedule`);
  console.log(`Promoted ${promotedSeen} weekday clients with first service to being_seen`);

  const [roiRes] = await pool.execute(
    `UPDATE client_school_staff_roi_access a
     JOIN clients c ON c.id = a.client_id
     SET a.access_level = 'limited',
         a.is_active = TRUE,
         a.revoked_by_user_id = NULL,
         a.revoked_at = NULL,
         a.updated_at = CURRENT_TIMESTAMP
     WHERE LOWER(COALESCE(a.access_level, 'packet')) IN ('packet', 'none')
       AND COALESCE(a.is_active, TRUE) = TRUE
       AND c.roi_expires_at IS NOT NULL
       AND DATE(c.roi_expires_at) >= CURDATE()`
  );
  console.log(`Upgraded ${Number(roiRes?.affectedRows || 0)} packet/none ROI rows to limited (ROI Active)`);

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
