import pool from '../config/database.js';
import User from '../models/User.model.js';
import {
  canManageProgramEvent,
  canViewProgramEvent
} from '../services/companyEventAccess.service.js';
import { userHasAgencyOrAffiliatedOrgAccessForRequest } from '../utils/userAgencyAffiliationAccess.js';
import {
  syncCompanySessionProviderBySlotBestEffort,
  cancelCompanySessionProvidersBeforeDelete
} from '../services/providerAssignmentGoogleSync.service.js';

const parsePositiveInt = (raw) => {
  const value = Number.parseInt(String(raw ?? ''), 10);
  return Number.isFinite(value) && value > 0 ? value : null;
};

async function userHasAgencyAccess(req, agencyId) {
  if (!agencyId) return false;
  if (String(req.user?.role || '').toLowerCase() === 'super_admin') return true;
  return userHasAgencyOrAffiliatedOrgAccessForRequest(req, agencyId);
}

async function getProgramCoordinatorAccess(userId) {
  try {
    const [rows] = await pool.execute(
      `SELECT has_skill_builder_coordinator_access FROM users WHERE id = ? LIMIT 1`,
      [userId]
    );
    const v = rows?.[0]?.has_skill_builder_coordinator_access;
    return v === true || v === 1 || v === '1';
  } catch (e) {
    if (e?.code === 'ER_BAD_FIELD_ERROR' || e?.code === 'ER_NO_SUCH_TABLE') return false;
    throw e;
  }
}

async function canViewProgramEventStaffing(req, agencyId, eventId) {
  if (!(await canViewProgramEvent(req, agencyId, eventId))) return false;
  return true;
}

async function canRequestShifts(req, agencyId) {
  if (!(await userHasAgencyAccess(req, agencyId))) return false;
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'super_admin' || role === 'admin' || role === 'support' || role === 'staff') return true;
  if (
    role === 'provider' ||
    role === 'provider_plus' ||
    role === 'intern' ||
    role === 'intern_plus' ||
    role === 'clinical_practice_assistant'
  ) {
    return true;
  }
  return getProgramCoordinatorAccess(parsePositiveInt(req.user?.id));
}

async function loadEventForAgency(eventId, agencyId) {
  const [rows] = await pool.execute(
    `SELECT id, agency_id, organization_id, event_type, staffing_config_json
     FROM company_events
     WHERE id = ? AND agency_id = ?
     LIMIT 1`,
    [eventId, agencyId]
  );
  return rows?.[0] || null;
}

async function ensureProgramEventScope(eventRow) {
  const t = String(eventRow?.event_type || '').trim().toLowerCase();
  if (t === 'skills_group') return { ok: false, status: 400, message: 'Staffing blocks are not available for Skill Builders events' };
  return { ok: true };
}

