import pool from '../config/database.js';
import { buildPublicPortalBaseUrl } from '../utils/publicPortalUrl.js';
import { readEventOperations } from '../utils/companyEventOperations.js';

export async function loadCompanyEventLinkAgency(event, db = pool) {
  const [[agency]] = await db.execute('SELECT id,name,slug,portal_url,custom_domain,logo_path,color_palette FROM agencies WHERE id=?', [Number(event.agency_id || event.agencyId)]);
  return agency || {};
}

export function companyEventInvitationLinks(event, token, agency = {}) {
  // Event routes are global routes on the host agency's app. Other invited
  // agencies share this invitation; their membership does not change its host.
  const base = new URL(buildPublicPortalBaseUrl(agency)).origin;
  const staffToken = event.staff_link_token || event.staffLinkToken;
  const rsvpUrl = token ? `${base}/event-rsvp/${encodeURIComponent(token)}` : null;
  const detailsUrl = staffToken ? `${base}/company-events/${Number(event.id)}/staff/${staffToken}` : rsvpUrl;
  return { rsvpUrl, detailsUrl, smsUrl: readEventOperations(event).publicRegistrationEnabled ? `${base}/company-events/${Number(event.id)}` : detailsUrl };
}

export async function resolveCompanyEventInvitationLinks(event, token, db = pool) {
  return companyEventInvitationLinks(event, token, await loadCompanyEventLinkAgency(event, db));
}
