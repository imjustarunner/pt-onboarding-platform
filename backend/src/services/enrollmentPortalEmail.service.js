import { nluTutoringQaMailDomain } from '../utils/nluTutoringQaPolicy.js';
import { ensurePortalGroupSender } from './portalGroupSender.service.js';
import Agency from '../models/Agency.model.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import { inferAgencyMailDomain } from './tenantMessageMailboxes.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { enrollmentMailBrand, renderPortalEmail, SCHOOL_ENROLLMENT_SENDER_NAME } from './portalEmailBranding.service.js';
export { enrollmentMailBrand } from './portalEmailBranding.service.js';

export async function sendEnrollmentPortalEmail({ agencyId, schoolOrganizationId = null, schoolEnrollment = false, enrollmentChannel = null, locale = 'en', schoolsTeamSender = false, ...message }) {
  const agency = await Agency.findById(agencyId);
  const domain = await inferAgencyMailDomain(agencyId);
  if (!agency || !domain) throw new Error('An agency and its support mail domain are required for portal email.');
  let brand = enrollmentMailBrand({ agency, domain, school: schoolEnrollment || !!schoolOrganizationId, channel: enrollmentChannel });
  // Synthetic QA reuses an already configured NLU sender. It must never create
  // a Workspace Group or alter live Group memberships merely to run a test.
  let qaSenderSource = null;
  if (nluTutoringQaMailDomain(agency)) {
    for (const [key, expectedFrom] of [['enrollment_portal', 'portal@nextleveluplcc.com'], ['notifications', 'notifications@nextleveluplcc.com']]) {
      const candidate = await EmailSenderIdentity.findByAgencyAndIdentityKey(6, key);
      if (!candidate?.id || Number(candidate.agency_id) !== 6 || Number(candidate.is_active) !== 1
        || String(candidate.from_email || '').trim().toLowerCase() !== expectedFrom) continue;
      const replyTo = candidate.reply_to || (key === 'enrollment_portal' ? brand.replyTo : candidate.from_email);
      if (!/^[^@\s]+@nextleveluplcc\.com$/i.test(String(replyTo))) continue;
      qaSenderSource = { agencyId: 6, identityId: candidate.id, identityKey: key };
      brand = { ...brand, fromEmail: candidate.from_email, replyTo,
        displayName: candidate.display_name || brand.displayName };
      break;
    }
    if (!qaSenderSource) {
      throw Object.assign(new Error('Configure an active existing NLU portal or notifications sender before sending QA enrollment email. Sender verification is still required.'), { code: 'NLU_QA_PORTAL_SENDER_NOT_READY', status: 503 });
    }
    // sendEmailFromIdentity still verifies the actual Gmail/relay sender.
  } else await ensurePortalGroupSender({ address: brand.fromEmail, displayName: brand.displayName });
  const sharedPortal = brand.fromEmail === 'portal@auricwell.com';
  // School enrollment receipts keep the verified AuricWell address but sign as the Schools Team.
  const schoolSender = schoolsTeamSender && sharedPortal && !!(schoolEnrollment || schoolOrganizationId);
  const senderBrand = schoolSender ? { ...brand, displayName: SCHOOL_ENROLLMENT_SENDER_NAME } : brand;
  const identityKey = schoolSender ? 'school_enrollment_portal' : sharedPortal ? 'clinical_enrollment_portal' : 'enrollment_portal';
  let identity = await EmailSenderIdentity.findByAgencyAndIdentityKey(agencyId, identityKey);
  const values = { displayName: senderBrand.displayName, fromEmail: brand.fromEmail, replyTo: brand.replyTo, isActive: true };
  if (!identity) identity = await EmailSenderIdentity.create({ agencyId, identityKey, ...values, inboundAddresses: [] });
  else if (identity.from_email !== brand.fromEmail || identity.display_name !== values.displayName || identity.reply_to !== brand.replyTo) {
    identity = await EmailSenderIdentity.update(identity.id, values);
  }
  // Shared AuricWell sender; replies belong to the caring agency. Do not claim
  // the shared inbound address for an individual tenant.
  const label = [senderBrand.displayName, brand.name, ...brand.products].join(' | ');
  const subject = String(message.subject || '').includes(brand.name)
    ? message.subject : `${brand.name}: ${message.subject || 'Portal update'}`;
  const result = await sendEmailFromIdentity({
    ...message, subject, schoolOrganizationId, senderIdentityId: identity.id,
    replyToOverride: brand.replyTo, usedFallbackSender: false,
    text: `${label}\n\n${message.text || ''}`,
    html: renderPortalEmail({ brand: senderBrand, ...message, locale })
  });
  const queued = !!(result?.queued || result?.pendingApproval);
  // A test-inbox redirect is still a real send when the transport returned an
  // ID. This describes transmission, not arrival in the recipient's inbox.
  const sent = !!result?.id && !queued && !result.skipped && !result.blocked;
  return { ...result, ...(qaSenderSource ? { qaSenderSource } : {}), sent, queued, fromEmail: brand.fromEmail, replyTo: brand.replyTo, deliveryStatus: sent ? 'sent' : queued ? 'pending' : 'not_sent' };
}
