/**
 * Shared school coverage / capacity / waitlist metrics.
 * Canonical sources: provider_school_assignments, client_provider_assignments,
 * client_organization_assignments, client_statuses, school_profiles.
 */
import pool from '../config/database.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export function safeInt(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function makeInClausePlaceholders(count) {
  return Array.from({ length: count }, () => '?').join(',');
}

function isMissingSchemaError(e) {
  const code = e?.code || '';
  if (code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_FIELD_ERROR') return true;
  const msg = String(e?.message || '');
  return msg.includes("doesn't exist") || msg.includes('Unknown column');
}

export async function listAffiliatedSchools(agencyId, { orgType = 'school' } = {}) {
  const affiliated = await OrganizationAffiliation.listActiveOrganizationsForAgency(agencyId);
  const allowed = new Set(['school', 'program', 'learning']);
  const filter = allowed.has(String(orgType || '').toLowerCase()) ? String(orgType).toLowerCase() : 'school';
  return (affiliated || []).filter((o) => {
    const t = String(o?.organization_type || 'agency').toLowerCase();
    if (filter === 'program') return t === 'program' || t === 'learning';
    return t === filter;
  });
}

/**
 * School-level summary rows for By School list.
 */
export async function getSchoolCoverageSummary(agencyId, { orgType = 'school' } = {}) {
  const schools = await listAffiliatedSchools(agencyId, { orgType });
  const schoolIds = schools.map((s) => safeInt(s?.id)).filter(Boolean);
  const refreshedAt = new Date().toISOString();

  if (!schoolIds.length) {
    return { agencyId, refreshedAt, schools: [] };
  }

  const placeholders = makeInClausePlaceholders(schoolIds.length);
  const bySchoolId = new Map();

  for (const s of schools) {
    const sid = safeInt(s?.id);
    if (!sid) continue;
    bySchoolId.set(sid, {
      schoolId: sid,
      schoolName: s?.name || null,
      schoolSlug: s?.slug || s?.portal_url || null,
      organizationType: s?.organization_type || null,
      logoPath: s?.logo_path || null,
      logoUrl: s?.logo_url || null,
      iconFilePath: s?.icon_file_path || null,
      iconPath: s?.icon_path || null,
      isActive: s?.is_active !== false,
      districtName: null,
      providersCount: 0,
      providerDays: 0,
      clientsCurrent: 0,
      clientsAssigned: 0,
      clientsWithoutProvider: 0,
      clientsWithProviderNoDay: 0,
      waitlistCount: 0,
      slotsTotal: 0,
      slotsUsed: 0,
      slotsAvailable: 0,
      capacityUtilization: 0,
      unstaffedDays: 0,
      upcomingEvents: 0,
      warningCount: 0,
      coverageStatus: 'ok',
      days: WEEKDAYS.map((d) => ({
        dayOfWeek: d,
        providersCount: 0,
        clientsCount: 0,
        slotsTotal: 0,
        slotsUsed: 0,
        slotsAvailable: 0,
        unstaffed: false
      }))
    });
  }

  try {
    const [rows] = await pool.execute(
      `SELECT school_organization_id AS school_id, district_name
       FROM school_profiles
       WHERE school_organization_id IN (${placeholders})`,
      schoolIds
    );
    for (const r of rows || []) {
      const t = bySchoolId.get(safeInt(r?.school_id));
      if (t) t.districtName = r?.district_name ? String(r.district_name) : null;
    }
  } catch (e) {
    if (!isMissingSchemaError(e)) throw e;
  }

  try {
    const [rows] = await pool.execute(
      `SELECT
         school_organization_id AS school_id,
         day_of_week,
         COUNT(DISTINCT provider_user_id) AS providers_count,
         COUNT(*) AS provider_days,
         COALESCE(SUM(slots_total), 0) AS slots_total
       FROM provider_school_assignments
       WHERE is_active = TRUE
         AND school_organization_id IN (${placeholders})
       GROUP BY school_organization_id, day_of_week`,
      schoolIds
    );
    for (const r of rows || []) {
      const t = bySchoolId.get(safeInt(r?.school_id));
      if (!t) continue;
      const day = String(r?.day_of_week || '');
      const dayRow = t.days.find((d) => d.dayOfWeek === day);
      const providers = Number(r?.providers_count || 0);
      const slotsTotal = Number(r?.slots_total || 0);
      if (dayRow) {
        dayRow.providersCount = providers;
        dayRow.slotsTotal = slotsTotal;
      }
      t.providersCount = Math.max(t.providersCount, 0);
      t.providerDays += Number(r?.provider_days || 0);
      t.slotsTotal += slotsTotal;
    }

    // Distinct providers per school
    const [provRows] = await pool.execute(
      `SELECT school_organization_id AS school_id, COUNT(DISTINCT provider_user_id) AS providers_count
       FROM provider_school_assignments
       WHERE is_active = TRUE AND school_organization_id IN (${placeholders})
       GROUP BY school_organization_id`,
      schoolIds
    );
    for (const r of provRows || []) {
      const t = bySchoolId.get(safeInt(r?.school_id));
      if (t) t.providersCount = Number(r?.providers_count || 0);
    }
  } catch (e) {
    if (!isMissingSchemaError(e)) throw e;
  }

  try {
    const [rows] = await pool.execute(
      `SELECT
         coa.organization_id AS school_id,
         SUM(CASE WHEN cs.status_key = 'current' THEN 1 ELSE 0 END) AS clients_current,
         SUM(CASE WHEN cs.status_key = 'waitlist' THEN 1 ELSE 0 END) AS waitlist_count
       FROM client_organization_assignments coa
       JOIN clients c ON c.id = coa.client_id
       LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
       WHERE coa.is_active = TRUE
         AND UPPER(COALESCE(c.status,'')) <> 'ARCHIVED'
         AND coa.organization_id IN (${placeholders})
       GROUP BY coa.organization_id`,
      schoolIds
    );
    for (const r of rows || []) {
      const t = bySchoolId.get(safeInt(r?.school_id));
      if (!t) continue;
      t.clientsCurrent = Number(r?.clients_current || 0);
      t.waitlistCount = Number(r?.waitlist_count || 0);
    }
  } catch (e) {
    if (!isMissingSchemaError(e)) throw e;
  }

  try {
    const [rows] = await pool.execute(
      `SELECT
         cpa.organization_id AS school_id,
         COUNT(DISTINCT cpa.client_id) AS clients_assigned
       FROM client_provider_assignments cpa
       JOIN clients c ON c.id = cpa.client_id
       WHERE cpa.is_active = TRUE
         AND UPPER(COALESCE(c.status,'')) <> 'ARCHIVED'
         AND cpa.organization_id IN (${placeholders})
         AND cpa.provider_user_id IS NOT NULL
       GROUP BY cpa.organization_id`,
      schoolIds
    );
    for (const r of rows || []) {
      const t = bySchoolId.get(safeInt(r?.school_id));
      if (t) t.clientsAssigned = Number(r?.clients_assigned || 0);
    }

    const [usedRows] = await pool.execute(
      `SELECT
         cpa.organization_id AS school_id,
         cpa.service_day AS day_of_week,
         COUNT(*) AS slots_used
       FROM client_provider_assignments cpa
       JOIN clients c ON c.id = cpa.client_id
       WHERE cpa.is_active = TRUE
         AND UPPER(COALESCE(c.status,'')) <> 'ARCHIVED'
         AND cpa.organization_id IN (${placeholders})
         AND cpa.provider_user_id IS NOT NULL
         AND cpa.service_day IS NOT NULL
       GROUP BY cpa.organization_id, cpa.service_day`,
      schoolIds
    );
    for (const r of usedRows || []) {
      const t = bySchoolId.get(safeInt(r?.school_id));
      if (!t) continue;
      const used = Number(r?.slots_used || 0);
      t.slotsUsed += used;
      const dayRow = t.days.find((d) => d.dayOfWeek === String(r?.day_of_week || ''));
      if (dayRow) {
        dayRow.clientsCount = used;
        dayRow.slotsUsed = used;
      }
    }

    const [noProv] = await pool.execute(
      `SELECT
         coa.organization_id AS school_id,
         COUNT(DISTINCT c.id) AS cnt
       FROM client_organization_assignments coa
       JOIN clients c ON c.id = coa.client_id
       LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
       LEFT JOIN client_provider_assignments cpa
         ON cpa.client_id = c.id
        AND cpa.organization_id = coa.organization_id
        AND cpa.is_active = TRUE
        AND cpa.provider_user_id IS NOT NULL
       WHERE coa.is_active = TRUE
         AND UPPER(COALESCE(c.status,'')) <> 'ARCHIVED'
         AND COALESCE(cs.status_key, '') IN ('current', 'packet', 'screener')
         AND coa.organization_id IN (${placeholders})
         AND cpa.id IS NULL
       GROUP BY coa.organization_id`,
      schoolIds
    );
    for (const r of noProv || []) {
      const t = bySchoolId.get(safeInt(r?.school_id));
      if (t) t.clientsWithoutProvider = Number(r?.cnt || 0);
    }

    const [noDay] = await pool.execute(
      `SELECT
         cpa.organization_id AS school_id,
         COUNT(DISTINCT cpa.client_id) AS cnt
       FROM client_provider_assignments cpa
       JOIN clients c ON c.id = cpa.client_id
       WHERE cpa.is_active = TRUE
         AND UPPER(COALESCE(c.status,'')) <> 'ARCHIVED'
         AND cpa.organization_id IN (${placeholders})
         AND cpa.provider_user_id IS NOT NULL
         AND cpa.service_day IS NULL
       GROUP BY cpa.organization_id`,
      schoolIds
    );
    for (const r of noDay || []) {
      const t = bySchoolId.get(safeInt(r?.school_id));
      if (t) t.clientsWithProviderNoDay = Number(r?.cnt || 0);
    }
  } catch (e) {
    if (!isMissingSchemaError(e)) throw e;
  }

  try {
    const [rows] = await pool.execute(
      `SELECT organization_id AS school_id, COUNT(*) AS cnt
       FROM company_events
       WHERE organization_id IN (${placeholders})
         AND (
           event_type IN (
             'school_back_to_school', 'school_spring_event', 'school_open_house',
             'school_resource_fair', 'school_family_night', 'school_orientation', 'school_other'
           )
           OR event_type LIKE 'school\\_%'
         )
         AND is_active = 1
         AND starts_at >= NOW()
       GROUP BY organization_id`,
      schoolIds
    );
    for (const r of rows || []) {
      const t = bySchoolId.get(safeInt(r?.school_id));
      if (t) t.upcomingEvents = Number(r?.cnt || 0);
    }
  } catch (e) {
    if (!isMissingSchemaError(e)) throw e;
  }

  for (const t of bySchoolId.values()) {
    t.slotsAvailable = Math.max(0, Number(t.slotsTotal || 0) - Number(t.slotsUsed || 0));
    t.capacityUtilization =
      t.slotsTotal > 0 ? Math.round((t.slotsUsed / t.slotsTotal) * 100) : 0;
    let unstaffed = 0;
    for (const d of t.days) {
      d.slotsAvailable = Math.max(0, Number(d.slotsTotal || 0) - Number(d.slotsUsed || 0));
      d.unstaffed = d.clientsCount > 0 && d.providersCount === 0;
      if (d.unstaffed) unstaffed += 1;
    }
    t.unstaffedDays = unstaffed;

    let warnings = 0;
    if (t.clientsWithoutProvider > 0) warnings += 1;
    if (t.clientsWithProviderNoDay > 0) warnings += 1;
    if (t.unstaffedDays > 0) warnings += 1;
    if (t.waitlistCount > 0 && t.slotsAvailable === 0) warnings += 1;
    t.warningCount = warnings;

    if (t.unstaffedDays > 0 || t.clientsWithoutProvider > 0) t.coverageStatus = 'critical';
    else if (t.clientsWithProviderNoDay > 0 || (t.waitlistCount > 0 && t.slotsAvailable === 0)) {
      t.coverageStatus = 'warning';
    } else if (t.capacityUtilization >= 90) t.coverageStatus = 'tight';
    else t.coverageStatus = 'ok';
  }

  return {
    agencyId,
    refreshedAt,
    schools: Array.from(bySchoolId.values()).sort((a, b) =>
      String(a.schoolName || '').localeCompare(String(b.schoolName || ''))
    )
  };
}

/**
 * Provider-level summary for By Person list.
 */
export async function getProviderCoverageSummary(agencyId) {
  const schools = await listAffiliatedSchools(agencyId, { orgType: 'school' });
  const schoolIds = schools.map((s) => safeInt(s?.id)).filter(Boolean);
  const refreshedAt = new Date().toISOString();
  if (!schoolIds.length) return { agencyId, refreshedAt, providers: [] };

  const placeholders = makeInClausePlaceholders(schoolIds.length);
  const byProvider = new Map();
  const schoolMetaById = new Map();
  for (const s of schools) {
    const sid = safeInt(s?.id);
    if (!sid) continue;
    schoolMetaById.set(sid, {
      schoolName: s?.name || null,
      logoPath: s?.logo_path || null,
      logoUrl: s?.logo_url || null,
      iconFilePath: s?.icon_file_path || null,
      iconPath: s?.icon_path || null,
      districtName: null
    });
  }

  const attachSchoolMeta = (entry, sid, fallbackName = null) => {
    const meta = schoolMetaById.get(sid) || {};
    entry.schoolName = entry.schoolName || fallbackName || meta.schoolName || null;
    entry.logoPath = meta.logoPath || null;
    entry.logoUrl = meta.logoUrl || null;
    entry.iconFilePath = meta.iconFilePath || null;
    entry.iconPath = meta.iconPath || null;
    entry.districtName = meta.districtName || null;
    return entry;
  };

  try {
    const [rows] = await pool.execute(
      `SELECT
         psa.provider_user_id AS provider_id,
         u.first_name,
         u.last_name,
         u.role,
         u.email,
         COALESCE(u.work_phone, u.phone_number, u.personal_phone) AS phone,
         u.status AS user_status,
         psa.school_organization_id AS school_id,
         a.name AS school_name,
         psa.day_of_week,
         psa.slots_total,
         psa.slots_available,
         psa.start_time,
         psa.end_time
       FROM provider_school_assignments psa
       JOIN users u ON u.id = psa.provider_user_id
       JOIN agencies a ON a.id = psa.school_organization_id
       WHERE psa.is_active = TRUE
         AND psa.school_organization_id IN (${placeholders})
         AND UPPER(COALESCE(u.status,'')) <> 'ARCHIVED'
       ORDER BY u.last_name, u.first_name`,
      schoolIds
    );

    for (const r of rows || []) {
      const pid = safeInt(r?.provider_id);
      if (!pid) continue;
      if (!byProvider.has(pid)) {
        byProvider.set(pid, {
          providerId: pid,
          firstName: r.first_name || '',
          lastName: r.last_name || '',
          name: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
          role: r.role || null,
          email: r.email || null,
          phone: r.phone || null,
          status: r.user_status || null,
          assignedSchools: 0,
          assignedDays: 0,
          clientsCurrent: 0,
          slotsTotal: 0,
          slotsUsed: 0,
          slotsAvailable: 0,
          capacityUtilization: 0,
          pendingRequests: 0,
          upcomingEvents: 0,
          warningCount: 0,
          schools: [],
          _schoolSet: new Set(),
          _daySet: new Set()
        });
      }
      const p = byProvider.get(pid);
      const sid = safeInt(r.school_id);
      p._schoolSet.add(sid);
      p._daySet.add(`${sid}:${r.day_of_week}`);
      p.slotsTotal += Number(r.slots_total || 0);
      let schoolEntry = p.schools.find((s) => s.schoolId === sid);
      if (!schoolEntry) {
        schoolEntry = attachSchoolMeta(
          {
            schoolId: sid,
            schoolName: r.school_name || null,
            days: [],
            slotsTotal: 0,
            slotsUsed: 0,
            slotsAvailable: 0,
            clients: 0,
            fromAssignment: true
          },
          sid,
          r.school_name
        );
        p.schools.push(schoolEntry);
      }
      schoolEntry.days.push({
        dayOfWeek: r.day_of_week,
        startTime: r.start_time ? String(r.start_time).slice(0, 5) : null,
        endTime: r.end_time ? String(r.end_time).slice(0, 5) : null,
        slotsTotal: Number(r.slots_total || 0),
        slotsUsed: 0,
        slotsAvailable: Number(r.slots_available || 0),
        clients: 0
      });
      schoolEntry.slotsTotal += Number(r.slots_total || 0);
    }
  } catch (e) {
    if (!isMissingSchemaError(e)) throw e;
  }

  const providerIds = Array.from(byProvider.keys());
  if (providerIds.length) {
    const pPh = makeInClausePlaceholders(providerIds.length);
    try {
      const [rows] = await pool.execute(
        `SELECT
           cpa.provider_user_id AS provider_id,
           cpa.organization_id AS school_id,
           cpa.service_day AS day_of_week,
           COUNT(*) AS cnt
         FROM client_provider_assignments cpa
         JOIN clients c ON c.id = cpa.client_id
         WHERE cpa.is_active = TRUE
           AND UPPER(COALESCE(c.status,'')) <> 'ARCHIVED'
           AND cpa.provider_user_id IN (${pPh})
           AND cpa.organization_id IN (${placeholders})
           AND cpa.provider_user_id IS NOT NULL
           AND cpa.service_day IS NOT NULL
         GROUP BY cpa.provider_user_id, cpa.organization_id, cpa.service_day`,
        [...providerIds, ...schoolIds]
      );
      for (const r of rows || []) {
        const p = byProvider.get(safeInt(r.provider_id));
        if (!p) continue;
        const used = Number(r.cnt || 0);
        p.slotsUsed += used;
        p.clientsCurrent += used;
        const schoolEntry = p.schools.find((s) => s.schoolId === safeInt(r.school_id));
        if (schoolEntry) {
          schoolEntry.slotsUsed += used;
          schoolEntry.clients += used;
          const day = (schoolEntry.days || []).find(
            (d) => String(d.dayOfWeek || '').toLowerCase() === String(r.day_of_week || '').toLowerCase()
          );
          if (day) {
            day.clients = used;
            day.slotsUsed = used;
            day.slotsAvailable = Math.max(0, Number(day.slotsTotal || 0) - used);
          }
        }
      }
    } catch (e) {
      if (!isMissingSchemaError(e)) throw e;
    }

    try {
      const [rows] = await pool.execute(
        `SELECT provider_id, COUNT(*) AS cnt
         FROM provider_school_availability_requests
         WHERE agency_id = ? AND status = 'PENDING' AND provider_id IN (${pPh})
         GROUP BY provider_id`,
        [agencyId, ...providerIds]
      );
      for (const r of rows || []) {
        const p = byProvider.get(safeInt(r.provider_id));
        if (p) p.pendingRequests = Number(r.cnt || 0);
      }
    } catch (e) {
      if (!isMissingSchemaError(e)) throw e;
    }
  }

  // Providers affiliated via user_agencies but with no PSA days
  try {
    const [rows] = await pool.execute(
      `SELECT DISTINCT ua.user_id AS provider_id, u.first_name, u.last_name, u.role, u.email,
              COALESCE(u.work_phone, u.phone_number, u.personal_phone) AS phone,
              u.status AS user_status,
              ua.agency_id AS school_id, a.name AS school_name
       FROM user_agencies ua
       JOIN users u ON u.id = ua.user_id
       JOIN agencies a ON a.id = ua.agency_id
       WHERE ua.agency_id IN (${placeholders})
         AND LOWER(COALESCE(u.role,'')) IN ('provider', 'provider_plus', 'intern', 'intern_plus')
         AND UPPER(COALESCE(u.status,'')) <> 'ARCHIVED'`,
      schoolIds
    );
    for (const r of rows || []) {
      const pid = safeInt(r.provider_id);
      if (!pid) continue;
      const sid = safeInt(r.school_id);
      if (!byProvider.has(pid)) {
        byProvider.set(pid, {
          providerId: pid,
          firstName: r.first_name || '',
          lastName: r.last_name || '',
          name: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
          role: r.role || null,
          email: r.email || null,
          phone: r.phone || null,
          status: r.user_status || null,
          assignedSchools: 0,
          assignedDays: 0,
          clientsCurrent: 0,
          slotsTotal: 0,
          slotsUsed: 0,
          slotsAvailable: 0,
          capacityUtilization: 0,
          pendingRequests: 0,
          upcomingEvents: 0,
          warningCount: 0,
          schools: [],
          _schoolSet: new Set([sid]),
          _daySet: new Set(),
          noDayAssigned: true
        });
        const p = byProvider.get(pid);
        p.schools.push(
          attachSchoolMeta(
            {
              schoolId: sid,
              schoolName: r.school_name || null,
              days: [],
              slotsTotal: 0,
              slotsUsed: 0,
              slotsAvailable: 0,
              clients: 0,
              fromAssignment: false
            },
            sid,
            r.school_name
          )
        );
      } else {
        const p = byProvider.get(pid);
        if (!p._schoolSet.has(sid)) {
          p._schoolSet.add(sid);
          p.schools.push(
            attachSchoolMeta(
              {
                schoolId: sid,
                schoolName: r.school_name || null,
                days: [],
                slotsTotal: 0,
                slotsUsed: 0,
                slotsAvailable: 0,
                clients: 0,
                fromAssignment: false
              },
              sid,
              r.school_name
            )
          );
        }
      }
    }
  } catch (e) {
    if (!isMissingSchemaError(e)) throw e;
  }

  for (const p of byProvider.values()) {
    // Prefer actual school-day assignments over portal membership-only affiliations.
    p.schools = (p.schools || []).sort((a, b) => {
      const aRank = a.fromAssignment || (a.days || []).length ? 0 : 1;
      const bRank = b.fromAssignment || (b.days || []).length ? 0 : 1;
      if (aRank !== bRank) return aRank - bRank;
      return String(a.schoolName || '').localeCompare(String(b.schoolName || ''));
    });
    const staffedSchools = p.schools.filter((s) => s.fromAssignment || (s.days || []).length > 0);
    p.assignedSchools = staffedSchools.length || p._schoolSet.size;
    p.assignedDays = p._daySet.size;
    for (const s of p.schools || []) {
      s.slotsAvailable = Math.max(0, Number(s.slotsTotal || 0) - Number(s.slotsUsed || 0));
      for (const d of s.days || []) {
        d.slotsUsed = Number(d.slotsUsed || d.clients || 0);
        d.clients = Number(d.clients || d.slotsUsed || 0);
        d.slotsAvailable = Math.max(0, Number(d.slotsTotal || 0) - d.slotsUsed);
      }
    }
    p.slotsAvailable = Math.max(0, p.slotsTotal - p.slotsUsed);
    p.capacityUtilization = p.slotsTotal > 0 ? Math.round((p.slotsUsed / p.slotsTotal) * 100) : 0;
    p.noDayAssigned = p._schoolSet.size > 0 && p.assignedDays === 0;
    p.warningCount = 0;
    if (p.noDayAssigned) p.warningCount += 1;
    delete p._schoolSet;
    delete p._daySet;
  }

  return {
    agencyId,
    refreshedAt,
    providers: Array.from(byProvider.values()).sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''))
    )
  };
}

