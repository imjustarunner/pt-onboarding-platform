import Agency from '../models/Agency.model.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import User from '../models/User.model.js';
import { HOGWARTS_TEST_INBOX } from '../utils/hogwartsTestEmail.js';
import { FOUNDERS_GROUPS } from './foundersGroupPolicy.js';
import { hiringInviteReceiptTemplate, PREHIRE_PORTAL_ACCESS_TRIGGER } from './hiringInviteMailPolicy.js';
import { hiringInviteStaffCopy } from './hiringInviteStaffCopy.js';
import { sendEmailFromIdentity, sendNotificationEmail } from './unifiedEmail/unifiedEmailSender.service.js';

const mailbox = value => String(value || '').trim().toLowerCase();
const validMailbox = email => /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email);
const isCandidateAddress = (address, routing) => validMailbox(address)
  && address !== routing.peopleOperationsEmail && address !== routing.foundersEmail;
const missingSender = { status: 'failed', blocked: true, reason: 'no_people_operations_sender' };

export async function resolveHiringInviteRouting(agencyId, agency = null) {
  const [identity, organization] = await Promise.all([
    EmailSenderIdentity.findByAgencyAndIdentityKey(agencyId, 'people_operations'),
    agency || Agency.findById(agencyId)
  ]);
  const slug = mailbox(organization?.slug);
  const foundersEmail = Object.hasOwn(FOUNDERS_GROUPS, slug) ? FOUNDERS_GROUPS[slug] : null;
  const peopleOperationsEmail = mailbox(identity?.from_email);
  if (!identity?.id || Number(identity.agency_id) !== Number(agencyId) || !validMailbox(peopleOperationsEmail)
    || (foundersEmail && peopleOperationsEmail.split('@')[1] !== foundersEmail.split('@')[1])) return null;
  return { senderIdentityId: identity.id, peopleOperationsEmail, foundersEmail };
}

export function hiringInviteDelivery(result, recipientEmail) {
  const status = !result || result.skipped || result.blocked || result.failed ? 'failed'
    : result.pendingApproval || result.queued ? 'pending'
      : result.id ? 'sent' : 'failed';
  return {
    ...result, status, recipientEmail,
    deliveredTo: status === 'sent' ? (result.redirected ? HOGWARTS_TEST_INBOX : recipientEmail) : null
  };
}

export async function sendHiringInviteReceipt({
  routing, agencyId, user, userId, templateType, generatedByUserId,
  source, message = null, existingCommunicationId = null
}) {
  const receiptTemplate = hiringInviteReceiptTemplate(templateType);
  if (!receiptTemplate) throw new Error('Unknown invitation receipt type.');
  routing ??= await resolveHiringInviteRouting(agencyId);
  if (!routing) return missingSender;
  const candidate = user || await User.findById(userId);
  if (!candidate) return { status: 'failed', skipped: true, reason: 'user_not_found' };
  const label = templateType === PREHIRE_PORTAL_ACCESS_TRIGGER ? 'Pre-hire' : 'Onboarding';
  const candidateName = [candidate.first_name, candidate.last_name].filter(Boolean).join(' ') || 'Candidate';
  const copy = hiringInviteStaffCopy(message, {
    subject: `${label} invitation sent`,
    text: `${candidateName} was sent an invitation to complete ${label.toLowerCase()} in Plotline.`
  });
  const receipt = await sendEmailFromIdentity({
    senderIdentityId: routing.senderIdentityId,
    replyToOverride: routing.peopleOperationsEmail,
    to: routing.peopleOperationsEmail,
    bcc: routing.foundersEmail,
    ...copy,
    templateType: receiptTemplate,
    userId,
    generatedByUserId,
    source,
    existingCommunicationId
  });
  return { ...hiringInviteDelivery(receipt, routing.peopleOperationsEmail), foundersEmail: receipt?.redirected ? null : routing.foundersEmail };
}

export async function copySuccessfulHiringInvite(input) {
  try {
    return await sendHiringInviteReceipt(input);
  } catch (error) {
    // The candidate delivery already succeeded. Retrying it would send a
    // duplicate portal link, so report the receipt failure on its own.
    return { status: 'failed', communicationId: error?.communicationId || null };
  }
}

export async function sendHiringPortalInvitation(options, { user, routing } = {}) {
  const { agencyId, to, userId, templateType, generatedByUserId, source } = options;
  const sender = routing === undefined ? await resolveHiringInviteRouting(agencyId) : routing;
  if (!sender) return { ...missingSender, recipientEmail: to, deliveredTo: null };
  if (!isCandidateAddress(mailbox(to), sender)) {
    return { status: 'failed', blocked: true, reason: 'invalid_candidate_email', recipientEmail: to, deliveredTo: null };
  }
  const result = await sendNotificationEmail({
    ...options,
    triggerKey: PREHIRE_PORTAL_ACCESS_TRIGGER,
    senderIdentityId: sender.senderIdentityId,
    replyToOverride: sender.peopleOperationsEmail
  });
  const delivery = hiringInviteDelivery(result, to);
  if (delivery.status !== 'sent' || result.redirected) return delivery;
  const peopleOperationsCopy = await copySuccessfulHiringInvite({
    routing: sender, agencyId, user, userId, templateType, generatedByUserId, source, message: options
  });
  return { ...delivery, peopleOperationsCopy };
}

export async function hiringInviteRetryRouting(agencyId, userId, recipient) {
  const [routing, user] = await Promise.all([resolveHiringInviteRouting(agencyId), User.findById(userId)]);
  if (!routing) throw Object.assign(new Error('Configure the organization’s People Operations sender before retrying this invitation.'), { status: 409 });
  if (!user || !isCandidateAddress(mailbox(recipient), routing) || mailbox(recipient) !== mailbox(user.personal_email || user.email)) {
    throw Object.assign(new Error('The invitation recipient must match the candidate’s current email address.'), { status: 409 });
  }
  return routing;
}