function parseStaffingConfigFromRow(row) {
  if (!row?.staffing_config_json) return null;
  try {
    const parsed = typeof row.staffing_config_json === 'string'
      ? JSON.parse(row.staffing_config_json)
      : row.staffing_config_json;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function computeRequiredProviders({ staffingConfig, confirmedClientsCount, groupCount }) {
  const cfg = staffingConfig && typeof staffingConfig === 'object' ? staffingConfig : null;
  const enabled = !!cfg?.enabled;
  if (!enabled) return { requiredProviders: 0, breakdown: { min: 0, clientRule: null, groupRule: null } };

  const minProviders = Number.isFinite(Number(cfg?.minProvidersPerSession))
    ? Math.max(0, Math.min(99, Number(cfg.minProvidersPerSession)))
    : 0;

  let clientRuleTotal = null;
  if (cfg?.clientRule?.enabled) {
    const stepSize = Math.max(1, Number(cfg.clientRule.confirmedStepSize || 1));
    const addPerStep = Math.max(0, Number(cfg.clientRule.additionalProvidersPerStep || 0));
    const threshold = cfg.clientRule.threshold == null ? 0 : Math.max(0, Number(cfg.clientRule.threshold || 0));
    const confirmed = Math.max(0, Number(confirmedClientsCount || 0));
    const over = Math.max(0, confirmed - threshold);
    const steps = over <= 0 ? 0 : Math.ceil(over / stepSize);
    clientRuleTotal = minProviders + (steps * addPerStep);
  }

  let groupRuleTotal = null;
  if (cfg?.groupRule?.enabled) {
    const base = Math.max(0, Number(cfg.groupRule.baseProvidersForOneGroup || 0));
    const addPer = Math.max(0, Number(cfg.groupRule.additionalProvidersPerGroup || 0));
    const groups = Math.max(0, Number(groupCount || 0));
    groupRuleTotal = groups <= 0 ? 0 : (base + (Math.max(0, groups - 1) * addPer));
  }

  const candidates = [
    minProviders,
    clientRuleTotal == null ? 0 : clientRuleTotal,
    groupRuleTotal == null ? 0 : groupRuleTotal
  ];
  const requiredProviders = Math.max(...candidates);
  return {
    requiredProviders,
    breakdown: { min: minProviders, clientRule: clientRuleTotal, groupRule: groupRuleTotal }
  };
}

async function assertSessionBelongsToEvent({ eventId, sessionDateId }) {
  const [rows] = await pool.execute(
    `SELECT id FROM company_event_session_dates WHERE id = ? AND company_event_id = ? LIMIT 1`,
    [eventId, sessionDateId]
  );
  return !!rows?.[0]?.id;
}

async function countConfirmedClientsForSession({ eventId, agencyId, sessionDateId }) {
  const [[hasAssignments]] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM company_event_client_group_assignments
     WHERE company_event_id = ? AND agency_id = ? AND session_date_id = ?`,
    [eventId, agencyId, sessionDateId]
  );
  const useAssignments = Number(hasAssignments?.total || 0) > 0;
  if (useAssignments) {
    const [[row]] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM company_event_client_group_assignments a
       INNER JOIN company_event_clients cec
         ON cec.company_event_id = a.company_event_id
        AND cec.agency_id = a.agency_id
        AND cec.client_id = a.client_id
       WHERE a.company_event_id = ?
         AND a.agency_id = ?
         AND a.session_date_id = ?
         AND (cec.is_active = 1 OR cec.is_active = TRUE)
         AND (cec.treatment_plan_complete = 1 OR cec.treatment_plan_complete = TRUE)`,
      [eventId, agencyId, sessionDateId]
    );
    return Number(row?.total || 0);
  }
  const [[row]] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM company_event_clients cec
     WHERE cec.company_event_id = ?
       AND cec.agency_id = ?
       AND (cec.is_active = 1 OR cec.is_active = TRUE)
       AND (cec.treatment_plan_complete = 1 OR cec.treatment_plan_complete = TRUE)`,
    [eventId, agencyId]
  );
  return Number(row?.total || 0);
}

async function countGroupsForSession({ eventId, sessionDateId }) {
  const [[row]] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM company_event_session_groups
     WHERE company_event_id = ? AND session_date_id = ?`,
    [eventId, sessionDateId]
  );
  return Number(row?.total || 0);
}

async function loadSessionRequestStats({ eventId, agencyId, sessionDateId }) {
  const [rows] = await pool.execute(
    `SELECT request_type, status, COUNT(*) AS total
     FROM company_event_session_provider_requests
     WHERE company_event_id = ? AND agency_id = ? AND session_date_id = ?
     GROUP BY request_type, status`,
    [eventId, agencyId, sessionDateId]
  );
  const out = {
    pending: { regular: 0, waitlist: 0, on_call: 0 },
    approved: { regular: 0, waitlist: 0, on_call: 0 },
    denied: { regular: 0, waitlist: 0, on_call: 0 },
    withdrawn: { regular: 0, waitlist: 0, on_call: 0 }
  };
  for (const r of rows || []) {
    const type = String(r.request_type || 'regular').toLowerCase();
    const status = String(r.status || 'pending').toLowerCase();
    const key = type === 'on_call' ? 'on_call' : (type === 'waitlist' ? 'waitlist' : 'regular');
    if (!out[status]) continue;
    out[status][key] = Number(r.total || 0);
  }
  return out;
}

