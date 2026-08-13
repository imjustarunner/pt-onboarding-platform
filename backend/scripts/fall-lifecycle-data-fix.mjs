/**
 * One-shot fall lifecycle data: inspect pre-2025-2026 clients, stamp
 * termination years, mark incomplete continuing as confirmation_pending,
 * and promote confirmed_returning to ready_to_schedule during the 8/16 override.
 */
import pool from '../src/config/database.js';
import { computeCurrentSchoolYearLabel, normalizeSchoolYearLabel } from '../src/utils/schoolYear.js';
import { getClientStatusIdByKey } from '../src/utils/clientStatusCatalog.js';
import { ensureClientSchoolYearMembership } from '../src/services/clientSchoolYear.service.js';

const NEW_INTAKE = new Set([
  'received',
  'packet',
  'pending_corrections',
  'in_process',
  'screener',
  'ready_to_schedule',
  'waitlist',
  'terminated',
  'confirmation_pending'
]);

function yearStart(label) {
  const n = normalizeSchoolYearLabel(label);
  const m = String(n || '').match(/^(\d{4})-/);
  return m ? Number(m[1]) : null;
}

async function main() {
  const currentYear = computeCurrentSchoolYearLabel();
  console.log('Current school year:', currentYear);

  const [preRows] = await pool.execute(
    `SELECT c.id, c.initials, c.identifier_code, c.school_year, c.created_at, c.submission_date,
            cs.status_key, c.agency_id
     FROM clients c
     LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
     WHERE UPPER(COALESCE(c.status, '')) <> 'ARCHIVED'`
  );
  const pre2025 = (preRows || []).filter((r) => {
    const start = yearStart(r.school_year);
    return start != null && start < 2025;
  });
  console.log(`Clients with school_year before 2025-2026: ${pre2025.length}`);
  for (const r of pre2025.slice(0, 50)) {
    console.log('  ', r.id, r.initials, r.identifier_code, r.school_year, r.status_key, r.created_at);
  }

  if (pre2025.length) {
    const ids = pre2025.map((r) => r.id);
    let keep = new Set();
    try {
      const ph = ids.map(() => '?').join(',');
      const [mem] = await pool.execute(
        `SELECT client_id, school_year FROM client_school_years WHERE client_id IN (${ph})`,
        ids
      );
      for (const m of mem || []) {
        const start = yearStart(m.school_year);
        if (start != null && start >= 2025) keep.add(Number(m.client_id));
      }
    } catch (e) {
      console.warn('membership lookup skipped', e.message);
    }
    const toDelete = pre2025.filter((r) => !keep.has(Number(r.id)));
    console.log(`Deleting ${toDelete.length} pre-2025-2026 clients with no 2025+ membership`);
    for (const r of toDelete) {
      await pool.execute(`UPDATE clients SET status = 'ARCHIVED' WHERE id = ?`, [r.id]);
    }
    console.log('Archived (not hard-deleted) so history/FKs remain.');
  }

  const [termRows] = await pool.execute(
    `SELECT c.id, c.agency_id, c.grade, c.school_year, c.termination_school_year, c.terminated_at
     FROM clients c
     LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
     WHERE LOWER(COALESCE(cs.status_key, '')) = 'terminated'
       AND (c.termination_school_year IS NULL OR c.termination_school_year <> ?)`,
    [currentYear]
  );
  let termUpdated = 0;
  for (const r of termRows || []) {
    const terminatedAt = r.terminated_at ? new Date(r.terminated_at) : null;
    const inferred = terminatedAt && Number.isFinite(terminatedAt.getTime())
      ? computeCurrentSchoolYearLabel(terminatedAt)
      : currentYear;
    if (inferred !== currentYear && normalizeSchoolYearLabel(r.school_year) !== currentYear) {
      continue;
    }
    await pool.execute(`UPDATE clients SET termination_school_year = ? WHERE id = ?`, [currentYear, r.id]);
    try {
      await ensureClientSchoolYearMembership({
        clientId: r.id,
        agencyId: r.agency_id,
        schoolYear: currentYear,
        grade: r.grade,
        source: 'termination'
      });
    } catch {
      // optional
    }
    termUpdated += 1;
  }
  console.log(`Stamped termination_school_year=${currentYear} on ${termUpdated} terminated clients`);

  const [agencies] = await pool.execute(`SELECT DISTINCT agency_id FROM clients WHERE agency_id IS NOT NULL`);
  let pendingUpdated = 0;
  let rtsUpdated = 0;
  for (const a of agencies || []) {
    const agencyId = Number(a.agency_id);
    const pendingId = await getClientStatusIdByKey({ agencyId, statusKey: 'confirmation_pending' });
    const rtsId = await getClientStatusIdByKey({ agencyId, statusKey: 'ready_to_schedule' });
    if (pendingId) {
      const [res] = await pool.execute(
        `UPDATE clients c
         JOIN client_statuses cs ON cs.id = c.client_status_id
         SET c.client_status_id = ?
         WHERE c.agency_id = ?
           AND LOWER(COALESCE(c.client_type, '')) = 'school'
           AND UPPER(COALESCE(c.status, '')) <> 'ARCHIVED'
           AND LOWER(COALESCE(cs.status_key, '')) NOT IN (${[...NEW_INTAKE].map(() => '?').join(',')})
           AND (c.parents_contacted_at IS NULL OR (c.first_service_at IS NULL AND c.services_started_at IS NULL))`,
        [pendingId, agencyId, ...NEW_INTAKE]
      );
      pendingUpdated += Number(res?.affectedRows || 0);
    }
    if (rtsId) {
      const [res] = await pool.execute(
        `UPDATE clients c
         JOIN client_statuses cs ON cs.id = c.client_status_id
         SET c.client_status_id = ?
         WHERE c.agency_id = ?
           AND LOWER(COALESCE(c.client_type, '')) = 'school'
           AND UPPER(COALESCE(c.status, '')) <> 'ARCHIVED'
           AND LOWER(COALESCE(cs.status_key, '')) = 'confirmed_returning'`,
        [rtsId, agencyId]
      );
      rtsUpdated += Number(res?.affectedRows || 0);
    }
  }
  console.log(`Set Fall Confirmation Pending on ${pendingUpdated} incomplete continuing clients (dates not backfilled)`);
  console.log(`Promoted ${rtsUpdated} confirmed_returning continuing clients to ready_to_schedule (insurance override through 8/16)`);

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
