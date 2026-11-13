import Agency from '../models/Agency.model.js';
import { enrollmentMailBrand, renderPortalEmail } from './portalEmailBranding.service.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import { inferAgencyMailDomain } from './tenantMessageMailboxes.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
export { schoolRoiDelivery } from '../utils/schoolRoiDelivery.js';

export async function sendSchoolRoiEmail({agencyId,...message}) {
  const domain = await inferAgencyMailDomain(agencyId);
  const identities = await EmailSenderIdentity.list({agencyId,includePlatformDefaults:false,onlyActive:true});
  const sender = identities.find(row => Number(row.agency_id) === Number(agencyId) && String(row.from_email || '').toLowerCase() === `schools@${domain}`);
  if (!sender?.id || !domain) throw new Error('Configure the agency schools@ sender before sending ROI emails.');
  const agency = await Agency.findById(agencyId);
  if (!agency) throw new Error('An owning agency is required for school ROI email.');
  const brand = enrollmentMailBrand({ agency, domain, school: true });
  brand.displayName = 'AuricWell School Forms';
  const attribution = `${brand.name} Schools Team · School forms through AuricWell`;
  return sendEmailFromIdentity({
    ...message, senderIdentityId: sender.id, replyToOverride: `support@${domain}`,
    fromDisplayNameOverride: `${brand.name} Schools Team`, usedFallbackSender: false,
    text: `${message.text || ''}\n\n${attribution}`,
    html: renderPortalEmail({ brand, ...message })
  });
}
