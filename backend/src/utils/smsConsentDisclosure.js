export const SMS_CONSENT_VERSION = '2026-10-05.1';
export const SMS_PURPOSE_LABELS = {
  care: 'Two-way administrative messages with my care team',
  reminders: 'Appointment reminders, schedule changes, cancellations and session-access links',
  workforce: 'Staff schedule, supervision, team and video session, session-access and assigned-training notifications',
  billing: 'Optional billing-account and statement-update notifications with links to sign in',
  marketing: 'Optional announcements about this practice’s programs and services',
  account_security: 'Requested account access and security messages',
  polling: 'Optional nonpolitical polls and surveys'
};

export function buildSmsConsentDisclosure(registration, { signerRole = null } = {}) {
  const purposes = registration.purposes.filter((purpose) => {
    if (signerRole === 'staff') return !['care', 'reminders', 'billing'].includes(purpose);
    if (signerRole === 'client' || signerRole === 'guardian') return purpose !== 'workforce';
    return true;
  });
  return {
    version: registration.messagingPlatform === 'the messaging platform' ? '2026-10-06.1' : SMS_CONSENT_VERSION,
    brandName: registration.brandName,
    legalName: registration.legalName,
    termsUrl: registration.termsUrl,
    privacyUrl: registration.privacyUrl,
    supportContact: registration.supportContact,
    purposes: purposes.map((purpose) => ({ purpose, label: registration.messagingPlatform === 'the messaging platform' && purpose === 'workforce' ? 'Staff announcements, supervisor and team messages, schedules, meetings, session-access links and assigned-training notifications' : SMS_PURPOSE_LABELS[purpose] })),
    text: `${registration.brandName} (${registration.legalName}) uses ${registration.messagingPlatform === 'the messaging platform' ? 'the messaging platform' : 'AuricWell'} to send the messages you select below to the phone number on this form. Choose Yes or No for every message type. Receiving texts is optional; you may choose No for all types. Message frequency varies. Message and data rates may apply. Reply STOP to stop this program across its sending numbers. Reply HELP for help, or contact ${registration.supportContact}. START or UNSTOP reactivates existing subscriptions only when supported by this program. Carriers are not liable for delayed or undelivered messages. Standard SMS is not end-to-end encrypted; use the secure portal for sensitive clinical information. Texting is not monitored for emergencies. Call 911 for an emergency. Marketing permission is separate and is not required to receive services or make a purchase. Your selection does not authorize affiliate or third-party marketing. Read the linked SMS terms and privacy policy before signing.`,
    signatureText: 'By typing my name and selecting Sign, I electronically sign these choices. I control the listed phone number and am the recipient or their authorized guardian. I understand that declining text messages does not prevent me from receiving services.'
  };
}
