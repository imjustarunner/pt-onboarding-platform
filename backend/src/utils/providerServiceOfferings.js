/** An explicit per-agency selection overrides legacy discovery defaults. */
export function offersProviderService(details, agencyId, serviceType, { enrolled = false, hasEnrollment = false, counselingEligible = false } = {}) {
  let value = details;
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { value = {}; } }
  const selected = value?.serviceOfferingsByAgency?.[String(agencyId)];
  if (Array.isArray(selected)) return selected.includes(serviceType);
  return enrolled || (serviceType === 'counseling' && !hasEnrollment && counselingEligible);
}
export function validateProviderServices(selected, enabled) {
  if (!Array.isArray(selected) || selected.some(type => typeof type !== 'string' || !enabled.includes(type))) {
    const error = new Error('Choose only services enabled for this agency.'); error.status = 400; throw error;
  }
  return [...new Set(selected)];
}

/** Shared by individual settings and the staff roster so defaults stay identical. */
export function providerServiceSettings(person, agencyId, types, enrollments) {
  const role = person?.agency_role || person?.role;
  const counselingEligible = ['ACTIVE','ACTIVE_EMPLOYEE'].includes(String(person?.status || '').toUpperCase()) && (['provider','provider_plus','intern','intern_plus','facilitator','supervisor','admin','super_admin'].includes(role) || Boolean(person?.has_provider_access));
  return types.map(type => {
    const enrollment = enrollments.find(e => e.service_type === type.service_type);
    return { serviceType: type.service_type, displayName: type.display_name || type.service_type,
      offered: offersProviderService(person?.public_details_json, agencyId, type.service_type, {enrolled: Boolean(enrollment?.is_active) || (!enrollment && ['coaching','consulting'].includes(type.service_type) && ['life_coach','consultant'].includes(person?.organization_type) && person?.status === 'ACTIVE_EMPLOYEE' && ['admin','provider','provider_plus','super_admin','staff'].includes(person?.role)), hasEnrollment: Boolean(enrollment), counselingEligible}),
      onlineScheduling: Boolean(enrollment?.is_active) };
  });
}
