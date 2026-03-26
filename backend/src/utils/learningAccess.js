import Client from '../models/Client.model.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import User from '../models/User.model.js';

const ROLE_ALLOWLIST_BY_AGENCY = new Set([
  'admin',
  'support',
  'staff',
  'provider',
  'provider_plus',
  'clinical_practice_assistant',
  'intern',
  'intern_plus'
]);

export async function assertLearningClientAccess(req, clientId) {
  const cid = Number.parseInt(clientId, 10);
  if (!Number.isInteger(cid) || cid <= 0) {
    const err = new Error('Invalid studentId');
    err.status = 400;
    throw err;
  }

  if (!req.user?.id) {
    const err = new Error('Authentication required');
    err.status = 401;
    throw err;
  }

  const role = String(req.user.role || '').toLowerCase();
  if (role === 'super_admin') {
    return { clientId: cid };
  }

  if (role === 'guardian' || role === 'client_guardian') {
    const linked = await ClientGuardian.listClientsForGuardian({ guardianUserId: req.user.id });
    const allowed = linked.some((row) => Number(row.client_id) === cid);
    if (!allowed) {
      const err = new Error('You do not have access to this student');
      err.status = 403;
      throw err;
    }
    return { clientId: cid };
  }

  const client = await Client.findById(cid, { includeSensitive: false });
  if (!client) {
    const err = new Error('Student not found');
    err.status = 404;
    throw err;
  }

  if (!ROLE_ALLOWLIST_BY_AGENCY.has(role)) {
    const err = new Error('Access denied');
    err.status = 403;
    throw err;
  }

  const agencies = await User.getAgencies(req.user.id);
  const agencyIds = new Set((agencies || []).map((a) => Number(a.id)).filter((n) => Number.isInteger(n) && n > 0));
  const clientAgencyId = Number(client.agency_id || 0);
  const clientOrgId = Number(client.organization_id || 0);

  if (!agencyIds.has(clientAgencyId) && !agencyIds.has(clientOrgId)) {
    const err = new Error('You do not have access to this student');
    err.status = 403;
    throw err;
  }

  return { clientId: cid, client };
}