async function loadApprovedProvidersCount({ eventId, agencyId, sessionDateId }) {
  const [[row]] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM company_event_session_providers
     WHERE company_event_id = ? AND agency_id = ? AND session_date_id = ?`,
    [eventId, agencyId, sessionDateId]
  );
  return Number(row?.total || 0);
}

async function loadApprovedProvidersForSession({ eventId, agencyId, sessionDateId }) {
  const [rows] = await pool.execute(
    `SELECT u.id, u.first_name, u.last_name, p.assignment_status
     FROM company_event_session_providers p
     INNER JOIN users u ON u.id = p.provider_user_id
     WHERE p.company_event_id = ? AND p.agency_id = ? AND p.session_date_id = ?
     ORDER BY u.last_name ASC, u.first_name ASC, u.id ASC`,
    [eventId, agencyId, sessionDateId]
  );
  return (rows || []).map((r) => ({
    id: Number(r.id),
    firstName: r.first_name || '',
    lastName: r.last_name || '',
    name: `${r.first_name || ''} ${r.last_name || ''}`.trim() || `Provider ${r.id}`,
    assignmentStatus: String(r.assignment_status || 'draft')
  }));
}

export const getCompanyEventSessionStaffingSummary = async (req, res, next) => {
  try {
    const eventId = parsePositiveInt(req.params.eventId);
    const agencyId = parsePositiveInt(req.query.agencyId);
    if (!eventId || !agencyId) {
      return res.status(400).json({ error: { message: 'eventId and agencyId are required' } });
    }
    if (!(await canViewProgramEventStaffing(req, agencyId, eventId))) {
      return res.status(403).json({ error: { message: 'Not authorized for this event' } });
    }

    const event = await loadEventForAgency(eventId, agencyId);
    if (!event) return res.status(404).json({ error: { message: 'Event not found' } });
    const scopeGate = await ensureProgramEventScope(event);
    if (!scopeGate.ok) return res.status(scopeGate.status).json({ error: { message: scopeGate.message } });

    const staffingConfig = parseStaffingConfigFromRow(event);

    const [sessions] = await pool.execute(
      `SELECT id, session_date, starts_at, ends_at, timezone
       FROM company_event_session_dates
       WHERE company_event_id = ?
       ORDER BY session_date ASC, starts_at ASC, id ASC`,
      [eventId]
    );

    const summaries = [];
    for (const s of sessions || []) {
      const sessionDateId = Number(s.id);
      const confirmedClientsCount = await countConfirmedClientsForSession({ eventId, agencyId, sessionDateId });
      const groupCount = await countGroupsForSession({ eventId, sessionDateId });
      const approvedProvidersCount = await loadApprovedProvidersCount({ eventId, agencyId, sessionDateId });
      const approvedProviders = await loadApprovedProvidersForSession({ eventId, agencyId, sessionDateId });
      const requestStats = await loadSessionRequestStats({ eventId, agencyId, sessionDateId });
      const required = computeRequiredProviders({ staffingConfig, confirmedClientsCount, groupCount });
      summaries.push({
        sessionDateId,
        sessionDate: s.session_date,
        startsAt: s.starts_at,
        endsAt: s.ends_at,
        timezone: s.timezone || 'UTC',
        confirmedClientsCount,
        groupCount,
        requiredProviders: required.requiredProviders,
        requiredProvidersBreakdown: required.breakdown,
        approvedProvidersCount,
        approvedProviders,
        requestStats
      });
    }

    res.json({
      ok: true,
      staffingConfig: staffingConfig || null,
      sessions: summaries
    });
  } catch (e) {
    if (String(e?.message || '').includes('company_event_session_provider_requests') || String(e?.message || '').includes('staffing_config_json')) {
      // Helpful hint when migrations haven't been run.
      return res.status(503).json({ error: { message: 'Run database migration 740_company_events_staffing_and_session_groups.sql' } });
    }
    next(e);
  }
};

export const listCompanyEventSessionGroups = async (req, res, next) => {
  try {
    const eventId = parsePositiveInt(req.params.eventId);
    const agencyId = parsePositiveInt(req.query.agencyId);
    const sessionDateId = req.query.sessionDateId ? parsePositiveInt(req.query.sessionDateId) : null;
    if (!eventId || !agencyId) {
      return res.status(400).json({ error: { message: 'eventId and agencyId are required' } });
    }
    if (!(await canViewProgramEventStaffing(req, agencyId, eventId))) {
      return res.status(403).json({ error: { message: 'Not authorized for this event' } });
    }
    const event = await loadEventForAgency(eventId, agencyId);
    if (!event) return res.status(404).json({ error: { message: 'Event not found' } });
    const scopeGate = await ensureProgramEventScope(event);
    if (!scopeGate.ok) return res.status(scopeGate.status).json({ error: { message: scopeGate.message } });
    if (req.query.sessionDateId && !sessionDateId) {
      return res.status(400).json({ error: { message: 'Invalid sessionDateId' } });
    }
    if (sessionDateId && !(await assertSessionBelongsToEvent({ eventId, sessionDateId }))) {
      return res.status(404).json({ error: { message: 'Session date not found for this event' } });
    }

    const params = [eventId];
    let where = 'WHERE company_event_id = ?';
    if (sessionDateId) {
      where += ' AND session_date_id = ?';
      params.push(sessionDateId);
    }

    const [rows] = await pool.execute(
      `SELECT id, company_event_id, session_date_id, label, age_min, age_max, created_at, updated_at
       FROM company_event_session_groups
       ${where}
       ORDER BY session_date_id ASC, label ASC, id ASC`,
      params
    );

    res.json({
      ok: true,
      groups: (rows || []).map((r) => ({
        id: Number(r.id),
        companyEventId: Number(r.company_event_id),
        sessionDateId: Number(r.session_date_id),
        label: String(r.label || ''),
        ageMin: r.age_min == null ? null : Number(r.age_min),
        ageMax: r.age_max == null ? null : Number(r.age_max),
        createdAt: r.created_at || null,
        updatedAt: r.updated_at || null
      }))
    });
  } catch (e) {
    if (String(e?.message || '').includes('company_event_session_groups')) {
      return res.status(503).json({ error: { message: 'Run database migration 740_company_events_staffing_and_session_groups.sql' } });
    }
    next(e);
  }
};

export const listCompanyEventSessionClientGroupAssignments = async (req, res, next) => {
  try {
    const eventId = parsePositiveInt(req.params.eventId);
    const agencyId = parsePositiveInt(req.query.agencyId);
    const sessionDateId = parsePositiveInt(req.query.sessionDateId);
    if (!eventId || !agencyId || !sessionDateId) {
      return res.status(400).json({ error: { message: 'eventId, agencyId, and sessionDateId are required' } });
    }
    if (!(await canViewProgramEventStaffing(req, agencyId, eventId))) {
      return res.status(403).json({ error: { message: 'Insufficient role to view assignments' } });
    }
    const event = await loadEventForAgency(eventId, agencyId);
    if (!event) return res.status(404).json({ error: { message: 'Event not found' } });
    const scopeGate = await ensureProgramEventScope(event);
    if (!scopeGate.ok) return res.status(scopeGate.status).json({ error: { message: scopeGate.message } });
    if (!(await assertSessionBelongsToEvent({ eventId, sessionDateId }))) {
      return res.status(404).json({ error: { message: 'Session date not found for this event' } });
    }

    const [rows] = await pool.execute(
      `SELECT client_id, group_id
       FROM company_event_client_group_assignments
       WHERE company_event_id = ? AND agency_id = ? AND session_date_id = ?
       ORDER BY client_id ASC`,
      [eventId, agencyId, sessionDateId]
    );

    res.json({
      ok: true,
      assignments: (rows || []).map((r) => ({
        clientId: Number(r.client_id),
        groupId: r.group_id == null ? null : Number(r.group_id)
      }))
    });
  } catch (e) {
    if (String(e?.message || '').includes('company_event_client_group_assignments')) {
      return res.status(503).json({ error: { message: 'Run database migration 740_company_events_staffing_and_session_groups.sql' } });
    }
    next(e);
  }
};

export const upsertCompanyEventSessionGroups = async (req, res, next) => {
  let conn = null;
  try {
    const eventId = parsePositiveInt(req.params.eventId);
    const agencyId = parsePositiveInt(req.body?.agencyId ?? req.query?.agencyId);
    const sessionDateId = parsePositiveInt(req.body?.sessionDateId ?? req.query?.sessionDateId);
    const rawGroups = Array.isArray(req.body?.groups) ? req.body.groups : [];

    if (!eventId || !agencyId || !sessionDateId) {
      return res.status(400).json({ error: { message: 'eventId, agencyId, and sessionDateId are required' } });
    }
    if (!(await canManageProgramEvent(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Insufficient role to manage session groups' } });
    }
    const event = await loadEventForAgency(eventId, agencyId);
    if (!event) return res.status(404).json({ error: { message: 'Event not found' } });
    const scopeGate = await ensureProgramEventScope(event);
    if (!scopeGate.ok) return res.status(scopeGate.status).json({ error: { message: scopeGate.message } });
    if (!(await assertSessionBelongsToEvent({ eventId, sessionDateId }))) {
      return res.status(404).json({ error: { message: 'Session date not found for this event' } });
    }

    const cleaned = rawGroups.map((g) => ({
      id: parsePositiveInt(g?.id),
      label: String(g?.label || '').trim().slice(0, 64),
      ageMin: g?.ageMin === '' || g?.ageMin === undefined || g?.ageMin === null ? null : parsePositiveInt(g?.ageMin),
      ageMax: g?.ageMax === '' || g?.ageMax === undefined || g?.ageMax === null ? null : parsePositiveInt(g?.ageMax)
    })).filter((g) => g.label);

    conn = await pool.getConnection();
    await conn.beginTransaction();

    const keepIds = cleaned.filter((g) => g.id).map((g) => Number(g.id));
    if (keepIds.length) {
      const ph = keepIds.map(() => '?').join(',');
      await conn.execute(
        `DELETE FROM company_event_session_groups
         WHERE company_event_id = ? AND session_date_id = ?
           AND id NOT IN (${ph})`,
        [eventId, sessionDateId, ...keepIds]
      );
    } else {
      await conn.execute(
        `DELETE FROM company_event_session_groups
         WHERE company_event_id = ? AND session_date_id = ?`,
        [eventId, sessionDateId]
      );
    }

    for (const g of cleaned) {
      if (g.id) {
        await conn.execute(
          `UPDATE company_event_session_groups
           SET label = ?, age_min = ?, age_max = ?
           WHERE id = ? AND company_event_id = ? AND session_date_id = ?`,
          [g.label, g.ageMin, g.ageMax, g.id, eventId, sessionDateId]
        );
      } else {
        await conn.execute(
          `INSERT INTO company_event_session_groups (company_event_id, session_date_id, label, age_min, age_max)
           VALUES (?, ?, ?, ?, ?)`,
          [eventId, sessionDateId, g.label, g.ageMin, g.ageMax]
        );
      }
    }

    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    if (conn) {
      try { await conn.rollback(); } catch {}
    }
    if (String(e?.message || '').includes('company_event_session_groups') || String(e?.message || '').includes('staffing_config_json')) {
      return res.status(503).json({ error: { message: 'Run database migration 740_company_events_staffing_and_session_groups.sql' } });
    }
    next(e);
  } finally {
    if (conn) conn.release();
  }
};

export const assignClientToSessionGroup = async (req, res, next) => {
  try {
    const eventId = parsePositiveInt(req.params.eventId);
    const groupIdParam = String(req.params.groupId || '').trim();
    const groupId = groupIdParam === '0' ? null : parsePositiveInt(groupIdParam);
    const agencyId = parsePositiveInt(req.body?.agencyId ?? req.query?.agencyId);
    const sessionDateId = parsePositiveInt(req.body?.sessionDateId ?? req.query?.sessionDateId);
    const clientId = parsePositiveInt(req.body?.clientId ?? req.query?.clientId);
    const userId = parsePositiveInt(req.user?.id);

    if (!eventId || !agencyId || !sessionDateId || !clientId || !userId) {
      return res.status(400).json({ error: { message: 'eventId, agencyId, sessionDateId, and clientId are required' } });
    }
    if (!(await canManageProgramEvent(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Insufficient role to assign session groups' } });
    }
    const event = await loadEventForAgency(eventId, agencyId);
    if (!event) return res.status(404).json({ error: { message: 'Event not found' } });
    const scopeGate = await ensureProgramEventScope(event);
    if (!scopeGate.ok) return res.status(scopeGate.status).json({ error: { message: scopeGate.message } });
    if (!(await assertSessionBelongsToEvent({ eventId, sessionDateId }))) {
      return res.status(404).json({ error: { message: 'Session date not found for this event' } });
    }

    if (groupId != null) {
      const [groupRows] = await pool.execute(
        `SELECT id FROM company_event_session_groups
         WHERE id = ? AND company_event_id = ? AND session_date_id = ?
         LIMIT 1`,
        [groupId, eventId, sessionDateId]
      );
      if (!groupRows?.length) return res.status(404).json({ error: { message: 'Group not found for this session' } });
    }

    await pool.execute(
      `INSERT INTO company_event_client_group_assignments
        (company_event_id, agency_id, client_id, session_date_id, group_id, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE group_id = VALUES(group_id), updated_at = CURRENT_TIMESTAMP`,
      [eventId, agencyId, clientId, sessionDateId, groupId, userId]
    );
    res.json({ ok: true });
  } catch (e) {
    if (String(e?.message || '').includes('company_event_client_group_assignments')) {
      return res.status(503).json({ error: { message: 'Run database migration 740_company_events_staffing_and_session_groups.sql' } });
    }
    next(e);
  }
};

export const listMyCompanyEventSessionRequests = async (req, res, next) => {
  try {
    const eventId = parsePositiveInt(req.params.eventId);
    const agencyId = parsePositiveInt(req.query.agencyId);
    const userId = parsePositiveInt(req.user?.id);
    if (!eventId || !agencyId || !userId) {
      return res.status(400).json({ error: { message: 'eventId and agencyId are required' } });
    }
    if (!(await canRequestShifts(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized for this agency' } });
    }
    const event = await loadEventForAgency(eventId, agencyId);
    if (!event) return res.status(404).json({ error: { message: 'Event not found' } });
    const scopeGate = await ensureProgramEventScope(event);
    if (!scopeGate.ok) return res.status(scopeGate.status).json({ error: { message: scopeGate.message } });

    const [rows] = await pool.execute(
      `SELECT r.id, r.session_date_id, r.request_type, r.status, r.created_at, r.updated_at, r.decided_at,
              sd.session_date, sd.starts_at, sd.ends_at, sd.timezone
       FROM company_event_session_provider_requests r
       LEFT JOIN company_event_session_dates sd ON sd.id = r.session_date_id
       WHERE r.company_event_id = ? AND r.agency_id = ? AND r.provider_user_id = ?
       ORDER BY COALESCE(sd.session_date, '9999-12-31') ASC, r.id ASC`,
      [eventId, agencyId, userId]
    );
    res.json({
      ok: true,
      requests: (rows || []).map((r) => ({
        id: Number(r.id),
        sessionDateId: Number(r.session_date_id),
        requestType: String(r.request_type || 'regular'),
        status: String(r.status || 'pending'),
        createdAt: r.created_at || null,
        updatedAt: r.updated_at || null,
        decidedAt: r.decided_at || null,
        sessionDate: r.session_date || null,
        startsAt: r.starts_at || null,
        endsAt: r.ends_at || null,
        timezone: r.timezone || 'UTC'
      }))
    });
  } catch (e) {
    if (String(e?.message || '').includes('company_event_session_provider_requests')) {
      return res.status(503).json({ error: { message: 'Run database migration 740_company_events_staffing_and_session_groups.sql' } });
    }
    next(e);
  }
};

export const createCompanyEventSessionRequest = async (req, res, next) => {
  try {
    const eventId = parsePositiveInt(req.params.eventId);
    const agencyId = parsePositiveInt(req.body?.agencyId ?? req.query?.agencyId);
    const sessionDateId = parsePositiveInt(req.body?.sessionDateId ?? req.query?.sessionDateId);
    const userId = parsePositiveInt(req.user?.id);
    const requestTypeRaw = String(req.body?.requestType ?? req.body?.request_type ?? 'regular').trim().toLowerCase();
    const requestType = requestTypeRaw === 'on_call' ? 'on_call' : (requestTypeRaw === 'waitlist' ? 'waitlist' : 'regular');

    if (!eventId || !agencyId || !sessionDateId || !userId) {
      return res.status(400).json({ error: { message: 'eventId, agencyId, and sessionDateId are required' } });
    }
    if (!(await canRequestShifts(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized to request shifts' } });
    }
    const event = await loadEventForAgency(eventId, agencyId);
    if (!event) return res.status(404).json({ error: { message: 'Event not found' } });
    const scopeGate = await ensureProgramEventScope(event);
    if (!scopeGate.ok) return res.status(scopeGate.status).json({ error: { message: scopeGate.message } });
    if (!(await assertSessionBelongsToEvent({ eventId, sessionDateId }))) {
      return res.status(404).json({ error: { message: 'Session date not found for this event' } });
    }

    const [existing] = await pool.execute(
      `SELECT id, status FROM company_event_session_provider_requests
       WHERE company_event_id = ? AND agency_id = ? AND session_date_id = ? AND provider_user_id = ?
       LIMIT 1`,
      [eventId, agencyId, sessionDateId, userId]
    );
    if (existing?.[0]?.id) {
      const status = String(existing[0].status || 'pending').toLowerCase();
      if (status === 'pending' || status === 'approved') {
        return res.json({ ok: true, id: Number(existing[0].id), status });
      }
      await pool.execute(
        `UPDATE company_event_session_provider_requests
         SET request_type = ?, status = 'pending', decided_by_user_id = NULL, decided_at = NULL, decision_note = NULL
         WHERE id = ?`,
        [requestType, Number(existing[0].id)]
      );
      return res.json({ ok: true, id: Number(existing[0].id), status: 'pending' });
    }

    const [result] = await pool.execute(
      `INSERT INTO company_event_session_provider_requests
        (company_event_id, agency_id, session_date_id, provider_user_id, request_type, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [eventId, agencyId, sessionDateId, userId, requestType]
    );
    res.status(201).json({ ok: true, id: Number(result.insertId), status: 'pending' });
  } catch (e) {
    if (String(e?.message || '').includes('company_event_session_provider_requests')) {
      return res.status(503).json({ error: { message: 'Run database migration 740_company_events_staffing_and_session_groups.sql' } });
    }
    next(e);
  }
};

