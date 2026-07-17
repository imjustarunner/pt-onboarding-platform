import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import PayrollIndirectServiceType from '../models/PayrollIndirectServiceType.model.js';
import PayrollIndirectTimeSession from '../models/PayrollIndirectTimeSession.model.js';

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

async function assertHourlyWorker(req, res) {
  if (isAdminRole(req.user?.role)) return true;
  const [rows] = await pool.execute(
    'SELECT is_hourly_worker FROM users WHERE id = ? LIMIT 1',
    [req.user.id]
  );
  const flag = rows?.[0]?.is_hourly_worker;
  if (!(flag === 1 || flag === true || flag === '1')) {
    res.status(403).json({ error: { message: 'Indirect time logging is for hourly employees only' } });
    return false;
  }
  return true;
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
    if (!(await assertHourlyWorker(req, res))) return;
    const types = await PayrollIndirectServiceType.listForAgency({ agencyId, activeOnly: true });
    res.json({ types });
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

export const getMyIndirectTimeSession = async (req, res, next) => {
  try {
    const agencyId = await resolveAgencyId(req);
    if (!(await assertAgencyMembership(req, res, agencyId))) return;
    if (!(await assertHourlyWorker(req, res))) return;
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
    if (!(await assertHourlyWorker(req, res))) return;
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
    if (!(await assertHourlyWorker(req, res))) return;
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
    if (!(await assertHourlyWorker(req, res))) return;
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
    if (!(await assertHourlyWorker(req, res))) return;
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
