/** Ticket audience / topic — who should own the reply. */

export const TICKET_TOPICS = [
  { id: 'general', label: 'General support', short: 'General' },
  { id: 'billing', label: 'Billing', short: 'Billing' },
  { id: 'credentialing', label: 'Credentialing', short: 'Credentialing' },
  { id: 'payroll', label: 'Payroll', short: 'Payroll' }
];

/** Guardians: general + billing only */
export const GUARDIAN_TICKET_TOPICS = TICKET_TOPICS.filter((t) =>
  ['general', 'billing'].includes(t.id)
);

/** Providers: general + credentialing (+ billing if needed for claims questions) */
export const PROVIDER_TICKET_TOPICS = TICKET_TOPICS.filter((t) =>
  ['general', 'credentialing', 'billing'].includes(t.id)
);

/** Staff / CPA: general + payroll (+ billing) */
export const STAFF_TICKET_TOPICS = TICKET_TOPICS.filter((t) =>
  ['general', 'payroll', 'billing'].includes(t.id)
);

export function normalizeTicketTopic(raw, { allowedIds = null } = {}) {
  const t = String(raw || 'general').trim().toLowerCase();
  const allowed = allowedIds || TICKET_TOPICS.map((x) => x.id);
  return allowed.includes(t) ? t : 'general';
}

export function ticketTopicLabel(topic) {
  const hit = TICKET_TOPICS.find((t) => t.id === String(topic || '').toLowerCase());
  return hit?.short || 'General';
}

/** Hover / badge copy for responsibility flags on a person */
export function responsibilityFlagsLabel(person) {
  const flags = [];
  if (person?.has_billing_access || person?.hasBillingAccess) flags.push('Billing');
  if (person?.has_payroll_access || person?.hasPayrollAccess) flags.push('Payroll');
  if (
    person?.can_manage_credentialing ||
    person?.has_credentialing_access ||
    person?.hasCredentialingAccess
  ) {
    flags.push('Credentialing');
  }
  if (person?.has_platform_support || person?.hasPlatformSupport) flags.push('Platform support');
  return flags.length ? flags.join(' · ') : '';
}
