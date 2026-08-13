/**
 * Agency-scoped school reports: assignment buckets, school/district/provider
 * rollups, and year-over-year "seen" / session counts.
 *
 * Builds on school coverage sources (provider_school_assignments,
 * client_provider_assignments) with a school-year filter.
 */
import pool from '../config/database.js';
import { listAffiliatedSchools, safeInt } from './schoolCoverageMetrics.service.js';
import {
  computeCurrentSchoolYearLabel,
  normalizeSchoolYearLabel,
  previousSchoolYearLabel,
  schoolYearDateRange
} from '../utils/schoolYear.js';

function makeInClausePlaceholders(count) {
  return Array.from({ length: count }, () => '?').join(',');
}

function isMissingSchemaError(e) {
  const code = e?.code || '';
  if (code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_FIELD_ERROR') return true;
  const msg = String(e?.message || '');
  return msg.includes("doesn't exist") || msg.includes('Unknown column');
}

export function classifyAssignmentBucket({ hasProvider, hasDay }) {
  if (hasProvider && hasDay) return 'provider_and_day';
  if (hasProvider) return 'provider_no_day';
  return 'no_provider';
}

function emptyTotals() {
  return {
    clients: 0,
    providerAndDay: 0,
    providerNoDay: 0,
    noProvider: 0,
    studentsSeen: 0,
    sessions: 0
  };
}

function yearMembershipSql(alias = 'c') {
  return `(
    ${alias}.school_year = ?
    OR EXISTS (
      SELECT 1 FROM client_school_years csy
      WHERE csy.client_id = ${alias}.id AND csy.school_year = ?
    )
  )`;
}

function yearMembershipSqlLegacy(alias = 'c') {
  return `${alias}.school_year = ?`;
}

const CLIENT_BASE_SQL = `
  FROM client_organization_assignments coa
  JOIN clients c ON c.id = coa.client_id
  LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
  LEFT JOIN client_provider_assignments cpa
    ON cpa.client_id = c.id
   AND cpa.organization_id = coa.organization_id
   AND cpa.is_active = TRUE
  WHERE coa.is_active = TRUE
    AND UPPER(COALESCE(c.status,'')) <> 'ARCHIVED'
    AND coa.organization_id IN (%%SCHOOLS%%)
    AND %%YEAR%%
`;

const CLIENT_ROLLUP_SELECT = `
  SELECT
    coa.organization_id AS school_id,
    c.id AS client_id,
    CASE
      WHEN SUM(
        CASE
          WHEN COALESCE(cpa.provider_user_id, c.provider_id) IS NOT NULL
           AND COALESCE(
             cpa.service_day,
             CASE WHEN cpa.id IS NULL THEN c.service_day ELSE NULL END
           ) IS NOT NULL
          THEN 1 ELSE 0
        END
      ) > 0 THEN 'provider_and_day'
      WHEN SUM(
        CASE
          WHEN COALESCE(cpa.provider_user_id, c.provider_id) IS NOT NULL
          THEN 1 ELSE 0
        END
      ) > 0 THEN 'provider_no_day'
      ELSE 'no_provider'
    END AS bucket,
    MAX(
      CASE
        WHEN LOWER(COALESCE(cs.status_key, '')) IN ('being_seen', 'current', 'scheduled')
          OR c.services_started_at IS NOT NULL
          OR c.first_service_at IS NOT NULL
        THEN 1 ELSE 0
      END
    ) AS seen
`;

async function queryClientRollup(schoolIds, year, { useMembershipTable = true } = {}) {
  const placeholders = makeInClausePlaceholders(schoolIds.length);
  const yearSql = useMembershipTable ? yearMembershipSql('c') : yearMembershipSqlLegacy('c');
  const yearParams = useMembershipTable ? [year, year] : [year];
  const sql = `${CLIENT_ROLLUP_SELECT}
    ${CLIENT_BASE_SQL.replace('%%SCHOOLS%%', placeholders).replace('%%YEAR%%', yearSql)}
    GROUP BY coa.organization_id, c.id`;
  const [rows] = await pool.execute(sql, [...schoolIds, ...yearParams]);
  return rows || [];
}

function applyBucket(target, bucket, seen) {
  target.clients += 1;
  if (bucket === 'provider_and_day') target.providerAndDay += 1;
  else if (bucket === 'provider_no_day') target.providerNoDay += 1;
  else target.noProvider += 1;
  if (Number(seen) > 0) target.studentsSeen += 1;
}

async function loadDistricts(schoolIds) {
  const byId = new Map();
  if (!schoolIds.length) return byId;
  try {
    const placeholders = makeInClausePlaceholders(schoolIds.length);
    const [rows] = await pool.execute(
      `SELECT school_organization_id AS school_id, district_name
       FROM school_profiles
       WHERE school_organization_id IN (${placeholders})`,
      schoolIds
    );
    for (const r of rows || []) {
      byId.set(safeInt(r.school_id), String(r.district_name || '').trim() || 'Unlisted district');
    }
  } catch (e) {
    if (!isMissingSchemaError(e)) throw e;
  }
  return byId;
}

async function loadProviderCapacity(schoolIds) {
  const byProvider = new Map();
  if (!schoolIds.length) return byProvider;
  const placeholders = makeInClausePlaceholders(schoolIds.length);
  try {
    const [rows] = await pool.execute(
      `SELECT
         psa.provider_user_id AS provider_id,
         u.first_name,
         u.last_name,
         COUNT(DISTINCT CONCAT(psa.school_organization_id, ':', psa.day_of_week)) AS days_scheduled,
         COUNT(DISTINCT psa.school_organization_id) AS schools_scheduled,
         SUM(COALESCE(psa.slots_total, 0)) AS slots_total,
         SUM(COALESCE(psa.slots_available, 0)) AS slots_available
       FROM provider_school_assignments psa
       JOIN users u ON u.id = psa.provider_user_id
       WHERE psa.is_active = TRUE
         AND psa.school_organization_id IN (${placeholders})
         AND UPPER(COALESCE(u.status, '')) <> 'ARCHIVED'
       GROUP BY psa.provider_user_id, u.first_name, u.last_name`,
      schoolIds
    );
    for (const r of rows || []) {
      const id = safeInt(r.provider_id);
      if (!id) continue;
      const slotsTotal = Number(r.slots_total || 0);
      const slotsAvailable = Number(r.slots_available || 0);
      byProvider.set(id, {
        providerId: id,
        name: `${r.first_name || ''} ${r.last_name || ''}`.trim() || `Provider ${id}`,
        daysScheduled: Number(r.days_scheduled || 0),
        schoolsScheduled: Number(r.schools_scheduled || 0),
        slotsTotal,
        slotsAvailable,
        slotsUsed: Math.max(0, slotsTotal - slotsAvailable),
        clients: 0,
        providerAndDay: 0,
        providerNoDay: 0
      });
    }
  } catch (e) {
    if (!isMissingSchemaError(e)) throw e;
  }
  return byProvider;
}

async function loadProviderClientCounts(schoolIds, year) {
  const counts = new Map();
  if (!schoolIds.length) return counts;
  const placeholders = makeInClausePlaceholders(schoolIds.length);
  const tryQuery = async (useMembership) => {
    const yearSql = useMembership ? yearMembershipSql('c') : yearMembershipSqlLegacy('c');
    const yearParams = useMembership ? [year, year] : [year];
    const [rows] = await pool.execute(
      `SELECT
         COALESCE(cpa.provider_user_id, c.provider_id) AS provider_id,
         COUNT(DISTINCT c.id) AS clients,
         COUNT(DISTINCT CASE
           WHEN COALESCE(cpa.service_day, CASE WHEN cpa.id IS NULL THEN c.service_day ELSE NULL END) IS NOT NULL
           THEN c.id END
         ) AS with_day
       FROM client_organization_assignments coa
       JOIN clients c ON c.id = coa.client_id
       LEFT JOIN client_provider_assignments cpa
         ON cpa.client_id = c.id
        AND cpa.organization_id = coa.organization_id
        AND cpa.is_active = TRUE
       WHERE coa.is_active = TRUE
         AND UPPER(COALESCE(c.status, '')) <> 'ARCHIVED'
         AND coa.organization_id IN (${placeholders})
         AND ${yearSql}
         AND COALESCE(cpa.provider_user_id, c.provider_id) IS NOT NULL
       GROUP BY COALESCE(cpa.provider_user_id, c.provider_id)`,
      [...schoolIds, ...yearParams]
    );
    return rows || [];
  };

  let rows;
  try {
    rows = await tryQuery(true);
  } catch (e) {
    if (!isMissingSchemaError(e)) throw e;
    rows = await tryQuery(false);
  }

  for (const r of rows || []) {
    const id = safeInt(r.provider_id);
    if (!id) continue;
    counts.set(id, {
      clients: Number(r.clients || 0),
      providerAndDay: Number(r.with_day || 0),
      providerNoDay: Math.max(0, Number(r.clients || 0) - Number(r.with_day || 0))
    });
  }
  return counts;
}

async function loadSessionCounts(agencyId, schoolIds, range) {
  const bySchool = new Map();
  if (!schoolIds.length || !range?.startYmd || !range?.endYmdExclusive) return bySchool;
  const placeholders = makeInClausePlaceholders(schoolIds.length);
  const startAt = `${range.startYmd} 00:00:00`;
  const endAt = `${range.endYmdExclusive} 00:00:00`;

  const tryScheduleEvents = async () => {
    const [rows] = await pool.execute(
      `SELECT
         coa.organization_id AS school_id,
         COUNT(pse.id) AS sessions,
         COUNT(DISTINCT pse.client_id) AS students
       FROM provider_schedule_events pse
       JOIN client_organization_assignments coa
         ON coa.client_id = pse.client_id AND coa.is_active = TRUE
       WHERE pse.agency_id = ?
         AND pse.client_id IS NOT NULL
         AND coa.organization_id IN (${placeholders})
         AND COALESCE(pse.start_at, pse.start_date) >= ?
         AND COALESCE(pse.start_at, pse.start_date) < ?
         AND UPPER(COALESCE(pse.status, '')) NOT IN ('CANCELLED', 'CANCELED')
       GROUP BY coa.organization_id`,
      [agencyId, ...schoolIds, startAt, endAt]
    );
    return rows || [];
  };

  const tryCounselingSessions = async () => {
    const [rows] = await pool.execute(
      `SELECT
         coa.organization_id AS school_id,
         COUNT(cs.id) AS sessions,
         COUNT(DISTINCT c.id) AS students
       FROM counseling_sessions cs
       JOIN clients c ON c.user_id = cs.client_user_id
       JOIN client_organization_assignments coa
         ON coa.client_id = c.id AND coa.is_active = TRUE
       WHERE cs.agency_id = ?
         AND coa.organization_id IN (${placeholders})
         AND COALESCE(cs.started_at, cs.created_at) >= ?
         AND COALESCE(cs.started_at, cs.created_at) < ?
         AND LOWER(COALESCE(cs.status, '')) NOT IN ('cancelled', 'canceled')
       GROUP BY coa.organization_id`,
      [agencyId, ...schoolIds, startAt, endAt]
    );
    return rows || [];
  };

  let rows = [];
  try {
    rows = await tryScheduleEvents();
  } catch (e) {
    if (!isMissingSchemaError(e)) throw e;
    try {
      rows = await tryCounselingSessions();
    } catch (e2) {
      if (!isMissingSchemaError(e2)) throw e2;
      rows = [];
    }
  }

  for (const r of rows) {
    bySchool.set(safeInt(r.school_id), {
      sessions: Number(r.sessions || 0),
      students: Number(r.students || 0)
    });
  }
  return bySchool;
}

async function loadAvailableYears(schoolIds, currentYear) {
  const years = new Set([currentYear]);
  if (!schoolIds.length) return [currentYear];
  const placeholders = makeInClausePlaceholders(schoolIds.length);
  try {
    const [rows] = await pool.execute(
      `SELECT DISTINCT c.school_year AS school_year
       FROM client_organization_assignments coa
       JOIN clients c ON c.id = coa.client_id
       WHERE coa.is_active = TRUE
         AND coa.organization_id IN (${placeholders})
         AND c.school_year IS NOT NULL
         AND c.school_year <> ''
       UNION
       SELECT DISTINCT csy.school_year
       FROM client_school_years csy
       JOIN client_organization_assignments coa ON coa.client_id = csy.client_id AND coa.is_active = TRUE
       WHERE coa.organization_id IN (${placeholders})`,
      [...schoolIds, ...schoolIds]
    );
    for (const r of rows || []) {
      const label = normalizeSchoolYearLabel(r.school_year);
      if (label) years.add(label);
    }
  } catch (e) {
    if (!isMissingSchemaError(e)) {
      try {
        const [rows] = await pool.execute(
          `SELECT DISTINCT c.school_year AS school_year
           FROM client_organization_assignments coa
           JOIN clients c ON c.id = coa.client_id
           WHERE coa.is_active = TRUE
             AND coa.organization_id IN (${placeholders})
             AND c.school_year IS NOT NULL
             AND c.school_year <> ''`,
          schoolIds
        );
        for (const r of rows || []) {
          const label = normalizeSchoolYearLabel(r.school_year);
          if (label) years.add(label);
        }
      } catch (e2) {
        if (!isMissingSchemaError(e2)) throw e2;
      }
    }
  }
  return Array.from(years).sort((a, b) => String(b).localeCompare(String(a)));
}

export async function getSchoolReportsSnapshot(agencyId, { schoolYear = null } = {}) {
  const year = normalizeSchoolYearLabel(schoolYear) || computeCurrentSchoolYearLabel();
  const priorYear = previousSchoolYearLabel(year);
  const range = schoolYearDateRange(year);
  const priorRange = schoolYearDateRange(priorYear);
  const schools = await listAffiliatedSchools(agencyId, { orgType: 'school' });
  const schoolIds = schools.map((s) => safeInt(s?.id)).filter(Boolean);
  const refreshedAt = new Date().toISOString();

  const empty = {
    agencyId,
    schoolYear: year,
    priorSchoolYear: priorYear,
    dateRange: range,
    refreshedAt,
    availableYears: [year, priorYear].filter(Boolean),
    totals: emptyTotals(),
    priorYear: { studentsSeen: 0, sessions: 0 },
    schools: [],
    districts: [],
    providers: []
  };

  if (!schoolIds.length) return empty;

  let rows;
  try {
    rows = await queryClientRollup(schoolIds, year, { useMembershipTable: true });
  } catch (e) {
    if (!isMissingSchemaError(e)) throw e;
    rows = await queryClientRollup(schoolIds, year, { useMembershipTable: false });
  }

  let priorRows = [];
  try {
    priorRows = await queryClientRollup(schoolIds, priorYear, { useMembershipTable: true });
  } catch (e) {
    if (!isMissingSchemaError(e)) throw e;
    try {
      priorRows = await queryClientRollup(schoolIds, priorYear, { useMembershipTable: false });
    } catch (e2) {
      if (!isMissingSchemaError(e2)) throw e2;
    }
  }

  const districtsBySchool = await loadDistricts(schoolIds);
  const sessionsBySchool = await loadSessionCounts(agencyId, schoolIds, range);
  const priorSessionsBySchool = await loadSessionCounts(agencyId, schoolIds, priorRange);
  const providerCapacity = await loadProviderCapacity(schoolIds);
  const providerClients = await loadProviderClientCounts(schoolIds, year);
  const availableYears = await loadAvailableYears(schoolIds, year);

  const bySchoolId = new Map();
  for (const s of schools) {
    const sid = safeInt(s?.id);
    if (!sid) continue;
    const districtName = districtsBySchool.get(sid) || 'Unlisted district';
    bySchoolId.set(sid, {
      schoolId: sid,
      schoolName: s?.name || `School ${sid}`,
      schoolSlug: s?.slug || s?.portal_url || null,
      districtName,
      ...emptyTotals(),
      studentsSeenPriorYear: 0,
      sessionsPriorYear: 0
    });
  }

  const totals = emptyTotals();
  const clientBest = new Map();
  const bucketRank = { provider_and_day: 2, provider_no_day: 1, no_provider: 0 };
  for (const r of rows) {
    const sid = safeInt(r.school_id);
    const target = bySchoolId.get(sid);
    if (!target) continue;
    applyBucket(target, r.bucket, r.seen);
    const cid = safeInt(r.client_id);
    if (!cid) continue;
    const prev = clientBest.get(cid);
    const rank = bucketRank[r.bucket] ?? 0;
    if (!prev || rank > prev.rank) {
      clientBest.set(cid, { bucket: r.bucket, seen: Number(r.seen) > 0 ? 1 : 0, rank });
    } else if (Number(r.seen) > 0) {
      prev.seen = 1;
    }
  }
  for (const { bucket, seen } of clientBest.values()) {
    applyBucket(totals, bucket, seen);
  }

  const priorSeen = new Set();
  for (const r of priorRows) {
    const sid = safeInt(r.school_id);
    const target = bySchoolId.get(sid);
    if (target && Number(r.seen) > 0) target.studentsSeenPriorYear += 1;
    const cid = safeInt(r.client_id);
    if (cid && Number(r.seen) > 0) priorSeen.add(cid);
  }

  let sessionsTotal = 0;
  let priorSessionsTotal = 0;
  for (const [sid, counts] of sessionsBySchool) {
    const target = bySchoolId.get(sid);
    if (target) target.sessions = counts.sessions;
    sessionsTotal += counts.sessions;
  }
  for (const [sid, counts] of priorSessionsBySchool) {
    const target = bySchoolId.get(sid);
    if (target) target.sessionsPriorYear = counts.sessions;
    priorSessionsTotal += counts.sessions;
  }
  totals.sessions = sessionsTotal;

  const schoolRows = Array.from(bySchoolId.values()).sort((a, b) =>
    String(a.schoolName).localeCompare(String(b.schoolName))
  );

  const byDistrict = new Map();
  for (const s of schoolRows) {
    const key = s.districtName || 'Unlisted district';
    if (!byDistrict.has(key)) {
      byDistrict.set(key, {
        districtName: key,
        schools: 0,
        ...emptyTotals(),
        studentsSeenPriorYear: 0,
        sessionsPriorYear: 0
      });
    }
    const d = byDistrict.get(key);
    d.schools += 1;
    d.clients += s.clients;
    d.providerAndDay += s.providerAndDay;
    d.providerNoDay += s.providerNoDay;
    d.noProvider += s.noProvider;
    d.studentsSeen += s.studentsSeen;
    d.sessions += s.sessions;
    d.studentsSeenPriorYear += s.studentsSeenPriorYear;
    d.sessionsPriorYear += s.sessionsPriorYear;
  }

  for (const [pid, counts] of providerClients) {
    if (!providerCapacity.has(pid)) {
      providerCapacity.set(pid, {
        providerId: pid,
        name: `Provider ${pid}`,
        daysScheduled: 0,
        schoolsScheduled: 0,
        slotsTotal: 0,
        slotsAvailable: 0,
        slotsUsed: 0,
        clients: 0,
        providerAndDay: 0,
        providerNoDay: 0
      });
    }
    const p = providerCapacity.get(pid);
    p.clients = counts.clients;
    p.providerAndDay = counts.providerAndDay;
    p.providerNoDay = counts.providerNoDay;
  }

  const providers = Array.from(providerCapacity.values()).sort((a, b) =>
    String(a.name).localeCompare(String(b.name))
  );

  return {
    agencyId,
    schoolYear: year,
    priorSchoolYear: priorYear,
    dateRange: range,
    refreshedAt,
    availableYears,
    totals,
    priorYear: {
      studentsSeen: priorSeen.size,
      sessions: priorSessionsTotal
    },
    schools: schoolRows,
    districts: Array.from(byDistrict.values()).sort((a, b) =>
      String(a.districtName).localeCompare(String(b.districtName))
    ),
    providers
  };
}
