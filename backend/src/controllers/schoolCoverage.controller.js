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
import pool from '../config/database.js';

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
             ce.staffing_config_json, a.name AS school_name
      FROM company_events ce
      LEFT JOIN agencies a ON a.id = ce.organization_id
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

    const [rows] = await pool.execute(sql, params);
    const events = [];
    for (const r of rows || []) {
      let assigned = 0;
      let pending = 0;
      let requested = 1;
      try {
        const cfg =
          typeof r.staffing_config_json === 'string'
            ? JSON.parse(r.staffing_config_json)
            : r.staffing_config_json || {};
        requested = Number(cfg?.minProvidersPerSession || 1) || 1;
      } catch {
        requested = 1;
      }
      try {
        const [aRows] = await pool.execute(
          `SELECT COUNT(DISTINCT csp.provider_user_id) AS cnt
           FROM company_event_session_providers csp
           JOIN company_event_session_dates csd ON csd.id = csp.session_date_id
           WHERE csd.company_event_id = ?`,
          [r.id]
        );
        assigned = Number(aRows?.[0]?.cnt || 0);
      } catch {
        assigned = 0;
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
      const remaining = Math.max(0, requested - assigned);
      let staffingStatus = 'scheduled';
      if (!r.is_active) staffingStatus = 'archived';
      else if (assigned === 0 && remaining > 0) staffingStatus = 'needs_providers';
      else if (pending > 0 && remaining > 0) staffingStatus = 'requests_pending';
      else if (remaining > 0) staffingStatus = 'partially_staffed';
      else staffingStatus = 'fully_staffed';

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
        outreachTableInvited: !!r.outreach_table_invited,
        providersRequested: requested,
        providersAssigned: assigned,
        pendingRequests: pending,
        remainingNeed: remaining,
        staffingStatus,
        portalVisible: !!(r.organization_id && r.is_active)
      });
    }

    res.json({ agencyId, refreshedAt: new Date().toISOString(), events });
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
