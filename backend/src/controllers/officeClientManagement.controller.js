import pool from '../config/database.js';
import User from '../models/User.model.js';
import * as OfficeClients from '../services/officeClientManagement.service.js';

function safeInt(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function parseAgencyIds(query = {}, body = {}) {
  const raw = query.agencyIds ?? body.agencyIds ?? null;
  const out = [];
  const seen = new Set();
  const push = (v) => {
    const n = safeInt(v);
    if (!n || seen.has(n)) return;
    seen.add(n);
    out.push(n);
  };
  if (Array.isArray(raw)) raw.forEach(push);
  else if (typeof raw === 'string' && raw.trim()) {
    raw.split(',').forEach((p) => push(p.trim()));
  }
  push(query.agencyId ?? body.agencyId);
  return out;
}

const BACKOFFICE_ROLES = new Set(['admin', 'super_admin', 'support', 'staff']);

function isBackoffice(role) {
  return BACKOFFICE_ROLES.has(String(role || '').toLowerCase());
}

async function assertAgencyAccess(req, agencyId) {
  const user = req.user;
  if (!user) return false;
  if (String(user.role || '').toLowerCase() === 'super_admin') return true;
  const ua = user.agencies || user.userAgencies || [];
  if (Array.isArray(ua) && ua.some((a) => Number(a.id || a.agency_id) === Number(agencyId))) {
    return true;
  }
  if (Number(user.agencyId) === Number(agencyId)) return true;
  try {
    const [rows] = await pool.execute(
      `SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1`,
      [user.id, agencyId]
    );
    return Boolean(rows?.[0]);
  } catch {
    return false;
  }
}

async function assertAgenciesAccess(req, agencyIds) {
  const ids = (agencyIds || []).map((n) => safeInt(n)).filter(Boolean);
  if (!ids.length) return { ok: false, status: 400, message: 'agencyId or agencyIds is required' };
  for (const id of ids) {
    if (!(await assertAgencyAccess(req, id))) {
      return { ok: false, status: 403, message: 'Forbidden' };
    }
  }
  return { ok: true, agencyIds: ids };
}

async function assertOfficeStaff(req, agencyIds) {
  const access = await assertAgenciesAccess(req, agencyIds);
  if (!access.ok) return access;
  const requestingUser = await User.findById(req.user.id);
  const isSupervisor = requestingUser && User.isSupervisor(requestingUser);
  if (!isBackoffice(req.user.role) && !isSupervisor) {
    return { ok: false, status: 403, message: 'Support/admin access required' };
  }
  return { ok: true, agencyIds: access.agencyIds };
}

/** GET /api/office-clients?agencyId=&agencyIds=&bucket=&search=&sort= */
export async function listOfficeClients(req, res, next) {
  try {
    const agencyIds = parseAgencyIds(req.query);
    const gate = await assertOfficeStaff(req, agencyIds);
    if (!gate.ok) return res.status(gate.status).json({ error: { message: gate.message } });

    const result = await OfficeClients.listOfficeClients({
      agencyIds: gate.agencyIds,
      bucket: req.query.bucket || 'all',
      providerId: safeInt(req.query.providerId),
      preferredProviderId: safeInt(req.query.preferredProviderId),
      whoFor: req.query.whoFor || null,
      needsAction: String(req.query.needsAction || '') === '1' || String(req.query.needsAction || '') === 'true',
      clinicalReview:
        String(req.query.clinicalReview || '') === '1'
        || String(req.query.clinicalReview || '') === 'true',
      search: req.query.search || '',
      sort: req.query.sort || 'submitted',
      limit: safeInt(req.query.limit) || 200
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
}

/** GET /api/office-clients/hub-summary?agencyId=&agencyIds= */
export async function getOfficeHubSummary(req, res, next) {
  try {
    const agencyIds = parseAgencyIds(req.query);
    const gate = await assertOfficeStaff(req, agencyIds);
    if (!gate.ok) return res.status(gate.status).json({ error: { message: gate.message } });
    const summary = await OfficeClients.getOfficeHubSummary({ agencyIds: gate.agencyIds });
    res.json({ summary });
  } catch (e) {
    next(e);
  }
}

/** GET /api/office-clients/units?agencyId= */
export async function listOfficeTherapyUnits(req, res, next) {
  try {
    const agencyId = safeInt(req.query.agencyId) || parseAgencyIds(req.query)[0];
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const gate = await assertOfficeStaff(req, [agencyId]);
    if (!gate.ok) return res.status(gate.status).json({ error: { message: gate.message } });
    const units = await OfficeClients.listOfficeTherapyUnits({ agencyId });
    res.json({ units });
  } catch (e) {
    next(e);
  }
}

/** GET /api/office-clients/providers?agencyId=&agencyIds= */
export async function listOfficeHubProviders(req, res, next) {
  try {
    const agencyIds = parseAgencyIds(req.query);
    const gate = await assertOfficeStaff(req, agencyIds);
    if (!gate.ok) return res.status(gate.status).json({ error: { message: gate.message } });
    const providers = await OfficeClients.listHubProviders({ agencyIds: gate.agencyIds });
    res.json({ providers });
  } catch (e) {
    next(e);
  }
}

/** PUT /api/office-clients/:id/waitlist */
export async function putOfficeClientWaitlist(req, res, next) {
  try {
    const clientId = safeInt(req.params.id);
    const agencyId = safeInt(req.body?.agencyId || req.query.agencyId);
    if (!clientId || !agencyId) {
      return res.status(400).json({ error: { message: 'clientId and agencyId are required' } });
    }
    const gate = await assertOfficeStaff(req, [agencyId]);
    if (!gate.ok) return res.status(gate.status).json({ error: { message: gate.message } });

    const result = await OfficeClients.setOfficeClientWaitlist({
      clientId,
      agencyId,
      reason: req.body?.reason || '',
      priority: req.body?.priority || null,
      followUpAt: req.body?.followUpAt || null,
      actorUserId: req.user.id,
      remove: !!req.body?.remove
    });
    res.json(result);
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
}
