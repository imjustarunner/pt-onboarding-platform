import Agency from '../models/Agency.model.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import { inferAgencyMailDomain } from './tenantMessageMailboxes.service.js';
import { resolveEmailSendMailbox } from './emailSendMailbox.service.js';
import { enrollmentMailBrand } from './portalEmailBranding.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { resolveDayCancellationEmail } from './dayCancellationEmail.service.js';

export async function schoolDayAbsenceSender({ agencyId, providerId, providerAuthored }, overrides = {}) {
  const d = { personal:resolveEmailSendMailbox, domain:inferAgencyMailDomain,
    identities:args=>EmailSenderIdentity.list(args), ...overrides };
  if (providerAuthored) {
    // The reviewed plan establishes authorship; never select another employee's
    // identity merely because they are sending on a provider's behalf.
    const mailbox = await d.personal({ agencyId,userId:providerId });
    return { senderIdentityId:mailbox.identity.id, replyToOverride:mailbox.replyTo, fromDisplayNameOverride:mailbox.displayName };
  }
  const domain = await d.domain(agencyId);
  const sender = (await d.identities({agencyId,includePlatformDefaults:false,onlyActive:true})).find(s =>
    Number(s.agency_id) === Number(agencyId) && String(s.from_email || '').toLowerCase() === `schools@${domain}` && Number(s.is_active) !== 0);
  if (!domain || !sender?.id) throw new Error('Configure this agency’s schools@ sender before sending school absence notices.');
  return { senderIdentityId:sender.id, replyToOverride:`schools@${domain}`, fromDisplayNameOverride:'Schools Team' };
}
export async function sendSchoolDayAbsenceEmail({ agencyId, providerId, providerAuthored, ...message }) {
  if (message.reviewedCancellationToken) {
    const envelope=await resolveDayCancellationEmail({agencyId,providerId,providerAuthored,
      actorUserId:message.generatedByUserId,reviewedCancellationToken:message.reviewedCancellationToken,
      reviewedCancellationItemKey:message.reviewedCancellationItemKey});
    return sendEmailFromIdentity({...message,agencyId,...envelope,templateType:'day_cancellation'});
  }
  const sender = await schoolDayAbsenceSender({agencyId,providerId,providerAuthored});
  const agency = await Agency.findById(agencyId);
  if (!agency) throw new Error('An owning agency is required for school absence email.');
  const domain = await inferAgencyMailDomain(agencyId);
  const brand = { ...enrollmentMailBrand({agency,domain,school:true}), replyTo:sender.replyToOverride,
    displayName:providerAuthored ? sender.fromDisplayNameOverride : `${agency.official_name || agency.name} Schools Team` };
  return sendEmailFromIdentity({ ...message,agencyId,...sender,fromDisplayNameOverride:brand.displayName,portalEmailBrand:brand });
}
