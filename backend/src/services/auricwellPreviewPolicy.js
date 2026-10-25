// Shared EHR access: existing administrator preview plus explicitly scoped QA staff.
import { AURICWELL_QA_SLUG } from '../utils/auricwellQaPolicy.js';
export { AURICWELL_QA_SLUG };
export const previewError = (status, message) => Object.assign(new Error(message), { status });
export function previewAgencySlug(value) {
  const slug = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) throw previewError(400, 'Choose a practice.');
  return slug === 'innerstrength' ? 'tisi' : slug;
}
export function isQaPreviewIdentity(user) {
  const roles = { 'qa.provider.auricwell@example.com':'provider', 'qa.support.auricwell@example.com':'support', 'qa.setup.auricwell@example.com':'admin' };
  return Number(user?.is_demo) === 1 && Object.hasOwn(roles,String(user?.email||'').toLowerCase())
    && roles[String(user.email).toLowerCase()] === user.role;
}
export function assertPreviewActor(user, claims = {}, { qaAgencyId = null } = {}) {
  const qaAccess = isQaPreviewIdentity(user) && Number.isSafeInteger(qaAgencyId) && qaAgencyId > 0;
  if ((user?.role !== 'super_admin' && !qaAccess) || claims.demoMode || claims.testAccountSwitch || !user?.id || !user.is_active || user.is_archived || ['ARCHIVED', 'INACTIVE_EMPLOYEE','TERMINATED_PENDING'].includes(user.status)) {
    throw previewError(403, 'This account does not have access to this AuricWell workspace.');
  }
}
export function assertQaPreviewPractice(req, agency) {
  if (req.auricwellQaAgencyId && (agency?.slug !== AURICWELL_QA_SLUG || Number(agency.id) !== req.auricwellQaAgencyId))
    throw previewError(404, 'Practice unavailable.');
}
export function qaPreviewRouteAllowed(method, path, user, agencyId) {
  if (/^\/platform\//.test(path)) return false;
  if (/^\/auricwell-preview\/toasts(?:\/|$)/.test(path) && path !== '/auricwell-preview/toasts/active') return false;
  const agency = path.match(/^\/agencies\/(\d+)/);
  if (agency && Number(agency[1]) !== agencyId) return false;
  const preferences = path.match(/^\/users\/(\d+)\/preferences$/);
  if (preferences && Number(preferences[1]) !== Number(user.id)) return false;
  // Keep the real role downstream. Support does not acquire clinical write access.
  if (user.role === 'support' && method !== 'GET') return false;
  return previewRouteAllowed(method,path);
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
    /^\/auricwell-preview(?:\/context|\/providers|\/tasks|\/notifications|\/toasts(?:\/active)?)?$/,
    /^\/platform\/toast-announcements$/,
    /^\/clinical-notes\/(?:context|programs|recent|work-queue|termination-outcomes)$/,
    /^\/note-aid\/(?:catalog|tools)$/,
    /^\/clinical-notes\/contact-documentation(?:\/(?:email|secure)\/[1-9][0-9]*)?$/,
    /^\/clients\/\d+\/communications(?:\/export|\/conversations\/(?:secure-)?[1-9][0-9]*)?$/,
    /^\/me\/notes-to-sign(?:\/count)?$/,
    /^\/medical-billing\/(?:workspace|service-locations|service-codes|config|supervised-payer-policies|supervised-provider-readiness|payer-eft|claims|claimmd|reports|clients|notes|treatment-plans|treatment-frequencies|agencies)(?:\/|$)/,
    /^\/clients(?:\/\d+(?:\/(?:guardians|records-copy-blocks|intake-note|clinical-responses))?)?$/,
    /^\/appointments(?:\/\d+)?$/,
    /^\/users\/\d+\/preferences$/,
    /^\/agencies\/\d+$/,
    /^\/clinical-data\/sessions\/\d+\/artifacts$/
  ].some(pattern => pattern.test(path));
  // Reviewed documentation and toast announcements are enabled in the administrator preview.
  // Live claim transmission and financial setup stay in the existing billing workspace
  // until the complete AuricWell revenue-cycle acceptance is finished.
  return [
    ['POST', /^\/clinical-notes\/(?:drafts|audit|generate|interactive-complexity)$/],
    ['POST', /^\/clinical-notes\/contact-documentation\/(?:email|secure)\/[1-9][0-9]*$/],
    ['PATCH', /^\/clinical-notes\/drafts\/\d+$/],
    ['POST', /^\/(?:auricwell-preview\/toasts|platform\/toast-announcements)$/],
    ['PUT', /^\/(?:auricwell-preview\/toasts|platform\/toast-announcements)\/[1-9][0-9]*$/],
    ['DELETE', /^\/(?:auricwell-preview\/toasts|platform\/toast-announcements)\/[1-9][0-9]*$/]
  ].some(([verb, pattern]) => verb === method && pattern.test(path));
}
