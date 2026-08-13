/**
 * Multi-year school membership: add clients to a school year without switching
 * clients.school_year (prior year membership is retained).
 */
import pool from '../config/database.js';
import { normalizeSchoolYearLabel, computeCurrentSchoolYearLabel } from '../utils/schoolYear.js';
import { bumpGradeCanonical } from '../utils/clientGrade.js';

export async function ensureClientSchoolYearMembership({
  clientId,
  schoolYear,
  agencyId = null,
  grade = undefined,
  source = 'manual',
  actorUserId = null
}) {
  const cid = Number(clientId || 0);
  const year = normalizeSchoolYearLabel(schoolYear);
  if (!cid || !year) return null;

  let nextGrade = grade;
  if (nextGrade === undefined) {
    const [rows] = await pool.execute(
      `SELECT grade, agency_id FROM clients WHERE id = ? LIMIT 1`,
      [cid]
    );
    nextGrade = rows?.[0]?.grade ?? null;
    if (agencyId == null) agencyId = rows?.[0]?.agency_id ?? null;
  }

  await pool.execute(
    `INSERT INTO client_school_years
       (client_id, agency_id, school_year, grade, source, added_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       agency_id = COALESCE(VALUES(agency_id), agency_id),
       grade = COALESCE(VALUES(grade), grade),
       updated_at = CURRENT_TIMESTAMP`,
    [cid, agencyId || null, year, nextGrade ?? null, source || 'manual', actorUserId || null]
  );

  const [out] = await pool.execute(
    `SELECT * FROM client_school_years WHERE client_id = ? AND school_year = ? LIMIT 1`,
    [cid, year]
  );
  return out?.[0] || null;
}

/**
 * Add client to a target school year without changing clients.school_year / grade.
 * Stores bumped grade on the new membership row only.
 */
export async function addClientToSchoolYear({
  clientId,
  agencyId = null,
  fromSchoolYear = null,
  toSchoolYear = null,
  bumpGrade = true,
  source = 'bulk_add',
  actorUserId = null,
  currentGrade = null
}) {
  const cid = Number(clientId || 0);
  if (!cid) throw Object.assign(new Error('clientId required'), { status: 400 });

  let agency = agencyId;
  let grade = currentGrade;
  let fromYear = normalizeSchoolYearLabel(fromSchoolYear);
  if (agency == null || grade == null || !fromYear) {
    const [rows] = await pool.execute(
      `SELECT agency_id, school_year, grade FROM clients WHERE id = ? LIMIT 1`,
      [cid]
    );
    const row = rows?.[0];
    if (!row) throw Object.assign(new Error('Client not found'), { status: 404 });
    if (agency == null) agency = row.agency_id;
    if (grade == null) grade = row.grade;
    if (!fromYear) fromYear = normalizeSchoolYearLabel(row.school_year);
  }

  // Keep prior year membership if we know it
  if (fromYear) {
    await ensureClientSchoolYearMembership({
      clientId: cid,
      agencyId: agency,
      schoolYear: fromYear,
      grade,
      source: 'ensure_prior',
      actorUserId
    });
  }

  const target =
    normalizeSchoolYearLabel(toSchoolYear)
    || computeNextFromLabel(fromYear)
    || computeCurrentSchoolYearLabel();

  const membershipGrade = bumpGrade ? bumpGradeCanonical(grade) : grade;
  const membership = await ensureClientSchoolYearMembership({
    clientId: cid,
    agencyId: agency,
    schoolYear: target,
    grade: membershipGrade,
    source,
    actorUserId
  });

  return {
    clientId: cid,
    fromSchoolYear: fromYear,
    schoolYear: target,
    grade: membershipGrade ?? null,
    membership,
    switchedPrimary: false
  };
}

function computeNextFromLabel(fromLabel) {
  const cur = normalizeSchoolYearLabel(fromLabel) || computeCurrentSchoolYearLabel();
  const m = String(cur || '').match(/^(\d{4})-(\d{4})$/);
  if (!m) return null;
  const a = parseInt(m[1], 10);
  const b = parseInt(m[2], 10);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return `${a + 1}-${b + 1}`;
}

export async function listClientSchoolYears(clientId) {
  const cid = Number(clientId || 0);
  if (!cid) return [];
  const [rows] = await pool.execute(
    `SELECT school_year, grade, source, created_at
     FROM client_school_years
     WHERE client_id = ?
     ORDER BY school_year DESC`,
    [cid]
  );
  return rows || [];
}

/** Map of clientId -> Set of school_year labels for membership lookup. */
export async function getClientSchoolYearMembershipMap(clientIds = [], schoolYear = null) {
  const ids = (clientIds || []).map((x) => Number(x)).filter((n) => n > 0);
  const map = new Map();
  if (!ids.length) return map;
  const year = normalizeSchoolYearLabel(schoolYear);
  const placeholders = ids.map(() => '?').join(',');
  const params = year ? [year, ...ids] : [...ids];
  const [rows] = await pool.execute(
    year
      ? `SELECT client_id, school_year
         FROM client_school_years
         WHERE school_year = ? AND client_id IN (${placeholders})`
      : `SELECT client_id, school_year
         FROM client_school_years
         WHERE client_id IN (${placeholders})`,
    params
  );
  for (const r of rows || []) {
    const cid = Number(r.client_id);
    if (!map.has(cid)) map.set(cid, new Set());
    map.get(cid).add(normalizeSchoolYearLabel(r.school_year));
  }
  return map;
}

export async function clientHasSchoolYearMembership(clientId, schoolYear) {
  const cid = Number(clientId || 0);
  const year = normalizeSchoolYearLabel(schoolYear);
  if (!cid || !year) return false;
  const [rows] = await pool.execute(
    `SELECT id FROM client_school_years WHERE client_id = ? AND school_year = ? LIMIT 1`,
    [cid, year]
  );
  return !!(rows && rows[0]);
}

export async function removeClientSchoolYearMembership({ clientId, schoolYear }) {
  const cid = Number(clientId || 0);
  const year = normalizeSchoolYearLabel(schoolYear);
  if (!cid || !year) return 0;
  const [result] = await pool.execute(
    `DELETE FROM client_school_years WHERE client_id = ? AND school_year = ?`,
    [cid, year]
  );
  return Number(result?.affectedRows || 0);
}
