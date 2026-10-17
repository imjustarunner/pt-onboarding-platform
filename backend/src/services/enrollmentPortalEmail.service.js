import Agency from '../models/Agency.model.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import { inferAgencyMailDomain } from './tenantMessageMailboxes.service.js';
import { getMedicalBillingFlags } from './medicalBillingFlags.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';

const escape = value => String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function enrollmentMailBrand({ agency, domain, school = false, channel = null }) {
  const clinical = !['tutoring','coaching','consulting'].includes(channel) && (school || getMedicalBillingFlags(agency?.feature_flags || {}).clinicalChartEnabled);
  return {
    fromEmail: clinical ? 'portal@auricwell.com' : `portal@${domain}`,
    replyTo: `support@${domain}`,
    name: agency.official_name || agency.name,
    products: [school && 'SchoolCareBridge · school coordination', clinical && 'AuricWell · clinical portal'].filter(Boolean)
  };
}

export async function sendEnrollmentPortalEmail({ agencyId, schoolOrganizationId = null, schoolEnrollment = false, enrollmentChannel = null, ...message }) {
  const agency = await Agency.findById(agencyId);
  const domain = await inferAgencyMailDomain(agencyId);
  if (!agency || !domain) throw new Error('An agency and its support mail domain are required for portal email.');
  const brand = enrollmentMailBrand({ agency, domain, school: schoolEnrollment || !!schoolOrganizationId, channel: enrollmentChannel });
  const identityKey = brand.fromEmail === 'portal@auricwell.com' ? 'clinical_enrollment_portal' : 'enrollment_portal';
  let identity = await EmailSenderIdentity.findByAgencyAndIdentityKey(agencyId, identityKey);
  const values = { displayName: `${brand.name} Portal`, fromEmail: brand.fromEmail, replyTo: brand.replyTo, isActive: true };
  if (!identity) identity = await EmailSenderIdentity.create({ agencyId, identityKey, ...values, inboundAddresses: [] });
  else if (identity.from_email !== brand.fromEmail || identity.display_name !== values.displayName || identity.reply_to !== brand.replyTo) {
    identity = await EmailSenderIdentity.update(identity.id, values);
  }
  // Shared AuricWell sender; replies belong to the caring agency. Do not claim
  // the shared inbound address for an individual tenant.
  const label = [brand.name, ...brand.products].join(' | ');
  const result = await sendEmailFromIdentity({
    ...message, schoolOrganizationId, senderIdentityId: identity.id,
    replyToOverride: brand.replyTo, usedFallbackSender: false,
    text: `${label}\n\n${message.text || ''}`,
    html: `<div style="font-family:Arial,sans-serif;color:#203e34"><p><strong>${escape(brand.name)}</strong><br>${brand.products.map(escape).join('<br>')}</p>${message.html || `<p>${escape(message.text).replaceAll('\n','<br>')}</p>`}</div>`
  });
  const sent = !!result?.id && !result.queued && !result.skipped && !result.blocked && !result.redirected;
  return { ...result, sent, fromEmail: brand.fromEmail, replyTo: brand.replyTo, deliveryStatus: sent ? 'sent' : result?.queued ? 'pending' : 'not_sent' };
}
