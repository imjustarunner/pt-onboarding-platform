import { productBillingContext } from './productBillingContext.service.js';
import User from '../models/User.model.js';
import { userHasCredentialingAccessForAgency, expandCredentialingAgencyIds } from '../utils/capabilities.js';

// Minted only after an authenticated product adapter verifies practice permissions.
// A JSON property on a user or request cannot grant credentialing access.
const productGrants = new WeakMap();
export function createCredentialingActor(user, agencyId) {
  const actor = Object.freeze({ ...user });
  return grantCredentialingActor(actor, agencyId);
}
export function grantCredentialingActor(actor, agencyId) {
  productGrants.set(actor, Number(agencyId));
  return actor;
}
export function credentialingProductAgency(user) { return productGrants.get(user) || null; }

export async function canAccessCredentialing(user, agencyId) {
  if (!user?.id || !Number.isSafeInteger(Number(agencyId)) || Number(agencyId) < 1) return false;
  const grant = credentialingProductAgency(user);
  if (grant) return grant === Number(agencyId);
  if (productBillingContext(user)) return false;
  if (user.role === 'super_admin') return true;
  if (user.agencyAccess) return Number(user.agencyAccess.agencyId) === Number(agencyId) && user.agencyAccess.permissions?.can_manage_credentialing === true;
  if (!['admin', 'staff', 'support', 'provider', 'provider_plus', 'supervisor', 'clinical_practice_assistant', 'billing'].includes(user.role)) return false;
  if (user.role === 'admin' && !await (await import('./agencyAccessProfiles.service.js')).accessProfileSchemaReady()) {
    const agencies = await User.getAgencies(user.id);
    if (agencies.some(a => Number(a.id) === Number(agencyId) && a.is_active !== false && a.is_active !== 0)) return true;
  }
  return userHasCredentialingAccessForAgency(user.id, agencyId, { role: user.role });
}
export async function requireCredentialingAccess(user, agencyId) {
  if (!await canAccessCredentialing(user, agencyId))
    throw Object.assign(new Error('Credentialing permission is required for this agency.'), { status: 403, statusCode: 403 });
}

export async function appendCredentialingTicketVisibility(user, where, params) {
  if (user?.role === 'super_admin') return;
  const ids = ['staff','support','provider','provider_plus','supervisor','clinical_practice_assistant','billing'].includes(user?.role) ? await credentialingAgencyIds(user.id) : [];
  where.push(`(LOWER(COALESCE(t.topic,'')) <> 'credentialing'${ids.length ? ` OR t.agency_id IN (${ids.map(() => '?').join(',')})` : ''})`);
  params.push(...ids);
}

export async function credentialingAgencyIds(userId) {
  const ids = await User.listCredentialingAgencyIds(userId);
  return expandCredentialingGrants(ids);
}
export async function expandCredentialingGrants(ids) {
  const { accessProfileSchemaReady } = await import('./agencyAccessProfiles.service.js');
  return await accessProfileSchemaReady() ? [...new Set(ids.map(Number))] : expandCredentialingAgencyIds(ids);
}
