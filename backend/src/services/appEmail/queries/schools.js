/**
 * School coverage queries for Email App Assistant (privileged roles).
 */
import pool from '../../../config/database.js';
import { getSchoolCoverageSummary, getSchoolDetail, listAffiliatedSchools } from '../../schoolCoverageMetrics.service.js';

export async function findSchoolByName(agencyId, schoolQuery) {
  const q = String(schoolQuery || '').trim().toLowerCase();
  if (!q) return null;
  const summary = await getSchoolCoverageSummary(agencyId, { orgType: 'school' });
  const schools = Array.isArray(summary?.schools) ? summary.schools : [];
  if (!schools.length) return null;

  const exact = schools.find((s) => String(s.schoolName || '').trim().toLowerCase() === q);
  if (exact) return exact;

  const contains = schools.filter((s) => String(s.schoolName || '').toLowerCase().includes(q));
  if (contains.length === 1) return contains[0];
  if (contains.length > 1) {
    // Prefer shortest name match (e.g. "Carter" → "Carter Elementary")
    contains.sort((a, b) => String(a.schoolName).length - String(b.schoolName).length);
    return { ambiguous: true, matches: contains.slice(0, 8) };
  }

  // Token match
  const tokens = q.split(/\s+/).filter((t) => t.length >= 3);
  if (tokens.length) {
    const tokenHits = schools.filter((s) => {
      const name = String(s.schoolName || '').toLowerCase();
      return tokens.every((t) => name.includes(t));
    });
    if (tokenHits.length === 1) return tokenHits[0];
    if (tokenHits.length > 1) {
      return { ambiguous: true, matches: tokenHits.slice(0, 8) };
    }
  }
  return null;
}

export async function listProvidersAtSchoolsToday(agencyId, weekday) {
  const day = String(weekday || '').trim();
  const schools = await listAffiliatedSchools(agencyId, { orgType: 'school' });
  const schoolIds = (schools || []).map((s) => Number(s.id)).filter(Boolean);
  if (!schoolIds.length) return [];

  const placeholders = schoolIds.map(() => '?').join(',');
  const nameById = new Map((schools || []).map((s) => [Number(s.id), s.name]));

  const [rows] = await pool.execute(
    `SELECT
       psa.school_organization_id AS school_id,
       psa.provider_user_id AS provider_id,
       TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) AS provider_name,
       psa.start_time,
       psa.end_time
     FROM provider_school_assignments psa
     JOIN users u ON u.id = psa.provider_user_id
     WHERE psa.is_active = TRUE
       AND psa.day_of_week = ?
       AND psa.school_organization_id IN (${placeholders})
     ORDER BY psa.school_organization_id ASC, u.last_name ASC, u.first_name ASC
     LIMIT 400`,
    [day, ...schoolIds]
  );

  return (rows || []).map((r) => ({
    ...r,
    school_name: nameById.get(Number(r.school_id)) || `School #${r.school_id}`
  }));
}

export async function listProvidersForSchoolDay(agencyId, schoolOrganizationId, weekday) {
  const detail = await getSchoolDetail(agencyId, schoolOrganizationId);
  if (!detail) return { school: null, providers: [] };
  const day = String(weekday || '').trim();
  const providers = (detail.providers || [])
    .map((p) => {
      const dayRows = (p.days || []).filter((d) => String(d.dayOfWeek) === day);
      if (!dayRows.length) return null;
      return {
        name: p.name,
        days: dayRows
      };
    })
    .filter(Boolean);
  return { school: detail, providers };
}

export function formatSchoolRosterReply({ weekday, dateYmd, rows }) {
  const lines = [`School coverage for ${weekday} (${dateYmd})`, ''];
  if (!rows?.length) {
    lines.push('No providers are assigned to schools for this weekday.');
    return lines.join('\n');
  }
  let lastSchool = null;
  for (const row of rows) {
    if (row.school_name !== lastSchool) {
      lines.push(`• ${row.school_name}`);
      lastSchool = row.school_name;
    }
    const window =
      row.start_time || row.end_time
        ? ` (${String(row.start_time || '').slice(0, 5)}–${String(row.end_time || '').slice(0, 5)})`
        : '';
    lines.push(`  - ${row.provider_name || 'Unknown'}${window}`);
  }
  return lines.join('\n');
}

export function formatSchoolDetailReply({ weekday, dateYmd, schoolName, providers }) {
  const lines = [`Providers at ${schoolName} — ${weekday} (${dateYmd})`, ''];
  if (!providers?.length) {
    lines.push('No providers are assigned to this school for that weekday.');
    return lines.join('\n');
  }
  for (const p of providers) {
    const windows = (p.days || [])
      .map((d) => {
        if (d.startTime || d.endTime) return `${d.startTime || '?'}–${d.endTime || '?'}`;
        return null;
      })
      .filter(Boolean);
    lines.push(`• ${p.name}${windows.length ? ` · ${windows.join(', ')}` : ''}`);
  }
  return lines.join('\n');
}
