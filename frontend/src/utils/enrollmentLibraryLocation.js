/** Link packet management to its agency, even when opened from a school portal. */
export function enrollmentLibraryLocation({agencyId, agencies = [], setting = 'office', service = 'counseling', audience = 'guardian', locale = 'en', schoolId} = {}) {
  const id = Number(agencyId);
  const agency = agencies.find(item => item && Number(item.id) === id);
  const slug = String(agency?.slug || agency?.portal_url || '').trim();
  const query = {section: 'enrollment', setting, service, audience, locale};
  if (Number.isSafeInteger(id) && id > 0) query.agencyId = String(id);
  if (setting === 'school' && Number(schoolId) > 0) query.schoolId = String(schoolId);
  return {path: slug ? `/${encodeURIComponent(slug)}/library` : '/library', query};
}
