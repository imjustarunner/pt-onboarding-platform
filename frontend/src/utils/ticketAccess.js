const enabled = value => [true, 1, '1'].includes(value);
const roles = new Set(['admin', 'super_admin', 'support', 'staff', 'clinical_practice_assistant', 'provider_plus']);

/** Navigation hints only; the API checks current agency membership and grants. */
export function canAccessTicketDesk(user, agencyId = null, effectiveRole = user?.role) {
  if (!user || enabled(user.is_assistant_account) || String(user.role).toLowerCase() === 'assistant') return false;
  if (roles.has(String(effectiveRole || '').toLowerCase())) return true;
  const aid = Number(agencyId);
  const scoped = ['billingAgencyIds', 'payrollAgencyIds', 'credentialingAgencyIds'].some(key =>
    Array.isArray(user[key]) && user[key].some(id => !aid || Number(id) === aid));
  if (scoped) return true;
  const memberships = user.agencies || user.agencyIds || [];
  return Array.isArray(memberships) && memberships.some(m => m && typeof m === 'object'
    && (!aid || Number(m.agency_id ?? m.id) === aid) && ![false, 0, '0'].includes(m.is_active)
    && (roles.has(String(m.agency_role || '').toLowerCase())
      || ['has_billing_access', 'has_payroll_access', 'can_manage_credentialing'].some(key => enabled(m[key]))
      || enabled(user.hasMedicalRecordsReleaseAccess ?? user.has_medical_records_release_access)));
}
