/**
 * Agency email routing + branding config.
 *
 * - **Keyed by agencyId** (number) to match your requirement.
 * - **fromEmail** must be a configured "Send mail as" alias for the impersonated user mailbox.
 * - **inboundAddresses** are the alias addresses customers may email; used to route incoming messages to an agency.
 */
export const AGENCY_EMAIL_MAP = {
  // Example:
  // 1: {
  //   agencyName: 'Itsco',
  //   fromName: 'Itsco Support',
  //   fromEmail: 'notifications@itsco.health',
  //   replyTo: 'support@itsco.health', // typically a Google Group / collaborative inbox
  //   inboundAddresses: ['payroll@itsco.health', 'support@itsco.health', 'notifications@itsco.health']
  // }
};

export function getAgencyEmailConfig(agencyId) {
  const cfg = AGENCY_EMAIL_MAP[String(agencyId)] || AGENCY_EMAIL_MAP[Number(agencyId)];
  return cfg || null;
}

export function listAllFromEmailsLower() {
  return Object.values(AGENCY_EMAIL_MAP)
    .map(v => (v?.fromEmail || '').toLowerCase())
    .filter(Boolean);
}

export function listAllInboundEmailsLower() {
  const emails = [];
  for (const v of Object.values(AGENCY_EMAIL_MAP)) {
    for (const e of (v?.inboundAddresses || [])) emails.push(String(e).toLowerCase());
    if (v?.fromEmail) emails.push(String(v.fromEmail).toLowerCase());
    if (v?.replyTo) emails.push(String(v.replyTo).toLowerCase());
  }
  return Array.from(new Set(emails)).filter(Boolean);
}

