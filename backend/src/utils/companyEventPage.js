export const COMPANY_EVENT_ORIGIN = 'https://auricwell.com';
export const COMPANY_EVENT_PAGE_ROOT = `${COMPANY_EVENT_ORIGIN}/conversa/events`;
export const validEventPageSlug = value => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 140;
export function eventPageSlug(value, fallback = 'event') {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100).replace(/-+$/g, '') || fallback;
}
export function isCompanyGathering(event = {}) {
  const type = String(event.event_type || event.eventType || 'company_event').toLowerCase();
  if (String(event.host_club_kind || '').toLowerCase() === 'book_club'
    || event.host_organization_type && !['agency','company','life_coach','consultant'].includes(String(event.host_organization_type).toLowerCase())) return false;
  return !Number(event.organization_id || event.organizationId) && !/^(school_|program_)/.test(type)
    && !['team_poll','direct_notice','skills_group','guardian_program_class','skill_builders'].includes(type);
}
export function isReadableCompanyGathering(event = {}) {
  return isCompanyGathering(event) && !/^(childcare|tutoring)(_|$)/.test(String(event.event_type || event.eventType || '').toLowerCase());
}
export function storedCompanyEventPage(event) {
  let operations = event?.operations_json || {};
  if (typeof operations === 'string') { try { operations = JSON.parse(operations); } catch { return null; } }
  const page = operations?.pageLink;
  return page && Number(page.eventId) === Number(event.id) && validEventPageSlug(page.organizationSlug) && validEventPageSlug(page.eventSlug)
    ? { organizationSlug: page.organizationSlug, eventSlug: page.eventSlug } : null;
}
export function companyEventPageUrl(event) {
  if (!isReadableCompanyGathering(event)) return null;
  const page = storedCompanyEventPage(event);
  return page ? `${COMPANY_EVENT_PAGE_ROOT}/${page.organizationSlug}/${page.eventSlug}` : null;
}
