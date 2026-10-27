import { ensurePortalGroupSender } from './portalGroupSender.service.js';
import Agency from '../models/Agency.model.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import { inferAgencyMailDomain } from './tenantMessageMailboxes.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { enrollmentMailBrand, renderPortalEmail } from './portalEmailBranding.service.js';
export { enrollmentMailBrand } from './portalEmailBranding.service.js';

export async function sendEnrollmentPortalEmail({ agencyId, schoolOrganizationId = null, schoolEnrollment = false, enrollmentChannel = null, locale = 'en', ...message }) {
  const agency = await Agency.findById(agencyId);
  const domain = await inferAgencyMailDomain(agencyId);
  if (!agency || !domain) throw new Error('An agency and its support mail domain are required for portal email.');
  const brand = enrollmentMailBrand({ agency, domain, school: schoolEnrollment || !!schoolOrganizationId, channel: enrollmentChannel });
  await ensurePortalGroupSender({ address: brand.fromEmail, displayName: brand.displayName });
  const identityKey = brand.fromEmail === 'portal@auricwell.com' ? 'clinical_enrollment_portal' : 'enrollment_portal';
  let identity = await EmailSenderIdentity.findByAgencyAndIdentityKey(agencyId, identityKey);
  const values = { displayName: brand.displayName, fromEmail: brand.fromEmail, replyTo: brand.replyTo, isActive: true };
  if (!identity) identity = await EmailSenderIdentity.create({ agencyId, identityKey, ...values, inboundAddresses: [] });
  else if (identity.from_email !== brand.fromEmail || identity.display_name !== values.displayName || identity.reply_to !== brand.replyTo) {
    identity = await EmailSenderIdentity.update(identity.id, values);
  }
  // Shared AuricWell sender; replies belong to the caring agency. Do not claim
  // the shared inbound address for an individual tenant.
  const label = [brand.displayName, brand.name, ...brand.products].join(' | ');
  const subject = String(message.subject || '').includes(brand.name)
    ? message.subject : `${brand.name}: ${message.subject || 'Portal update'}`;
  const result = await sendEmailFromIdentity({
    ...message, subject, schoolOrganizationId, senderIdentityId: identity.id,
    replyToOverride: brand.replyTo, usedFallbackSender: false,
    text: `${label}\n\n${message.text || ''}`,
    html: renderPortalEmail({ brand, ...message, locale })
  });
  const queued = !!(result?.queued || result?.pendingApproval);
  // A test-inbox redirect is still a real send when the transport returned an
  // ID. This describes transmission, not arrival in the recipient's inbox.
  const sent = !!result?.id && !queued && !result.skipped && !result.blocked;
  return { ...result, sent, queued, fromEmail: brand.fromEmail, replyTo: brand.replyTo, deliveryStatus: sent ? 'sent' : queued ? 'pending' : 'not_sent' };
}
