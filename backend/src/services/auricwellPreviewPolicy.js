// The administrator preview reuses shared EHR services. It is not a customer login.
export const previewError = (status, message) => Object.assign(new Error(message), { status });
export function previewAgencySlug(value) {
  const slug = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) throw previewError(400, 'Choose a practice.');
  return slug === 'innerstrength' ? 'tisi' : slug;
}
export function assertPreviewActor(user, claims = {}) {
  if (user?.role !== 'super_admin' || claims.demoMode || claims.testAccountSwitch || !user?.id || !user.is_active || ['ARCHIVED', 'INACTIVE_EMPLOYEE'].includes(user.status)) {
    throw previewError(403, 'AuricWell practice preview requires your active superadmin account.');
  }
}
export function constrainPreviewInput(input, agencyId) {
  if (!input || typeof input !== 'object') return;
  for (const [key, value] of Object.entries(input)) {
    if (['agencyId', 'agency_id', 'organizationId', 'organization_id'].includes(key) && value != null && value !== '' && Number(value) !== agencyId) {
      throw previewError(403, 'This request belongs to a different practice.');
    }
    if (['agencyIds', 'agency_ids'].includes(key) && value != null && String(value) !== String(agencyId)) {
      throw previewError(403, 'Choose one practice for AuricWell.');
    }
    if (value && typeof value === 'object') constrainPreviewInput(value, agencyId);
  }
}
export function previewRouteAllowed(method, path) {
  if (method === 'GET') return [
    /^\/auricwell-preview(?:\/context|\/providers)?$/,
    /^\/clinical-notes\/(?:context|programs|recent|work-queue|termination-outcomes)$/,
    /^\/note-aid\/(?:catalog|tools)$/,
    /^\/me\/notes-to-sign(?:\/count)?$/,
    /^\/medical-billing\/(?:workspace|service-locations|service-codes|config|supervised-payer-policies|supervised-provider-readiness|payer-eft|claims|claimmd|reports|clients|notes|treatment-plans|treatment-frequencies|agencies)(?:\/|$)/,
    /^\/clients(?:\/\d+(?:\/(?:guardians|records-copy-blocks|intake-note|clinical-responses))?)?$/,
    /^\/appointments(?:\/\d+)?$/,
    /^\/users\/\d+\/preferences$/,
    /^\/agencies\/\d+$/,
    /^\/clinical-data\/sessions\/\d+\/artifacts$/
  ].some(pattern => pattern.test(path));
  // Only reviewed shared documentation writes are enabled in the administrator preview.
  // Live claim transmission and financial setup stay in the existing billing workspace
  // until the complete AuricWell revenue-cycle acceptance is finished.
  return [
    ['POST', /^\/clinical-notes\/(?:drafts|audit|generate|interactive-complexity)$/],
    ['PATCH', /^\/clinical-notes\/drafts\/\d+$/]
  ].some(([verb, pattern]) => verb === method && pattern.test(path));
}
