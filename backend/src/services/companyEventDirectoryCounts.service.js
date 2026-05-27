import pool from '../config/database.js';

const REGISTRANT_PREDICATE =
  '(COALESCE(cec.treatment_plan_complete, 0) = 0 AND (cec.intake_outcome IS NULL OR cec.intake_outcome <> \'denied\'))';
const PARTICIPANT_PREDICATE =
  '(COALESCE(cec.treatment_plan_complete, 0) = 1 AND (cec.intake_outcome IS NULL OR cec.intake_outcome <> \'denied\'))';

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
