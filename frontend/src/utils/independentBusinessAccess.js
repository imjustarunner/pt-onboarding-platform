// Display permission only. Every financial API independently checks live ownership.
export function ownsIndependentBusiness(user, agencyId, agencies = []) {
  const uid = Number(user?.id), aid = Number(agencyId);
  if (!Number.isSafeInteger(uid) || uid < 1 || !Number.isSafeInteger(aid) || aid < 1) return false;
  return agencies.some(agency => agency && Number(agency.id) === aid
    && Number(agency.account_owner_user_id) === uid
    && ['life_coach', 'consultant'].includes(agency.organization_type || agency.organizationType)
    && ![false, 0, '0'].includes(agency.is_active)
    && ![true, 1, '1'].includes(agency.is_archived)
    && ![false, 0, '0'].includes(agency.membership_active));
}
