import User from '../models/User.model.js';
import { readAgencyAccess } from './agencyAccessProfiles.service.js';
import { applyAgencyAccess } from '../utils/agencyAccessPolicy.js';
import { getUserCapabilities } from '../utils/capabilities.js';

/** Historical applicant broadcasts do not grant candidate access. Resolve the
 * current effective hiring capability for each agency before counting/showing. */
export async function hiringNotificationAgencyIds(user, agencyIds = null, {
  agencies = id => User.getAgencies(id), access = readAgencyAccess,
  capabilities = getUserCapabilities, apply = applyAgencyAccess
} = {}) {
  if (!user?.id || ['client','guardian','client_guardian','school_staff'].includes(String(user.role))) return new Set();
  // Global superadmin authority is canonical; a mobile request still supplies
  // its freshly restricted agency list before reaching this function.
  if (user.role === 'super_admin' && agencyIds == null) return null;
  const ids = [...new Set((agencyIds || (await agencies(user.id)).map(a => a.id)).map(Number))].filter(id => Number.isSafeInteger(id) && id > 0);
  if (user.role === 'super_admin') return new Set(ids);
  const eligible = await Promise.all(ids.map(async id => {
    const grant = await access(user.id, id);
    return grant && capabilities(apply(user, grant)).canManageHiring === true ? id : null;
  }));
  return new Set(eligible.filter(Boolean));
}

export function hiringNotificationVisible(notification, agencyIds) {
  return notification?.type !== 'new_job_application_submitted' || agencyIds === null
    || agencyIds instanceof Set && agencyIds.has(Number(notification.agency_id));
}
