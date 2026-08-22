import pool from '../config/database.js';

function normalizeDayName(day) {
  const d = String(day || '').trim();
  if (!d) return null;
  const lower = d.toLowerCase();
  const map = {
    monday: 'Monday',
    tuesday: 'Tuesday',
    wednesday: 'Wednesday',
    thursday: 'Thursday',
    friday: 'Friday',
    saturday: 'Saturday',
    sunday: 'Sunday'
  };
  return map[lower] || d;
}

function normalizeSchoolName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function namesMatch(hint, name, officialName) {
  const h = normalizeSchoolName(hint);
  if (!h) return false;
  const candidates = [name, officialName].map(normalizeSchoolName).filter(Boolean);
  for (const c of candidates) {
    if (h === c) return true;
    if (h.includes(c) || c.includes(h)) return true;
  }
  return false;
}

function pickBestSchoolMatch(hint, rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return null;
  if (!hint) return list.length === 1 ? list[0] : null;
  const scored = list
    .map((row) => {
      const name = normalizeSchoolName(row.name);
      const official = normalizeSchoolName(row.official_name);
      const h = normalizeSchoolName(hint);
      let score = 0;
      if (h === name || h === official) score = 100;
      else if (name && (h.includes(name) || name.includes(h))) score = 80;
      else if (official && (h.includes(official) || official.includes(h))) score = 70;
      return { row, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) return list.length === 1 ? list[0] : null;
  return scored[0].row;
}

/**
 * Resolve school organization id for a schedule-adjustment request.
 * Older requests may only have a school name in notes (no preferred_school_org_ids_json).
 */
export async function resolveSchoolOrganizationIdForScheduleAdjustment({
  agencyId,
  providerUserId,
  dayOfWeek = null,
  preferredSchoolOrgIds = [],
  schoolNameHint = '',
  explicitSchoolOrgId = null
} = {}) {
  const aid = Number(agencyId || 0);
  const pid = Number(providerUserId || 0);
  if (!aid || !pid) return null;

  const explicit = Number(explicitSchoolOrgId || 0) || null;
  if (explicit) return explicit;

  const preferred = (Array.isArray(preferredSchoolOrgIds) ? preferredSchoolOrgIds : [])
    .map((id) => Number(id))
    .filter((id) => id > 0);
  if (preferred[0]) return preferred[0];

  const hint = String(schoolNameHint || '').trim();
  const day = normalizeDayName(dayOfWeek);

  if (hint) {
    const [exactRows] = await pool.execute(
      `SELECT o.id, o.name, o.official_name
       FROM organization_affiliations oa
       INNER JOIN agencies o ON o.id = oa.organization_id
       WHERE oa.agency_id = ?
         AND (oa.is_active = TRUE OR oa.is_active IS NULL)
         AND (
           LOWER(o.name) = LOWER(?)
           OR LOWER(COALESCE(o.official_name, '')) = LOWER(?)
         )
       LIMIT 5`,
      [aid, hint, hint]
    );
    const exactPick = pickBestSchoolMatch(hint, exactRows || []);
    if (exactPick?.id) return Number(exactPick.id);

    const [affiliated] = await pool.execute(
      `SELECT o.id, o.name, o.official_name
       FROM organization_affiliations oa
       INNER JOIN agencies o ON o.id = oa.organization_id
       WHERE oa.agency_id = ?
         AND (oa.is_active = TRUE OR oa.is_active IS NULL)`,
      [aid]
    );
    const fuzzyPick = pickBestSchoolMatch(hint, affiliated || []);
    if (fuzzyPick?.id) return Number(fuzzyPick.id);
  }

  if (day) {
    const [assignmentRows] = await pool.execute(
      `SELECT psa.school_organization_id AS id, sch.name, sch.official_name
       FROM provider_school_assignments psa
       INNER JOIN agencies sch ON sch.id = psa.school_organization_id
       WHERE psa.provider_user_id = ?
         AND psa.day_of_week = ?
         AND psa.is_active = TRUE`,
      [pid, day]
    );
    if ((assignmentRows || []).length === 1) {
      return Number(assignmentRows[0].id);
    }
    const assignmentPick = pickBestSchoolMatch(hint, assignmentRows || []);
    if (assignmentPick?.id) return Number(assignmentPick.id);
  }

  return null;
}
