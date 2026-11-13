import pool from '../config/database.js';
import { buildPublicPortalBaseUrl } from '../utils/publicPortalUrl.js';
import { readEventOperations } from '../utils/companyEventOperations.js';
import { COMPANY_EVENT_ORIGIN, companyEventPageUrl, isReadableCompanyGathering } from '../utils/companyEventPage.js';
import { ensureCompanyEventPage } from './companyEventPages.service.js';

export async function loadCompanyEventLinkAgency(event, db = pool) {
  const [[agency]] = await db.execute('SELECT id,name,slug,portal_url,custom_domain,logo_path,color_palette,organization_type,club_kind FROM agencies WHERE id=?', [Number(event.agency_id || event.agencyId)]);
  return agency || {};
}

export function companyEventInvitationLinks(event, token, agency = {}) {
  const pageUrl = companyEventPageUrl(event);
  if (pageUrl) return {rsvpUrl:token ? `${pageUrl}?invitation=${encodeURIComponent(token)}` : pageUrl,detailsUrl:pageUrl,smsUrl:pageUrl};
  // Service/program registration retains its agency entry points. Company
  // gatherings share the central Conversa origin, including legacy aliases.
  const base = isReadableCompanyGathering({...event,host_organization_type:agency.organization_type || event.host_organization_type,host_club_kind:agency.club_kind || event.host_club_kind}) ? COMPANY_EVENT_ORIGIN : new URL(buildPublicPortalBaseUrl(agency)).origin;
  const staffToken = event.staff_link_token || event.staffLinkToken;
  const rsvpUrl = token ? `${base}/event-rsvp/${encodeURIComponent(token)}` : null;
  const detailsUrl = staffToken ? `${base}/company-events/${Number(event.id)}/staff/${staffToken}` : rsvpUrl;
  return { rsvpUrl, detailsUrl, smsUrl: readEventOperations(event).publicRegistrationEnabled ? `${base}/company-events/${Number(event.id)}` : detailsUrl };
}

export async function resolveCompanyEventInvitationLinks(event, token, db = pool) {
  if (companyEventPageUrl(event)) return companyEventInvitationLinks(event, token);
  const agency = await loadCompanyEventLinkAgency(event, db);
  await ensureCompanyEventPage(event, agency, db);
  return companyEventInvitationLinks(event, token, agency);
}
