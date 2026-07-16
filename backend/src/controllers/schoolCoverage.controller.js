import Agency from '../models/Agency.model.js';
import {
  getSchoolCoverageSummary,
  getProviderCoverageSummary,
  getSchoolDetail,
  getProviderDetail,
  safeInt
} from '../services/schoolCoverageMetrics.service.js';
import { getCoverageWarnings } from '../services/schoolCoverageWarnings.service.js';
import { getOpenSchoolDays } from '../services/openSchoolDays.service.js';
import { syncSchoolPortalDayProvider } from '../services/schoolPortalDaySync.service.js';
import { enableSchoolEventProviderStaffing } from '../services/schoolPortalEvents.service.js';
import pool from '../config/database.js';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function normalizeDay(d) {
  const s = String(d || '').trim();
  return WEEKDAYS.includes(s) ? s : null;
}

function canViewCoverage(role) {
  const r = String(role || '').toLowerCase();
  return (
    r === 'super_admin' ||
    r === 'admin' ||
    r === 'support' ||
    r === 'staff' ||
    r === 'clinical_practice_assistant' ||
    r === 'provider_plus' ||
    r === 'provider' ||
    r === 'schedule_manager' ||
    r === 'supervisor'
  );
}

function canManageCoverage(role) {
  const r = String(role || '').toLowerCase();
  return (
    r === 'super_admin' ||
    r === 'admin' ||
    r === 'support' ||
    r === 'staff' ||
    r === 'clinical_practice_assistant' ||
    r === 'provider_plus'
  );
}

async function resolveAgencyId(req) {
  const fromQuery = safeInt(req.query?.agencyId);
  const fromBody = safeInt(req.body?.agencyId);
  const fromUser = safeInt(req.user?.agencyId || req.user?.agency_id);
  const agencyId = fromQuery || fromBody || fromUser;
  if (!agencyId) return null;
  if (String(req.user?.role || '').toLowerCase() === 'super_admin') return agencyId;
  // Prefer membership check via user_agencies when present
  try {
    const uid = safeInt(req.user?.id);
    if (!uid) return agencyId;
    const [rows] = await pool.execute(
      `SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1`,
      [uid, agencyId]
    );
    if (rows?.[0]) return agencyId;
    if (fromUser === agencyId) return agencyId;
  } catch {
    /* fall through */
  }
  return fromUser || agencyId;
}

async function assertAgencyAccess(req, res, agencyId) {
  if (!agencyId) {
    res.status(400).json({ error: { message: 'agencyId is required' } });
    return false;
  }
  if (!canViewCoverage(req.user?.role)) {
    res.status(403).json({ error: { message: 'Access denied' } });
    return false;
  }
  if (String(req.user?.role || '').toLowerCase() === 'super_admin') return true;
  const agency = await Agency.findById(agencyId);
  if (!agency) {
    res.status(404).json({ error: { message: 'Agency not found' } });
    return false;
  }
  return true;
}

export const getSummary = async (req, res, next) => {
  try {
    const agencyId = await resolveAgencyId(req);
    if (!(await assertAgencyAccess(req, res, agencyId))) return;
    const orgType = String(req.query.orgType || 'school').toLowerCase();
    const data = await getSchoolCoverageSummary(agencyId, { orgType });
    res.json(data);
  } catch (e) {
    next(e);
  }
};

export const getProviders = async (req, res, next) => {
  try {
    const agencyId = await resolveAgencyId(req);
    if (!(await assertAgencyAccess(req, res, agencyId))) return;
    const data = await getProviderCoverageSummary(agencyId);
    res.json(data);
  } catch (e) {
    next(e);
  }
};

export const getWarnings = async (req, res, next) => {
  try {
    const agencyId = await resolveAgencyId(req);
    if (!(await assertAgencyAccess(req, res, agencyId))) return;
    const data = await getCoverageWarnings(agencyId, {
      severity: req.query.severity || null,
      type: req.query.type || null
    });
    res.json(data);
  } catch (e) {
    next(e);
  }
};

export const getOpenDays = async (req, res, next) => {
  try {
    const agencyId = await resolveAgencyId(req);
    if (!(await assertAgencyAccess(req, res, agencyId))) return;
    const schoolId = safeInt(req.query.schoolId);
    const data = await getOpenSchoolDays(agencyId, { schoolId });
    res.json(data);
  } catch (e) {
    next(e);
  }
};

