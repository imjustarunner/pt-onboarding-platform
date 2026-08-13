/**
 * Stamp termination_school_year when a client is terminated.
 */
import pool from '../config/database.js';
import { normalizeSchoolYearLabel, computeCurrentSchoolYearLabel } from '../utils/schoolYear.js';
import { ensureClientSchoolYearMembership } from '../services/clientSchoolYear.service.js';

export async function stampClientTerminationSchoolYear({
  clientId,
  agencyId = null,
  actorUserId = null
}) {
  const cid = Number(clientId || 0);
  if (!cid) return null;

  const [rows] = await pool.execute(
    `SELECT id, agency_id, school_year, grade FROM clients WHERE id = ? LIMIT 1`,
    [cid]
  );
  const row = rows?.[0];
  if (!row) return null;

  const currentYear = computeCurrentSchoolYearLabel();
  const priorYear = normalizeSchoolYearLabel(row.school_year);
  const termYear = currentYear || priorYear;

  await pool.execute(
    `UPDATE clients SET termination_school_year = ? WHERE id = ?`,
    [termYear, cid]
  );

  try {
    await ensureClientSchoolYearMembership({
      clientId: cid,
      agencyId: agencyId || row.agency_id,
      schoolYear: termYear,
      grade: row.grade,
      source: 'termination',
      actorUserId
    });
    if (priorYear && priorYear !== termYear) {
      await ensureClientSchoolYearMembership({
        clientId: cid,
        agencyId: agencyId || row.agency_id,
        schoolYear: priorYear,
        grade: row.grade,
        source: 'termination',
        actorUserId
      });
    }
  } catch {
    // membership table optional on older envs
  }

  return termYear;
}
