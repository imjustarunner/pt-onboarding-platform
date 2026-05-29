import pool from '../config/database.js';

const ACTIVE_PREDICATE = "(cec.intake_outcome IS NULL OR cec.intake_outcome <> 'denied')";
const INTAKE_ACCEPTED_PREDICATE = `(
  cec.intake_outcome = 'accepted'
  OR (
    COALESCE(cec.intake_complete, 0) = 1
    AND (cec.intake_outcome IS NULL OR TRIM(cec.intake_outcome) = '')
  )
)`;
const REGISTRANT_PREDICATE = `(${ACTIVE_PREDICATE} AND (NOT ${INTAKE_ACCEPTED_PREDICATE} OR (${INTAKE_ACCEPTED_PREDICATE} AND COALESCE(cec.treatment_plan_complete, 0) = 0)))`;
const PARTICIPANT_PREDICATE = `(${INTAKE_ACCEPTED_PREDICATE} AND ${ACTIVE_PREDICATE})`;

const emptyCounts = () => ({
  registrantsCount: 0,
  participantsCount: 0,
  staffAssignedCount: 0
});

/**
 * Batch counts for Programs & events directory cards.
 * @param {number} agencyId
 * @param {number[]} eventIds
 * @returns {Promise<Map<number, { registrantsCount: number, participantsCount: number, staffAssignedCount: number }>>}
 */
export async function loadCompanyEventDirectoryCounts(agencyId, eventIds) {
  const result = new Map();
  const ids = [...new Set((eventIds || []).map((id) => Number(id)).filter((n) => Number.isFinite(n) && n > 0))];
  if (!ids.length || !agencyId) return result;

  for (const id of ids) {
    result.set(id, emptyCounts());
  }

  const ph = ids.map(() => '?').join(',');

  try {
    const [crow] = await pool.execute(
      `SELECT company_event_id,
              SUM(CASE WHEN ${REGISTRANT_PREDICATE} THEN 1 ELSE 0 END) AS registrants_count,
              SUM(CASE WHEN ${PARTICIPANT_PREDICATE} THEN 1 ELSE 0 END) AS participants_count
       FROM company_event_clients cec
       WHERE agency_id = ? AND company_event_id IN (${ph})
       GROUP BY company_event_id`,
      [agencyId, ...ids]
    );
    for (const c of crow || []) {
      const id = Number(c.company_event_id);
      const prior = result.get(id) || emptyCounts();
      result.set(id, {
        ...prior,
        registrantsCount: Number(c.registrants_count || 0),
        participantsCount: Number(c.participants_count || 0)
      });
    }
  } catch {
    // Older DBs without workflow columns — cards still render with zero counts.
  }

  try {
    const [srows] = await pool.execute(
      `SELECT company_event_id, COUNT(DISTINCT provider_user_id) AS staff_count
       FROM (
         SELECT company_event_id, provider_user_id
         FROM company_event_session_providers
         WHERE company_event_id IN (${ph})
         UNION
         SELECT sg.company_event_id, sgp.provider_user_id
         FROM skills_groups sg
         INNER JOIN skills_group_providers sgp ON sgp.skills_group_id = sg.id
         WHERE sg.company_event_id IN (${ph}) AND sg.agency_id = ?
         UNION
         SELECT company_event_id, provider_user_id
         FROM company_event_provider_assignments
         WHERE company_event_id IN (${ph})
       ) staff_union
       GROUP BY company_event_id`,
      [...ids, ...ids, agencyId, ...ids]
    );
    for (const s of srows || []) {
      const id = Number(s.company_event_id);
      const prior = result.get(id) || emptyCounts();
      result.set(id, {
        ...prior,
        staffAssignedCount: Number(s.staff_count || 0)
      });
    }
  } catch {
    // Assignment tables may be absent on older deployments.
  }

  return result;
}

/**
 * Assigned staff names for directory cards (same sources as staff counts).
 * @returns {Promise<Map<number, { userId: number, firstName: string, lastName: string, fullName: string }[]>>}
 */
export async function loadCompanyEventDirectoryStaff(agencyId, eventIds) {
  const result = new Map();
  const ids = [...new Set((eventIds || []).map((id) => Number(id)).filter((n) => Number.isFinite(n) && n > 0))];
  if (!ids.length || !agencyId) return result;

  const ph = ids.map(() => '?').join(',');

  try {
    const [rows] = await pool.execute(
      `SELECT staff_union.company_event_id,
              u.id AS user_id,
              u.first_name,
              u.last_name
       FROM (
         SELECT company_event_id, provider_user_id
         FROM company_event_session_providers
         WHERE company_event_id IN (${ph})
         UNION
         SELECT sg.company_event_id, sgp.provider_user_id
         FROM skills_groups sg
         INNER JOIN skills_group_providers sgp ON sgp.skills_group_id = sg.id
         WHERE sg.company_event_id IN (${ph}) AND sg.agency_id = ?
         UNION
         SELECT company_event_id, provider_user_id
         FROM company_event_provider_assignments
         WHERE company_event_id IN (${ph})
       ) staff_union
       INNER JOIN users u ON u.id = staff_union.provider_user_id
       ORDER BY staff_union.company_event_id ASC, u.last_name ASC, u.first_name ASC, u.id ASC`,
      [...ids, ...ids, agencyId, ...ids]
    );
    for (const r of rows || []) {
      const eid = Number(r.company_event_id);
      if (!eid) continue;
      const uid = Number(r.user_id);
      if (!result.has(eid)) result.set(eid, []);
      const list = result.get(eid);
      if (list.some((x) => x.userId === uid)) continue;
      const firstName = String(r.first_name || '').trim();
      const lastName = String(r.last_name || '').trim();
      const fullName = [firstName, lastName].filter(Boolean).join(' ') || `User ${uid}`;
      list.push({ userId: uid, firstName, lastName, fullName });
    }
  } catch {
    // optional tables
  }

  return result;
}