export async function getSchoolDetail(agencyId, schoolOrganizationId) {
  const summary = await getSchoolCoverageSummary(agencyId, { orgType: 'school' });
  const school = (summary.schools || []).find((s) => s.schoolId === safeInt(schoolOrganizationId));
  if (!school) return null;

  const sid = school.schoolId;
  let providers = [];
  try {
    const [rows] = await pool.execute(
      `SELECT
         psa.provider_user_id AS provider_id,
         u.first_name, u.last_name, u.role, u.email,
         psa.day_of_week, psa.slots_total, psa.slots_available, psa.start_time, psa.end_time
       FROM provider_school_assignments psa
       JOIN users u ON u.id = psa.provider_user_id
       WHERE psa.is_active = TRUE AND psa.school_organization_id = ?
       ORDER BY u.last_name, FIELD(psa.day_of_week,'Monday','Tuesday','Wednesday','Thursday','Friday')`,
      [sid]
    );
    const map = new Map();
    for (const r of rows || []) {
      const pid = safeInt(r.provider_id);
      if (!map.has(pid)) {
        map.set(pid, {
          providerId: pid,
          name: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
          role: r.role,
          email: r.email,
          days: [],
          slotsTotal: 0
        });
      }
      const p = map.get(pid);
      p.days.push({
        dayOfWeek: r.day_of_week,
        startTime: r.start_time ? String(r.start_time).slice(0, 5) : null,
        endTime: r.end_time ? String(r.end_time).slice(0, 5) : null,
        slotsTotal: Number(r.slots_total || 0),
        slotsAvailable: Number(r.slots_available || 0)
      });
      p.slotsTotal += Number(r.slots_total || 0);
    }
    providers = Array.from(map.values());
  } catch (e) {
    if (!isMissingSchemaError(e)) throw e;
  }

  let events = [];
  try {
    const [rows] = await pool.execute(
      `SELECT id, title, event_type, starts_at, ends_at, timezone,
              is_active, staffing_config_json, outreach_table_invited
       FROM company_events
       WHERE organization_id = ?
         AND (
           event_type IN (
             'school_back_to_school', 'school_spring_event', 'school_open_house',
             'school_resource_fair', 'school_family_night', 'school_orientation', 'school_other'
           )
           OR event_type LIKE 'school\\_%'
         )
       ORDER BY starts_at DESC
       LIMIT 50`,
      [sid]
    );
    events = (rows || []).map((r) => ({
      id: r.id,
      title: r.title,
      eventType: r.event_type,
      startAt: r.starts_at,
      endAt: r.ends_at,
      timezone: r.timezone,
      isActive: !!(r.is_active === 1 || r.is_active === true),
      outreachTableInvited: !!r.outreach_table_invited
    }));
  } catch (e) {
    if (!isMissingSchemaError(e)) throw e;
  }

  return { ...school, providers, events, agencyId };
}

export async function getProviderDetail(agencyId, providerId) {
  const summary = await getProviderCoverageSummary(agencyId);
  const provider = (summary.providers || []).find((p) => p.providerId === safeInt(providerId));
  if (!provider) return null;

  let requests = [];
  try {
    const [rows] = await pool.execute(
      `SELECT id, status, notes, preferred_school_org_ids_json, created_at, resolved_at
       FROM provider_school_availability_requests
       WHERE agency_id = ? AND provider_id = ?
       ORDER BY created_at DESC
       LIMIT 20`,
      [agencyId, providerId]
    );
    requests = (rows || []).map((r) => ({
      id: r.id,
      status: r.status,
      notes: r.notes,
      preferredSchoolOrgIds: r.preferred_school_org_ids_json
        ? JSON.parse(r.preferred_school_org_ids_json)
        : [],
      createdAt: r.created_at,
      resolvedAt: r.resolved_at
    }));
  } catch (e) {
    if (!isMissingSchemaError(e)) throw e;
  }

  return { ...provider, requests, agencyId };
}

export { WEEKDAYS };
