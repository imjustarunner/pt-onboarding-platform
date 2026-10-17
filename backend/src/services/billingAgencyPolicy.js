// Medical billing belongs to care agencies, never to their programs or demo workspaces.
export function isBillingAgency(agency) {
  let flags = agency?.feature_flags || {};
  if (typeof flags === 'string') { try { flags = JSON.parse(flags); } catch { return false; } }
  return agency?.organization_type === 'agency'
    && ![true, 1, '1', 'true'].includes(flags?.billingAccountExcluded)
    && ![0, false, '0'].includes(agency.is_active)
    && ![1, true, '1'].includes(agency.is_archived);
}
