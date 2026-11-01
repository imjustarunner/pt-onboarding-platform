export const VERBAL_REMINDER_CONSENT_VERSION = '2026-11-01.1';
export const verbalReminderProgramReady = registration => registration?.provider === 'notifyre'
  && registration.verbalReminderConsentApproved === true
  && registration.verbalReminderConsentVersion === VERBAL_REMINDER_CONSENT_VERSION;
export function verbalReminderDisclosure(agency, registration = {}) {
  const brand = registration.brandName || agency.official_name || agency.name;
  return `${brand} offers optional appointment reminders, schedule changes, cancellations and session-access links by text to the phone number shown. Message frequency varies. Message and data rates may apply. Reply STOP to stop texts or HELP for help. Declining does not affect care. Standard texts may appear on a lock screen and are not end-to-end encrypted; private clinical information stays in the portal. Texting is not monitored for emergencies. This does not include marketing, billing, or other people's numbers. Terms: ${registration.termsUrl || 'Ask the agency for its SMS terms'}. Privacy: ${registration.privacyUrl || 'Ask the agency for its privacy policy'}. Do you control this phone and agree to receive these appointment texts?`;
}
