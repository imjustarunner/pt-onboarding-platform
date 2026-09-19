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
