import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import PayrollIndirectServiceType from '../models/PayrollIndirectServiceType.model.js';
import PayrollUserIndirectServiceAssignment from '../models/PayrollUserIndirectServiceAssignment.model.js';
import PayrollIndirectTimeSession from '../models/PayrollIndirectTimeSession.model.js';
import { normalizePayBucket } from '../utils/hourlyDualRateContract.js';

const isAdminRole = (role) => {
  const r = String(role || '').trim().toLowerCase();
  return r === 'admin' || r === 'super_admin';
};

async function resolveAgencyId(req) {
  const raw = req.query?.agencyId ?? req.body?.agencyId ?? req.params?.agencyId;
  const agencyId = Number(raw);
  return Number.isFinite(agencyId) && agencyId > 0 ? agencyId : null;
}

async function assertAgencyMembership(req, res, agencyId) {
  if (!agencyId) {
    res.status(400).json({ error: { message: 'agencyId is required' } });
    return false;
  }
  if (isAdminRole(req.user?.role)) return true;
  const [rows] = await pool.execute(
    'SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
    [req.user.id, agencyId]
  );
  if (!rows?.length) {
    res.status(403).json({ error: { message: 'Access denied' } });
    return false;
  }
  return true;
}

async function loadLogTimeCapabilities(userId) {
  const [rows] = await pool.execute(
    `SELECT is_hourly_worker, hourly_dual_rate_enabled, has_supervisor_privileges, role
     FROM users WHERE id = ? LIMIT 1`,
    [Number(userId)]
  );
  const u = rows?.[0] || {};
  const isHourly = u.is_hourly_worker === 1 || u.is_hourly_worker === true || u.is_hourly_worker === '1';
  const isSupervisor =
    u.has_supervisor_privileges === 1
    || u.has_supervisor_privileges === true
    || u.has_supervisor_privileges === '1'
    || String(u.role || '').toLowerCase() === 'supervisor';
  return { isHourly, isSupervisor, userRow: u };
}

/** Role-gate which Log Time category columns a user may select. */
export function filterServiceTypesForUser(types, { isHourly, isSupervisor }) {
  const list = Array.isArray(types) ? types : [];
  return list.filter((t) => {
    const bucket = normalizePayBucket(t?.payBucket || t?.pay_bucket);
    if (bucket === 'indirect') return !!isHourly;
    if (bucket === 'support' || bucket === 'other_1') return true;
    if (bucket === 'supervision_note') return !!isSupervisor;
    return false;
  });
}

function withLiveElapsed(session) {
  if (!session) return null;
  const workedSeconds = PayrollIndirectTimeSession.workedSeconds(session);
  return {
    ...session,
    workedSeconds,
    workedMinutes: Math.floor(workedSeconds / 60)
  };
}

export const listMyIndirectServiceTypes = async (req, res, next) => {
  try {
    const agencyId = await resolveAgencyId(req);
    if (!(await assertAgencyMembership(req, res, agencyId))) return;
    const caps = await loadLogTimeCapabilities(req.user.id);
    const types = await PayrollUserIndirectServiceAssignment.listMergedTypesForUser({
      agencyId,
      userId: req.user.id,
      activeOnly: true
    });
    const filtered = isAdminRole(req.user?.role)
      ? types
      : filterServiceTypesForUser(types, caps);
    res.json({
      types: filtered,
      capabilities: {
        isHourly: caps.isHourly,
        isSupervisor: caps.isSupervisor,
        showIndirectService: caps.isHourly,
        showSupportActivity: true,
        showSupervisionNote: caps.isSupervisor
      }
    });
  } catch (e) {
    next(e);
  }
};

export const listIndirectServiceTypes = async (req, res, next) => {
  try {
    const agencyId = await resolveAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!isAdminRole(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    const agency = await Agency.findById(agencyId);
    if (!agency) return res.status(404).json({ error: { message: 'Agency not found' } });
    const types = await PayrollIndirectServiceType.listForAgency({ agencyId, activeOnly: false });
    res.json({ types });
  } catch (e) {
    next(e);
  }
};

export const createIndirectServiceType = async (req, res, next) => {
  try {
    const agencyId = await resolveAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!isAdminRole(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    const body = req.body || {};
    const label = String(body.label || '').trim();
    if (!label) return res.status(400).json({ error: { message: 'label is required' } });
    const created = await PayrollIndirectServiceType.create({
      agencyId,
      typeKey: body.typeKey || label,
      label,
      description: body.description || '',
      iconKey: body.iconKey || 'circle',
      payBucket: body.payBucket || body.pay_bucket || 'indirect',
      sortOrder: body.sortOrder,
      isActive: body.isActive !== false
    });
    res.status(201).json(created);
  } catch (e) {
    if (String(e?.code || '') === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: { message: 'A type with this key already exists' } });
    }
    next(e);
  }
};

