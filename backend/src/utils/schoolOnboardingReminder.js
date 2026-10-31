export const SCHOOL_ONBOARDING_REMINDER_DAYS = 10;
export function onboardingReminderDue(invite, now = new Date()) {
  if (!['invited','in_progress','expired'].includes(invite.status) || invite.submitted_at || !invite.invite_email_sent_at || !invite.contact_email) return false;
  const sent = new Date(invite.invite_email_sent_at);
  return Number.isFinite(+sent) && +now >= +sent + SCHOOL_ONBOARDING_REMINDER_DAYS * 86400000;
}
export function onboardingEmailStatus(result) {
  if (result?.redirected) return 'redirected';
  if (result?.blocked || result?.skipped) return 'failed';
  if (result?.queued && result?.communicationId) return 'queued';
  return result?.id ? 'sent' : 'review';
}
