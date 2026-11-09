export const SCHOOL_ONBOARDING_REMINDER_DAYS = 7;
export function onboardingReminderBaseline(invite) {
  return invite.last_onboarding_email_sent_at || invite.invite_email_sent_at || invite.created_at;
}
export function onboardingReminderDue(invite, now = new Date()) {
  if (!['invited','in_progress','expired'].includes(invite.status) || invite.submitted_at || !invite.contact_email) return false;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invite.contact_email) || /@(email\.com|example\.(com|org|net|test))$/i.test(invite.contact_email)) return false;
  if (Number(invite.unresolved_reminder_count || 0)) return false;
  const sent = new Date(onboardingReminderBaseline(invite));
  return Number.isFinite(+sent) && +now >= +sent + SCHOOL_ONBOARDING_REMINDER_DAYS * 86400000;
}
export function onboardingReminderKey(invite) {
  // One claim per baseline, even across a week boundary or competing workers.
  return `weekly:${new Date(onboardingReminderBaseline(invite)).getTime()}`;
}
export function onboardingEmailStatus(result) {
  if (result?.redirected) return 'redirected';
  if (result?.blocked || result?.skipped) return 'failed';
  if (result?.queued && result?.communicationId) return 'queued';
  return result?.id ? 'sent' : 'review';
}