export const updateIndirectServiceType = async (req, res, next) => {
  try {
    if (!isAdminRole(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: { message: 'id is required' } });
    }
    const existing = await PayrollIndirectServiceType.findById(id);
    if (!existing) return res.status(404).json({ error: { message: 'Type not found' } });
    const updated = await PayrollIndirectServiceType.update(id, req.body || {});
    res.json(updated);
  } catch (e) {
    if (String(e?.code || '') === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: { message: 'A type with this key already exists' } });
    }
    next(e);
  }
};

export const deleteIndirectServiceType = async (req, res, next) => {
  try {
    if (!isAdminRole(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: { message: 'id is required' } });
    }
    const existing = await PayrollIndirectServiceType.findById(id);
    if (!existing) return res.status(404).json({ error: { message: 'Type not found' } });
    const updated = await PayrollIndirectServiceType.softDelete(id);
    res.json(updated);
  } catch (e) {
    next(e);
  }
};

/** Admin: per-user Log Time duty assignments (enable/disable agency types + rate overrides). */
export const getUserLogTimeDuties = async (req, res, next) => {
  try {
    if (!isAdminRole(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    const agencyId = await resolveAgencyId(req);
    const userId = Number(req.params.userId || req.query.userId || 0);
    if (!agencyId || !userId) {
      return res.status(400).json({ error: { message: 'agencyId and userId are required' } });
    }
    const [agencyTypes, assignments, merged] = await Promise.all([
      PayrollIndirectServiceType.listForAgency({ agencyId, activeOnly: false }),
      PayrollUserIndirectServiceAssignment.listForUser({ agencyId, userId }),
      PayrollUserIndirectServiceAssignment.listMergedTypesForUser({ agencyId, userId, activeOnly: false })
    ]);
    res.json({ agencyTypes, assignments, mergedTypes: merged });
  } catch (e) {
    next(e);
  }
};

export const putUserLogTimeDuties = async (req, res, next) => {
  try {
    if (!isAdminRole(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    const agencyId = await resolveAgencyId(req);
    const userId = Number(req.params.userId || 0);
    if (!agencyId || !userId) {
      return res.status(400).json({ error: { message: 'agencyId and userId are required' } });
    }
    const assignments = await PayrollUserIndirectServiceAssignment.upsertForUser({
      agencyId,
      userId,
      assignments: req.body?.assignments || []
    });
    const mergedTypes = await PayrollUserIndirectServiceAssignment.listMergedTypesForUser({
      agencyId,
      userId,
      activeOnly: false
    });
    res.json({ assignments, mergedTypes });
  } catch (e) {
    next(e);
  }
};

/** Admin: list users who have a specific service type in their custom duty assignment list. */
export const getUsersAssignedToType = async (req, res, next) => {
  try {
    if (!isAdminRole(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    const agencyId = await resolveAgencyId(req);
    const serviceTypeId = Number(req.query.serviceTypeId || req.params.serviceTypeId || 0);
    if (!agencyId || !serviceTypeId) {
      return res.status(400).json({ error: { message: 'agencyId and serviceTypeId required' } });
    }

    // Load explicit assignments
    const [rows] = await pool.execute(
      `SELECT pua.user_id, u.first_name, u.last_name, u.email
       FROM payroll_user_indirect_service_assignments pua
       JOIN users u ON u.id = pua.user_id
       WHERE pua.agency_id = ? AND pua.service_type_id = ? AND pua.is_enabled = 1
       ORDER BY u.last_name ASC, u.first_name ASC`,
      [agencyId, serviceTypeId]
    );
    const assignments = (rows || []).map((r) => ({
      userId: Number(r.user_id),
      name: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
      email: r.email || ''
    }));

    // For supervision_note bucket types OR types with 'supervision' in the key/label,
    // also return agency supervisors as suggestions
    const typeRow = await PayrollIndirectServiceType.findById(serviceTypeId);
    const bucketIsSupervision = normalizePayBucket(typeRow?.payBucket) === 'supervision_note';
    const keyHasSupervision = /supervis/i.test(typeRow?.typeKey || '') || /supervis/i.test(typeRow?.label || '');
    let suggestedSupervisors = [];
    if (bucketIsSupervision || keyHasSupervision) {
      // Check whether has_supervisor_privileges column exists
      let hasSuperCol = false;
      try {
        const [colCheck] = await pool.execute(
          `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
           AND COLUMN_NAME = 'has_supervisor_privileges' LIMIT 1`
        );
        hasSuperCol = !!(colCheck && colCheck.length);
      } catch { hasSuperCol = false; }

      const supCondition = hasSuperCol
        ? `(u.role = 'supervisor' OR u.has_supervisor_privileges = 1)`
        : `u.role = 'supervisor'`;

      const [supRows] = await pool.execute(
        `SELECT DISTINCT u.id, u.first_name, u.last_name, u.email
         FROM users u
         JOIN user_agencies ua ON ua.user_id = u.id
         WHERE ua.agency_id = ?
           AND ${supCondition}
           AND (u.is_archived = FALSE OR u.is_archived IS NULL)
         ORDER BY u.last_name ASC, u.first_name ASC`,
        [agencyId]
      );
      const assignedIds = new Set(assignments.map((a) => a.userId));
      suggestedSupervisors = (supRows || [])
        .filter((r) => !assignedIds.has(Number(r.id)))
        .map((r) => ({
          userId: Number(r.id),
          name: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
          email: r.email || ''
        }));
    }

    res.json({ assignments, suggestedSupervisors });
  } catch (e) {
    next(e);
  }
};

export const getMyIndirectTimeSession = async (req, res, next) => {
  try {
    const agencyId = await resolveAgencyId(req);
    if (!(await assertAgencyMembership(req, res, agencyId))) return;
    const session = await PayrollIndirectTimeSession.findOpenForUser({
      agencyId,
      userId: req.user.id
    });
    res.json({ session: withLiveElapsed(session) });
  } catch (e) {
    next(e);
  }
};

export const clockInIndirectTime = async (req, res, next) => {
  try {
    const agencyId = await resolveAgencyId(req);
    if (!(await assertAgencyMembership(req, res, agencyId))) return;
    const session = await PayrollIndirectTimeSession.clockIn({
      agencyId,
      userId: req.user.id
    });
    res.status(201).json({ session: withLiveElapsed(session) });
  } catch (e) {
    next(e);
  }
};

export const breakIndirectTime = async (req, res, next) => {
  try {
    const agencyId = await resolveAgencyId(req);
    if (!(await assertAgencyMembership(req, res, agencyId))) return;
    const action = String(req.body?.action || 'start').trim().toLowerCase();
    let session = await PayrollIndirectTimeSession.findOpenForUser({
      agencyId,
      userId: req.user.id
    });
    if (!session) return res.status(400).json({ error: { message: 'No active session' } });
    if (action === 'end' || action === 'resume') {
      session = await PayrollIndirectTimeSession.endBreak(session.id);
    } else {
      session = await PayrollIndirectTimeSession.startBreak(session.id);
    }
    res.json({ session: withLiveElapsed(session) });
  } catch (e) {
    next(e);
  }
};

export const clockOutIndirectTime = async (req, res, next) => {
  try {
    const agencyId = await resolveAgencyId(req);
    if (!(await assertAgencyMembership(req, res, agencyId))) return;
    const open = await PayrollIndirectTimeSession.findOpenForUser({
      agencyId,
      userId: req.user.id
    });
    if (!open) return res.status(400).json({ error: { message: 'No active session' } });
    const session = await PayrollIndirectTimeSession.clockOut(open.id);
    res.json({ session: withLiveElapsed(session) });
  } catch (e) {
    next(e);
  }
};

/** PATCH — move a closed session's clock-out earlier (correction). */
export const adjustIndirectTimeClockOut = async (req, res, next) => {
  try {
    const agencyId = await resolveAgencyId(req);
    if (!(await assertAgencyMembership(req, res, agencyId))) return;
    const sessionId = Number(req.params?.id || req.body?.sessionId);
    if (!Number.isFinite(sessionId) || sessionId <= 0) {
      return res.status(400).json({ error: { message: 'session id is required' } });
    }
    const clockedOutAt = req.body?.clockedOutAt;
    if (!clockedOutAt) {
      return res.status(400).json({ error: { message: 'clockedOutAt is required' } });
    }
    try {
      const session = await PayrollIndirectTimeSession.adjustClockOutEarlier(sessionId, {
        userId: req.user.id,
        agencyId,
        clockedOutAt
      });
      if (!session) {
        return res.status(404).json({ error: { message: 'Session not found' } });
      }
      res.json({ session: withLiveElapsed(session) });
    } catch (e) {
      if (e?.status === 400) {
        return res.status(400).json({ error: { message: e.message } });
      }
      throw e;
    }
  } catch (e) {
    next(e);
  }
};
