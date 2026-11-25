import { sendHiringPortalInvitation } from './hiringInviteDelivery.service.js';
import { ONBOARDING_INVITE_TEMPLATE } from './hiringInviteMailPolicy.js';

/** Continue onboarding through the agency's existing People Operations rule. */
export async function sendOnboardingPortalInviteEmail({
  agencyId, user, portalLink, generatedByUserId, promoted = false
}) {
  if (!Number(agencyId) || !Number(user?.id)) {
    throw new Error('An organization and candidate are required for an onboarding invitation.');
  }
  const to = String(user.personal_email || user.email || '').trim();
  if (!to) return { status: 'failed', skipped: true, reason: 'no_recipient_email' };

  const introduction = promoted
    ? 'Your pre-hire package is complete and remains available in My Submissions. Continue onboarding using your same personal link:'
    : 'Continue with your personal portal link:';
  return sendHiringPortalInvitation({
    agencyId: Number(agencyId),
    templateType: ONBOARDING_INVITE_TEMPLATE,
    to,
    subject: promoted ? 'Your onboarding portal is ready' : 'Your onboarding portal',
    text: `Hi ${user.first_name || 'there'},\n\n${introduction}\n\n${portalLink}\n\nYour completed pre-hire package remains available. Complete onboarding and submit it for People Operations to review. This link is valid for 14 days.`,
    userId: Number(user.id),
    generatedByUserId,
    source: 'manual'
  }, { user });
}
