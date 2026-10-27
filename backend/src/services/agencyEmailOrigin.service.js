import Agency from '../models/Agency.model.js';
import { buildPublicPortalBaseUrl } from '../utils/publicPortalUrl.js';
import { publicAppBaseUrl } from './contactReminderToken.service.js';

/** Footer routes are public app routes. Use the sender's stored tenant host, never a request host. */
export async function agencyEmailOrigin(agencyId) {
  if (Number(agencyId) > 0) {
    const agency = await Agency.findById(Number(agencyId));
    if (agency) return new URL(buildPublicPortalBaseUrl(agency)).origin;
  }
  return new URL(publicAppBaseUrl()).origin;
}