export const withdrawCompanyEventSessionRequest = async (req, res, next) => {
  try {
    const eventId = parsePositiveInt(req.params.eventId);
    const requestId = parsePositiveInt(req.params.requestId);
    const agencyId = parsePositiveInt(req.body?.agencyId ?? req.query?.agencyId);
    const userId = parsePositiveInt(req.user?.id);
    if (!eventId || !requestId || !agencyId || !userId) {
      return res.status(400).json({ error: { message: 'eventId, agencyId, and requestId are required' } });
    }
    if (!(await canRequestShifts(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized' } });
    }
    const [rows] = await pool.execute(
      `SELECT id, provider_user_id, session_date_id, status
       FROM company_event_session_provider_requests
       WHERE id = ? AND company_event_id = ? AND agency_id = ?
       LIMIT 1`,
      [requestId, eventId, agencyId]
    );
    if (!rows?.length) return res.status(404).json({ error: { message: 'Request not found' } });
    if (Number(rows[0].provider_user_id) !== Number(userId)) {
      return res.status(403).json({ error: { message: 'Cannot withdraw another user’s request' } });
    }
    await pool.execute(
      `UPDATE company_event_session_provider_requests
       SET status = 'withdrawn'
       WHERE id = ?`,
      [requestId]
    );
    res.json({ ok: true });
  } catch (e) {
    if (String(e?.message || '').includes('company_event_session_provider_requests')) {
      return res.status(503).json({ error: { message: 'Run database migration 740_company_events_staffing_and_session_groups.sql' } });
    }
    next(e);
  }
};

export const listCompanyEventSessionRequests = async (req, res, next) => {
  try {
    const eventId = parsePositiveInt(req.params.eventId);
    const agencyId = parsePositiveInt(req.query.agencyId);
    const sessionDateId = parsePositiveInt(req.query.sessionDateId);
    if (!eventId || !agencyId || !sessionDateId) {
      return res.status(400).json({ error: { message: 'eventId, agencyId, and sessionDateId are required' } });
    }
    if (!(await canManageProgramEvent(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Insufficient role to view requests' } });
    }
    const event = await loadEventForAgency(eventId, agencyId);
    if (!event) return res.status(404).json({ error: { message: 'Event not found' } });
    const scopeGate = await ensureProgramEventScope(event);
    if (!scopeGate.ok) return res.status(scopeGate.status).json({ error: { message: scopeGate.message } });
    if (!(await assertSessionBelongsToEvent({ eventId, sessionDateId }))) {
      return res.status(404).json({ error: { message: 'Session date not found for this event' } });
    }

    const [rows] = await pool.execute(
      `SELECT r.id, r.provider_user_id, r.session_date_id, r.request_type, r.status, r.created_at, r.decided_at,
              u.first_name, u.last_name, u.email
       FROM company_event_session_provider_requests r
       INNER JOIN users u ON u.id = r.provider_user_id
       WHERE r.company_event_id = ? AND r.agency_id = ? AND r.session_date_id = ?
       ORDER BY
         FIELD(r.status, 'pending', 'approved', 'denied', 'withdrawn') ASC,
         FIELD(r.request_type, 'regular', 'on_call', 'waitlist') ASC,
         r.created_at ASC`,
      [eventId, agencyId, sessionDateId]
    );

    res.json({
      ok: true,
      requests: (rows || []).map((r) => ({
        id: Number(r.id),
        providerUserId: Number(r.provider_user_id),
        providerName: `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.email || `User ${r.provider_user_id}`,
        providerEmail: r.email || null,
        sessionDateId: Number(r.session_date_id),
        requestType: String(r.request_type || 'regular'),
        status: String(r.status || 'pending'),
        createdAt: r.created_at || null,
        decidedAt: r.decided_at || null
      }))
    });
  } catch (e) {
    if (String(e?.message || '').includes('company_event_session_provider_requests')) {
      return res.status(503).json({ error: { message: 'Run database migration 740_company_events_staffing_and_session_groups.sql' } });
    }
    next(e);
  }
};

export const approveCompanyEventSessionRequest = async (req, res, next) => {
  let conn = null;
  try {
    const eventId = parsePositiveInt(req.params.eventId);
    const requestId = parsePositiveInt(req.params.requestId);
    const agencyId = parsePositiveInt(req.body?.agencyId ?? req.query?.agencyId);
    const userId = parsePositiveInt(req.user?.id);
    if (!eventId || !requestId || !agencyId || !userId) {
      return res.status(400).json({ error: { message: 'eventId, agencyId, and requestId are required' } });
    }
    if (!(await canManageProgramEvent(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Insufficient role to approve requests' } });
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [rows] = await conn.execute(
      `SELECT id, provider_user_id, session_date_id
       FROM company_event_session_provider_requests
       WHERE id = ? AND company_event_id = ? AND agency_id = ?
       LIMIT 1 FOR UPDATE`,
      [requestId, eventId, agencyId]
    );
    if (!rows?.length) {
      await conn.rollback();
      return res.status(404).json({ error: { message: 'Request not found' } });
    }
    const providerUserId = Number(rows[0].provider_user_id);
    const sessionDateId = Number(rows[0].session_date_id);

    await conn.execute(
      `UPDATE company_event_session_provider_requests
       SET status = 'approved', decided_by_user_id = ?, decided_at = NOW()
       WHERE id = ?`,
      [userId, requestId]
    );
    await conn.execute(
      `INSERT INTO company_event_session_providers
        (company_event_id, agency_id, session_date_id, provider_user_id, assigned_by_user_id, assigned_at)
       VALUES (?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE assigned_by_user_id = VALUES(assigned_by_user_id), assigned_at = VALUES(assigned_at)`,
      [eventId, agencyId, sessionDateId, providerUserId, userId]
    );

    await conn.commit();
    syncCompanySessionProviderBySlotBestEffort({ sessionDateId, providerUserId }).catch(() => {});
    res.json({ ok: true });
  } catch (e) {
    if (conn) {
      try { await conn.rollback(); } catch {}
    }
    if (String(e?.message || '').includes('company_event_session_provider_requests') || String(e?.message || '').includes('company_event_session_providers')) {
      return res.status(503).json({ error: { message: 'Run database migration 740_company_events_staffing_and_session_groups.sql' } });
    }
    next(e);
  } finally {
    if (conn) conn.release();
  }
};

export const denyCompanyEventSessionRequest = async (req, res, next) => {
  let conn = null;
  try {
    const eventId = parsePositiveInt(req.params.eventId);
    const requestId = parsePositiveInt(req.params.requestId);
    const agencyId = parsePositiveInt(req.body?.agencyId ?? req.query?.agencyId);
    const userId = parsePositiveInt(req.user?.id);
    if (!eventId || !requestId || !agencyId || !userId) {
      return res.status(400).json({ error: { message: 'eventId, agencyId, and requestId are required' } });
    }
    if (!(await canManageProgramEvent(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Insufficient role to deny requests' } });
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [rows] = await conn.execute(
      `SELECT id, provider_user_id, session_date_id
       FROM company_event_session_provider_requests
       WHERE id = ? AND company_event_id = ? AND agency_id = ?
       LIMIT 1 FOR UPDATE`,
      [requestId, eventId, agencyId]
    );
    if (!rows?.length) {
      await conn.rollback();
      return res.status(404).json({ error: { message: 'Request not found' } });
    }
    const providerUserId = Number(rows[0].provider_user_id);
    const sessionDateId = Number(rows[0].session_date_id);

    await conn.execute(
      `UPDATE company_event_session_provider_requests
       SET status = 'denied', decided_by_user_id = ?, decided_at = NOW()
       WHERE id = ?`,
      [userId, requestId]
    );
    await cancelCompanySessionProvidersBeforeDelete({
      companyEventId: eventId,
      agencyId,
      sessionDateId,
      providerUserId
    });
    await conn.execute(
      `DELETE FROM company_event_session_providers
       WHERE company_event_id = ? AND agency_id = ? AND session_date_id = ? AND provider_user_id = ?`,
      [eventId, agencyId, sessionDateId, providerUserId]
    );

    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    if (conn) {
      try { await conn.rollback(); } catch {}
    }
    if (String(e?.message || '').includes('company_event_session_provider_requests') || String(e?.message || '').includes('company_event_session_providers')) {
      return res.status(503).json({ error: { message: 'Run database migration 740_company_events_staffing_and_session_groups.sql' } });
    }
    next(e);
  } finally {
    if (conn) conn.release();
  }
};