export const getSchool = async (req, res, next) => {
  try {
    const agencyId = await resolveAgencyId(req);
    if (!(await assertAgencyAccess(req, res, agencyId))) return;
    const schoolId = safeInt(req.params.schoolId);
    if (!schoolId) return res.status(400).json({ error: { message: 'schoolId is required' } });
    const data = await getSchoolDetail(agencyId, schoolId);
    if (!data) return res.status(404).json({ error: { message: 'School not found' } });
    res.json(data);
  } catch (e) {
    next(e);
  }
};

export const getProvider = async (req, res, next) => {
  try {
    const agencyId = await resolveAgencyId(req);
    if (!(await assertAgencyAccess(req, res, agencyId))) return;
    const providerId = safeInt(req.params.providerId);
    if (!providerId) return res.status(400).json({ error: { message: 'providerId is required' } });
    const role = String(req.user?.role || '').toLowerCase();
    if (role === 'provider' || role === 'intern') {
      if (Number(req.user?.id) !== providerId) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }
    const data = await getProviderDetail(agencyId, providerId);
    if (!data) return res.status(404).json({ error: { message: 'Provider not found' } });
    res.json(data);
  } catch (e) {
    next(e);
  }
};

/**
 * Hub events list (school-typed company_events + staffing counts).
 */
