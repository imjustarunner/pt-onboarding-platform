import pool from '../config/database.js';
import { agencyAvailability } from '../utils/providerAgencyAvailability.js';
import { deriveCredentialTier } from '../utils/clinicalServiceCodeEligibility.js';

const CARE_ROLES = new Set(['provider', 'provider_plus', 'intern', 'intern_plus', 'facilitator', 'qbha', 'supervisor', 'admin', 'super_admin']);
const enabled = value => [true, 1, '1'].includes(value);

// Credentials classify a person's qualifications; they never authorize client care.
// An explicit tenant role takes precedence over global provider access.
export function staffCareEligibility(person, agencyId) {
  const agencyRole = String(person?.agency_role || '').trim().toLowerCase();
  const role = agencyRole || String(person?.role || '').trim().toLowerCase();
  const policy = agencyAvailability(person?.public_details_json, agencyId);
  const seesClients = policy ? policy.seesClients === true : enabled(person?.sees_clients);
  const careRoleAssigned = CARE_ROLES.has(role) || (!agencyRole && enabled(person?.has_provider_access));
  const active = enabled(person?.is_active) && enabled(person?.membership_active)
    && ['ACTIVE', 'ACTIVE_EMPLOYEE'].includes(person?.status);
  const canProvideCare = active && careRoleAssigned && seesClients;
  return {
    credential: person?.credential || '',
    credentialTier: deriveCredentialTier({ userRole: role, providerCredentialText: person?.credential }),
    agencyRole: role,
    seesClients,
    careRoleAssigned,
    canProvideCare,
    reason: !active ? 'An active agency relationship is required.'
      : !careRoleAssigned ? 'An administrator must assign a client-facing role or provider access.'
        : !seesClients ? 'Sees clients is off for this agency.' : null
  };
}

export async function readStaffCareEligibility(userId, agencyId, database = pool) {
  if (!Number(userId) || !Number(agencyId)) return staffCareEligibility(null, agencyId);
  const [[person]] = await database.execute(`SELECT u.role,u.credential,u.status,u.is_active,u.sees_clients,u.has_provider_access,
    ua.agency_role,COALESCE(ua.is_active,1) AS membership_active,p.public_details_json
    FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=?
    LEFT JOIN provider_public_profiles p ON p.user_id=u.id WHERE u.id=?`, [agencyId, userId]);
  return staffCareEligibility(person, agencyId);
}

export async function requireStaffCareEligibility(userId, agencyId, database = pool) {
  const eligibility = await readStaffCareEligibility(userId, agencyId, database);
  if (!eligibility.canProvideCare) throw Object.assign(new Error(`Client care is not enabled for this person in this agency. ${eligibility.reason}`), {
    status: 403, code: 'CARE_PROVIDER_ASSIGNMENT_REQUIRED'
  });
  return eligibility;
}
