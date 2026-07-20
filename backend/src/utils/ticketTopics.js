export const TICKET_TOPICS = ['general', 'billing', 'credentialing', 'payroll'];

export function normalizeTicketTopic(raw, { allowed = null } = {}) {
  const t = String(raw || 'general').trim().toLowerCase();
  const allow = allowed && allowed.length ? allowed : TICKET_TOPICS;
  return allow.includes(t) ? t : 'general';
}

/** Topics a creator role may select */
export function allowedTopicsForCreatorRole(role) {
  const r = String(role || '').toLowerCase();
  if (r === 'client_guardian') return ['general', 'billing'];
  if (r === 'provider' || r === 'provider_plus') return ['general', 'credentialing', 'billing'];
  if (r === 'staff' || r === 'clinical_practice_assistant') return ['general', 'payroll', 'billing'];
  if (r === 'admin' || r === 'support' || r === 'super_admin') return [...TICKET_TOPICS];
  if (r === 'school_staff') return ['general', 'billing'];
  return ['general'];
}
