import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';

export const PRACTITIONER_ORG_TYPES = Object.freeze(['life_coach', 'consultant']);

export const PRACTITIONER_ASSISTANT_CAPABILITIES = Object.freeze([
  'clients',
  'inquiries',
  'calendar',
  'discovery',
  'packets',
  'messages'
]);

export const DEFAULT_PRACTITIONER_ASSISTANT_PERMISSIONS = Object.freeze({
  clients: true,
  inquiries: true,
  calendar: true,
  discovery: true,
  packets: true,
  messages: true
});

export function isPractitionerOrgType(orgType) {
  return PRACTITIONER_ORG_TYPES.includes(String(orgType || '').toLowerCase());
}

export function isPractitionerOwnerRole(role) {
  const r = String(role || '').toLowerCase();
  return r === 'admin' || r === 'super_admin';
}

export function normalizePractitionerAssistantPermissions(raw) {
  let parsed = raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }
  }
  if (!parsed || typeof parsed !== 'object') parsed = {};
  const out = {};
  for (const key of PRACTITIONER_ASSISTANT_CAPABILITIES) {
    out[key] = parsed[key] === true;
  }
  return out;
}

export function permissionsFromInviteBody(body) {
  const base = { ...DEFAULT_PRACTITIONER_ASSISTANT_PERMISSIONS };
  if (!body || typeof body !== 'object') return base;
  const src = body.permissions && typeof body.permissions === 'object' ? body.permissions : body;
  for (const key of PRACTITIONER_ASSISTANT_CAPABILITIES) {
    if (Object.prototype.hasOwnProperty.call(src, key)) {
      base[key] = src[key] === true;
    }
  }
  return base;
}

export async function assertPractitionerAgency(agencyId) {
  const id = Number(agencyId || 0);
  if (!id) {
    const err = new Error('agencyId required');
    err.status = 400;
    throw err;
  }
  const agency = await Agency.findById(id);
  if (!agency) {
    const err = new Error('Agency not found');
    err.status = 404;
    throw err;
  }
  if (!isPractitionerOrgType(agency.organization_type)) {
    const err = new Error('Team management is only available for life coach and consultant tenants');
    err.status = 400;
    throw err;
  }
  return agency;
}

export async function userBelongsToAgency(userId, agencyId) {
  const uid = Number(userId || 0);
  const aid = Number(agencyId || 0);
  if (!uid || !aid) return false;
  const [rows] = await pool.execute(
    `SELECT 1 AS ok FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1`,
    [uid, aid]
  );
  return !!rows?.[0];
}

export async function getPractitionerAssistantPermissions(userId, agencyId) {
  const uid = Number(userId || 0);
  const aid = Number(agencyId || 0);
  if (!uid || !aid) return normalizePractitionerAssistantPermissions(null);
  const [rows] = await pool.execute(
    `SELECT practitioner_assistant_permissions_json
     FROM user_agencies
     WHERE user_id = ? AND agency_id = ?
     LIMIT 1`,
    [uid, aid]
  );
  return normalizePractitionerAssistantPermissions(rows?.[0]?.practitioner_assistant_permissions_json);
}

export async function setPractitionerAssistantPermissions(userId, agencyId, permissions) {
  const uid = Number(userId || 0);
  const aid = Number(agencyId || 0);
  const normalized = normalizePractitionerAssistantPermissions(permissions);
  await pool.execute(
    `UPDATE user_agencies
     SET practitioner_assistant_permissions_json = ?
     WHERE user_id = ? AND agency_id = ?`,
    [JSON.stringify(normalized), uid, aid]
  );
  return normalized;
}

/**
 * Owners always pass. Staff assistants need the capability flag.
 * Other roles are denied for practitioner-scoped capability checks.
 * Returns true if allowed; throws Error with .status if not.
 */
export async function requirePractitionerCapability(req, agencyId, capabilityKey) {
  const role = String(req.user?.role || '').toLowerCase();
  if (isPractitionerOwnerRole(role) || role === 'support') {
    return true;
  }

  const aid = Number(agencyId || 0);
  if (!aid) {
    const err = new Error('agencyId required');
    err.status = 400;
    throw err;
  }

  const belongs = await userBelongsToAgency(req.user?.id, aid);
  if (!belongs) {
    const err = new Error('Access denied');
    err.status = 403;
    throw err;
  }

  if (role !== 'staff') {
    const err = new Error('Access denied');
    err.status = 403;
    throw err;
  }

  const key = String(capabilityKey || '').trim();
  if (!PRACTITIONER_ASSISTANT_CAPABILITIES.includes(key)) {
    const err = new Error('Invalid capability');
    err.status = 400;
    throw err;
  }

  const perms = await getPractitionerAssistantPermissions(req.user.id, aid);
  if (perms[key] !== true) {
    const err = new Error(`Missing permission: ${key}`);
    err.status = 403;
    throw err;
  }
  return true;
}

/** Catalog CRUD / settings / team invite — owners (and support) only. */
export function requirePractitionerOwner(req) {
  const role = String(req.user?.role || '').toLowerCase();
  if (isPractitionerOwnerRole(role) || role === 'support') return true;
  const err = new Error('Owner access required');
  err.status = 403;
  throw err;
}
