import {readAgencyAccess} from './agencyAccessProfiles.service.js';
import {STAFF_ROLES} from '../utils/staffEligibility.js';
// Preparing compensation remains separately authorized. Countersigning is
// available to a currently authorized hiring employee specifically designated
// on this issued agreement, without requiring an administrator role.
export async function employeeCompensationCountersignerAccess(user,agencyId,db) {
  if(!user?.id)return false;
  const access=await readAgencyAccess(user.id,agencyId,db);
  if(!access||access.membership?.is_active===0)return false;
  return ['admin','super_admin'].includes(access.role)
    || STAFF_ROLES.includes(access.role)&&access.permissions?.has_hiring_access===true;
}
