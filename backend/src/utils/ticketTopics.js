export const TICKET_TOPICS = ['general', 'technology', 'billing', 'credentialing', 'payroll', 'people_operations'];

export function normalizeTicketTopic(raw, { allowed = null } = {}) {
  const t = String(raw || 'general').trim().toLowerCase();
  const allow = allowed && allowed.length ? allowed : TICKET_TOPICS;
  return allow.includes(t) ? t : 'general';
}

/** Topics a creator role may select */
export function allowedTopicsForCreatorRole(role) {
  const r = String(role || '').toLowerCase();
  if (r === 'client_guardian') return ['general', 'technology', 'billing'];
  if (r === 'provider' || r === 'provider_plus') return ['general', 'technology', 'credentialing', 'billing'];
  if (r === 'staff' || r === 'clinical_practice_assistant') return ['general', 'technology', 'payroll', 'billing', 'people_operations'];
  if (r === 'admin' || r === 'support' || r === 'super_admin') return [...TICKET_TOPICS];
  if (r === 'school_staff') return ['general', 'technology', 'billing'];
  return ['general'];
}
