export const CLIENT_START_CONSENT_VERSION = '2026-11-17.1';

export function clientStartConsentNotice(registration) {
  if (registration?.provider !== 'notifyre' || registration.allowRestart !== true || registration.startEnrollment != null) return null;
  const labels = ['reminders', 'care'].filter(p => registration.purposes?.includes(p))
    .map(p => p === 'reminders' ? 'appointment reminders' : 'provider texts');
  if (!labels.length) return null;
  return `Text START or UNSTOP to this program's number to opt this phone into ${labels.join(' and ')}. This choice is saved even before enrollment; delivery requires a current client or authorized guardian relationship. A later No in enrollment or notification settings overrides the earlier START for that message type. NOREMIND stops appointment reminders; NOPROVIDER stops provider texts; STOP stops all texts sent through our Notifyre account. START does not authorize marketing, billing or staff texts.`;
}
