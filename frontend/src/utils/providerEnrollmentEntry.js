const CARE_FORMATS = [
  { format: 'IN_PERSON', key: 'inPerson', label: 'In person' },
  { format: 'VIRTUAL', key: 'virtual', label: 'Virtual' }
];

// Enrollment decisions use the current, agency-scoped schedule response. A
// published time or a directory badge must not override a closed intake status.
export function providerEnrollmentFormats(schedule) {
  return CARE_FORMATS
    .map((item) => ({ ...item, status: schedule?.[item.key]?.status }))
    .filter((item) => ['accepting', 'waitlist'].includes(item.status))
    .sort((a, b) => Number(a.status === 'waitlist') - Number(b.status === 'waitlist'));
}

export function providerEnrollmentPath({ agencySlug, providerId, serviceType = 'counseling', format, query = {} }) {
  const servicePath = agencySlug === 'nlu' && serviceType === 'tutoring' ? 'learning' : serviceType;
  return {
    path: `/join/${encodeURIComponent(agencySlug)}/${servicePath}`,
    query: { ...query, enrollmentSource: 'provider', providerId: String(providerId), serviceType, ...(format ? { format } : {}) }
  };
}

export function fullProviderEnrollmentPath({ config, schedule, providerId, serviceType, format, query = {} }) {
  if (!config?.pathways?.full?.enabled || !config.pathways.full.publicKey) {
    throw new Error('Full enrollment is not available right now. Please contact our team for help enrolling with this provider.');
  }
  const option = providerEnrollmentFormats(schedule).find((item) => item.format === format);
  if (!option) throw new Error('This provider is closed to new clients in this setting. Please choose another available setting or provider.');
  return {
    path: `/intake/${encodeURIComponent(config.pathways.full.publicKey)}`,
    query: { ...query, enrollmentSource: 'provider', providerId: String(providerId), serviceType, format }
  };
}
