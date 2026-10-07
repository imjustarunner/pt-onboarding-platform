import { resolveRegisteredSmsSender } from './smsCompliance.service.js';
import { buildPublicPortalBaseUrl } from '../utils/publicPortalUrl.js';
import VonageService from './vonage.service.js';

export async function sendManualSupportAlert({ agency, to }) {
  if (!agency?.id || !to) return;
  const from = await resolveRegisteredSmsSender({ agencyId: agency.id, purpose: 'workforce' });
  if (!from) return;
  // Clinical notes, identifiers and ticket contents stay in the secure inbox.
  return VonageService.sendSms({ purpose: 'workforce', agencyId: agency.id,
    staffNotificationKind: 'messageAlerts', to, from,
    body: `Urgent: a support request needs your attention. Sign in to review and reply securely: ${buildPublicPortalBaseUrl(agency)}` });
}