export const listHubEvents = async (req, res, next) => {
  try {
    const agencyId = await resolveAgencyId(req);
    if (!(await assertAgencyAccess(req, res, agencyId))) return;
    const schoolId = safeInt(req.query.schoolId);
    const archived = String(req.query.archived || '').toLowerCase() === 'true';

    let sql = `
      SELECT ce.id, ce.title, ce.description, ce.event_type, ce.starts_at, ce.ends_at,
             ce.timezone, ce.is_active, ce.organization_id, ce.outreach_table_invited,
             ce.staffing_config_json, a.name AS school_name, sp.district_name
      FROM company_events ce
      LEFT JOIN agencies a ON a.id = ce.organization_id
      LEFT JOIN school_profiles sp ON sp.school_organization_id = ce.organization_id
      WHERE ce.agency_id = ?
        AND (
          ce.event_type IN (
            'school_back_to_school', 'school_spring_event', 'school_open_house',
            'school_resource_fair', 'school_family_night', 'school_orientation', 'school_other'
          )
          OR ce.event_type LIKE 'school\\_%'
        )
    `;
    const params = [agencyId];
    if (schoolId) {
      sql += ' AND ce.organization_id = ?';
      params.push(schoolId);
    }
    if (archived) {
      sql += ' AND ce.is_active = 0';
    } else {
      sql += ' AND ce.is_active = 1';
    }
    sql += ' ORDER BY ce.starts_at ASC LIMIT 500';

    let rows = [];
    try {
      const [result] = await pool.execute(sql, params);
      rows = result || [];
    } catch (e) {
      // school_profiles may be missing in older envs
      if (!String(e?.message || '').includes('school_profiles') && e?.code !== 'ER_NO_SUCH_TABLE') throw e;
      let fallbackSql = `
        SELECT ce.id, ce.title, ce.description, ce.event_type, ce.starts_at, ce.ends_at,
               ce.timezone, ce.is_active, ce.organization_id, ce.outreach_table_invited,
               ce.staffing_config_json, a.name AS school_name, NULL AS district_name
        FROM company_events ce
        LEFT JOIN agencies a ON a.id = ce.organization_id
        WHERE ce.agency_id = ?
          AND (ce.event_type LIKE 'school\\_%')
          AND ce.is_active = ${archived ? 0 : 1}`;
      const fallbackParams = [agencyId];
      if (schoolId) {
        fallbackSql += ' AND ce.organization_id = ?';
        fallbackParams.push(schoolId);
      }
      fallbackSql += ' ORDER BY ce.starts_at ASC LIMIT 500';
      const [result] = await pool.execute(fallbackSql, fallbackParams);
      rows = result || [];
    }

    const events = [];
    for (const r of rows || []) {
      let assigned = 0;
      let pending = 0;
      let requested = 1;
      let staffingEnabled = false;
      let providerSignupEnabled = false;
      let assignedProviders = [];
      try {
        const cfg =
          typeof r.staffing_config_json === 'string'
            ? JSON.parse(r.staffing_config_json)
            : r.staffing_config_json || {};
        staffingEnabled = !!(cfg && cfg.enabled !== false && r.staffing_config_json);
        providerSignupEnabled = !!(cfg?.providerSignup?.enabled ?? staffingEnabled);
        requested = Number(cfg?.minProvidersPerSession || 1) || 1;
      } catch {
        requested = 1;
        staffingEnabled = false;
      }
      // Legacy: outreach invitation implies staffable even if JSON missing/corrupt.
      if (!staffingEnabled && r.outreach_table_invited) {
        staffingEnabled = true;
        providerSignupEnabled = true;
      }
      try {
        const [aRows] = await pool.execute(
          `SELECT DISTINCT u.id, u.first_name, u.last_name
           FROM company_event_session_providers csp
           JOIN company_event_session_dates csd ON csd.id = csp.session_date_id
           JOIN users u ON u.id = csp.provider_user_id
           WHERE csd.company_event_id = ?
           ORDER BY u.last_name ASC, u.first_name ASC
           LIMIT 8`,
          [r.id]
        );
        assignedProviders = (aRows || []).map((p) => ({
          id: Number(p.id),
          firstName: p.first_name || '',
          lastName: p.last_name || '',
          name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || `Provider ${p.id}`
        }));
        assigned = assignedProviders.length;
        // If truncated, get true distinct count
        if (assignedProviders.length >= 8) {
          const [cRows] = await pool.execute(
            `SELECT COUNT(DISTINCT csp.provider_user_id) AS cnt
             FROM company_event_session_providers csp
             JOIN company_event_session_dates csd ON csd.id = csp.session_date_id
             WHERE csd.company_event_id = ?`,
            [r.id]
          );
          assigned = Number(cRows?.[0]?.cnt || assigned);
        }
      } catch {
        assigned = 0;
        assignedProviders = [];
      }
      try {
        const [pRows] = await pool.execute(
          `SELECT COUNT(*) AS cnt
           FROM company_event_session_provider_requests req
           JOIN company_event_session_dates csd ON csd.id = req.session_date_id
           WHERE csd.company_event_id = ? AND UPPER(req.status) = 'PENDING'`,
          [r.id]
        );
        pending = Number(pRows?.[0]?.cnt || 0);
      } catch {
        pending = 0;
      }
      const remaining = staffingEnabled ? Math.max(0, requested - assigned) : 0;
      const now = Date.now();
      const startMs = r.starts_at ? new Date(r.starts_at).getTime() : NaN;
      const endMs = r.ends_at ? new Date(r.ends_at).getTime() : startMs;
      let lifecycleStatus = 'scheduled';
      if (!r.is_active) lifecycleStatus = 'archived';
      else if (Number.isFinite(endMs) && endMs < now) lifecycleStatus = 'completed';
      else if (Number.isFinite(startMs) && startMs <= now + 14 * 86400000) lifecycleStatus = 'upcoming';
      else lifecycleStatus = 'scheduled';

      let staffingStatus = 'scheduled';
      if (!r.is_active) staffingStatus = 'archived';
      else if (!staffingEnabled) staffingStatus = 'not_open';
      else if (assigned === 0 && remaining > 0) staffingStatus = 'needs_providers';
      else if (pending > 0 && remaining > 0) staffingStatus = 'requests_pending';
      else if (remaining > 0) staffingStatus = 'partially_staffed';
      else staffingStatus = 'fully_staffed';

      const isBackToSchool = String(r.event_type || '') === 'school_back_to_school';
      const featured = !!(r.outreach_table_invited || (staffingEnabled && remaining > 0 && assigned === 0));

      events.push({
        id: r.id,
        title: r.title,
        description: r.description,
        eventType: r.event_type,
        startsAt: r.starts_at,
        endsAt: r.ends_at,
        timezone: r.timezone,
        isActive: !!(r.is_active === 1 || r.is_active === true),
        schoolId: r.organization_id != null ? Number(r.organization_id) : null,
        schoolName: r.school_name || null,
        districtName: r.district_name || null,
        outreachTableInvited: !!r.outreach_table_invited,
        staffingEnabled,
        providerSignupEnabled,
        providersRequested: staffingEnabled ? requested : 0,
        providersAssigned: assigned,
        assignedProviders,
        pendingRequests: pending,
        remainingNeed: remaining,
        staffingStatus,
        lifecycleStatus,
        isBackToSchool,
        featured,
        portalVisible: !!(r.organization_id && r.is_active)
      });
    }

    const summary = {
      totalEvents: events.length,
      backToSchoolEvents: events.filter((e) => e.isBackToSchool).length,
      schoolsInvolved: new Set(events.map((e) => e.schoolId).filter(Boolean)).size,
      staffAssigned: events.reduce((sum, e) => sum + Number(e.providersAssigned || 0), 0),
      upcomingEvents: events.filter((e) => e.lifecycleStatus === 'upcoming' || e.lifecycleStatus === 'scheduled').length,
      completedEvents: events.filter((e) => e.lifecycleStatus === 'completed').length,
      pendingRequests: events.reduce((sum, e) => sum + Number(e.pendingRequests || 0), 0),
      needsProviders: events.filter((e) => e.staffingStatus === 'needs_providers' || e.staffingStatus === 'partially_staffed').length
    };

    res.json({ agencyId, refreshedAt: new Date().toISOString(), events, summary });
  } catch (e) {
    next(e);
  }
};

