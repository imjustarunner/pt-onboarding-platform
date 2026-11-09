import { sendNotificationEmail } from './unifiedEmail/unifiedEmailSender.service.js';

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
  const result = await sendNotificationEmail({
    agencyId: Number(agencyId),
    triggerKey: 'pre_hire_admin_review_access',
    templateType: 'onboarding_portal_invite',
    to,
    subject: promoted ? 'Your onboarding portal is ready' : 'Your onboarding portal',
    text: `Hi ${user.first_name || 'there'},\n\n${introduction}\n\n${portalLink}\n\nYour completed pre-hire package remains available. Complete onboarding and submit it for People Operations to review. This link is valid for 14 days.`,
    userId: Number(user.id),
    generatedByUserId,
    source: 'manual'
  });
  const status = result?.blocked || result?.skipped || result?.failed ? 'failed'
    : result?.queued || result?.pendingApproval ? 'pending'
      : result?.id ? 'sent' : 'failed';
  return { ...result, status };
}