/**
 * Matching suggestions: open days ↔ pending school requests; understaffed events.
 */
export const getSuggestions = async (req, res, next) => {
  try {
    const agencyId = await resolveAgencyId(req);
    if (!(await assertAgencyAccess(req, res, agencyId))) return;
    if (!canManageCoverage(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const open = await getOpenSchoolDays(agencyId);
    const suggestions = [];

    try {
      const [reqRows] = await pool.execute(
        `SELECT r.id, r.provider_id, r.preferred_school_org_ids_json, r.created_at,
                u.first_name, u.last_name
         FROM provider_school_availability_requests r
         JOIN users u ON u.id = r.provider_id
         WHERE r.agency_id = ? AND r.status = 'PENDING'
         ORDER BY r.created_at ASC
         LIMIT 100`,
        [agencyId]
      );
      for (const r of reqRows || []) {
        const [blocks] = await pool.execute(
          `SELECT day_of_week FROM provider_school_availability_request_blocks WHERE request_id = ?`,
          [r.id]
        );
        const days = new Set((blocks || []).map((b) => b.day_of_week));
        let preferred = [];
        try {
          preferred = r.preferred_school_org_ids_json
            ? JSON.parse(r.preferred_school_org_ids_json)
            : [];
        } catch {
          preferred = [];
        }
        const matches = (open.days || []).filter((d) => {
          if (!days.has(d.dayOfWeek)) return false;
          if (preferred.length && !preferred.map(Number).includes(Number(d.schoolId))) return false;
          return d.urgency === 'high' || d.openSlots > 0;
        });
        if (matches.length) {
          suggestions.push({
            type: 'request_to_open_day',
            requestId: r.id,
            providerId: r.provider_id,
            providerName: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
            matches: matches.slice(0, 5)
          });
        }
      }
    } catch {
      /* non-blocking */
    }

    res.json({
      agencyId,
      refreshedAt: new Date().toISOString(),
      suggestions,
      openDayCount: open.summary?.total || 0
    });
  } catch (e) {
    next(e);
  }
};

/**
 * Expire stale pending school availability requests older than N days (default 30).
 */
export const expireStaleRequests = async (req, res, next) => {
  try {
    const agencyId = await resolveAgencyId(req);
    if (!(await assertAgencyAccess(req, res, agencyId))) return;
    if (!canManageCoverage(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const days = Math.min(180, Math.max(7, safeInt(req.body?.days) || 30));
    const [result] = await pool.execute(
      `UPDATE provider_school_availability_requests
       SET status = 'CANCELLED',
           resolved_at = NOW(),
           resolved_by_user_id = ?,
           notes = CONCAT(COALESCE(notes, ''), IF(notes IS NULL OR notes = '', '', '\n'), '[Expired after ', ?, ' days]'),
           updated_at = CURRENT_TIMESTAMP
       WHERE agency_id = ?
         AND status = 'PENDING'
         AND created_at < (NOW() - INTERVAL ? DAY)`,
      [req.user.id, days, agencyId, days]
    );
    res.json({ ok: true, expired: result?.affectedRows || 0, days });
  } catch (e) {
    next(e);
  }
};

/**
 * Open a school event for provider applications (staffing config + session dates).
 */
export const enableEventStaffing = async (req, res, next) => {
  try {
    const agencyId = await resolveAgencyId(req);
    if (!(await assertAgencyAccess(req, res, agencyId))) return;
    if (!canManageCoverage(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const eventId = safeInt(req.params.eventId || req.body?.eventId);
    if (!eventId) return res.status(400).json({ error: { message: 'eventId is required' } });
    const minProviders = safeInt(req.body?.minProvidersPerSession) || 1;
    const event = await enableSchoolEventProviderStaffing({
      eventId,
      agencyId,
      userId: req.user?.id,
      minProvidersPerSession: minProviders
    });
    res.json({ ok: true, event });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

/**
 * Upsert provider_school_assignments slots for a provider+school+day.
 * Same SoT path as /provider-scheduling/assignments (portal day sync included).
 */
export const upsertProviderDaySlots = async (req, res, next) => {
  try {
    const agencyId = await resolveAgencyId(req);
    if (!(await assertAgencyAccess(req, res, agencyId))) return;
    if (!canManageCoverage(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const providerUserId = safeInt(req.body?.providerUserId);
    const schoolOrganizationId = safeInt(req.body?.schoolOrganizationId);
    const dayOfWeek = normalizeDay(req.body?.dayOfWeek);
    const slotsTotal = parseInt(req.body?.slotsTotal, 10);
    const startTime = req.body?.startTime || null;
    const endTime = req.body?.endTime || null;
    const isActive =
      req.body?.isActive === undefined
        ? true
        : req.body.isActive === true || req.body.isActive === 'true' || req.body.isActive === 1;

    if (!providerUserId || !schoolOrganizationId || !dayOfWeek || !Number.isFinite(slotsTotal) || slotsTotal < 0) {
      return res.status(400).json({
        error: { message: 'providerUserId, schoolOrganizationId, dayOfWeek, and non-negative slotsTotal are required' }
      });
    }

    const [aff] = await pool.execute(
      `SELECT id FROM organization_affiliations
       WHERE agency_id = ? AND organization_id = ? AND is_active = TRUE
       LIMIT 1`,
      [agencyId, schoolOrganizationId]
    );
    if (!aff[0] && String(req.user?.role || '').toLowerCase() !== 'super_admin') {
      return res.status(403).json({ error: { message: 'School is not linked to this agency' } });
    }

    try {
      await pool.execute(
        `INSERT INTO user_agencies (user_id, agency_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE user_id = user_id`,
        [providerUserId, schoolOrganizationId]
      );
    } catch {
      /* best-effort */
    }

    const [existing] = await pool.execute(
      `SELECT id, slots_total, slots_available, start_time, end_time FROM provider_school_assignments
       WHERE provider_user_id = ? AND school_organization_id = ? AND day_of_week = ?
       LIMIT 1`,
      [providerUserId, schoolOrganizationId, dayOfWeek]
    );

    let rowId;
    if (!existing[0]) {
      const [result] = await pool.execute(
        `INSERT INTO provider_school_assignments
          (provider_user_id, school_organization_id, day_of_week, slots_total, slots_available, start_time, end_time, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          providerUserId,
          schoolOrganizationId,
          dayOfWeek,
          slotsTotal,
          slotsTotal,
          startTime,
          endTime,
          isActive ? 1 : 0
        ]
      );
      rowId = result.insertId;
    } else {
      const oldTotal = parseInt(existing[0].slots_total ?? 0, 10);
      const oldAvail = parseInt(existing[0].slots_available ?? 0, 10);
      const used = Math.max(0, oldTotal - oldAvail);
      const nextSlotsAvailable = Math.max(0, slotsTotal - used);
      const nextStart = startTime != null ? startTime : existing[0].start_time;
      const nextEnd = endTime != null ? endTime : existing[0].end_time;
      await pool.execute(
        `UPDATE provider_school_assignments
         SET slots_total = ?, slots_available = ?, start_time = ?, end_time = ?, is_active = ?
         WHERE id = ?`,
        [slotsTotal, nextSlotsAvailable, nextStart, nextEnd, isActive ? 1 : 0, existing[0].id]
      );
      rowId = existing[0].id;
    }

    await syncSchoolPortalDayProvider({
      schoolId: schoolOrganizationId,
      providerUserId,
      weekday: dayOfWeek,
      isActive,
      actorUserId: req.user?.id
    });

    const [rows] = await pool.execute(`SELECT * FROM provider_school_assignments WHERE id = ?`, [rowId]);
    res.json(rows[0] || null);
  } catch (e) {
    next(e);
  }
};
