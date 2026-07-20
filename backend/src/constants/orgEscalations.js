/** Organization Escalation workflow statuses (leadership attention). */
export const ESCALATION_STATUSES = Object.freeze([
  'submitted',
  'under_review',
  'assigned',
  'awaiting_information',
  'resolved',
  'closed'
]);

export const ESCALATION_STATUS_LABELS = Object.freeze({
  submitted: 'Submitted',
  under_review: 'Under Review',
  assigned: 'Assigned',
  awaiting_information: 'Awaiting Information',
  resolved: 'Resolved',
  closed: 'Closed'
});

export const ESCALATION_PRIORITIES = Object.freeze(['low', 'medium', 'high']);

/** Roles that may submit an org escalation. */
export const ESCALATION_SUBMITTER_ROLES = Object.freeze([
  'admin',
  'support',
  'super_admin',
  'staff',
  'clinical_practice_assistant',
  'provider',
  'provider_plus',
  'school_staff',
  'schedule_manager',
  'supervisor',
  'club_manager'
]);

/** Roles that may manage / assign / update escalation workflow. */
export const ESCALATION_MANAGER_ROLES = Object.freeze([
  'admin',
  'support',
  'super_admin'
]);

export function normalizeEscalationStatus(raw, fallback = 'submitted') {
  const s = String(raw || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (ESCALATION_STATUSES.includes(s)) return s;
  return fallback;
}

export function isEscalationManagerRole(role) {
  return ESCALATION_MANAGER_ROLES.includes(String(role || '').toLowerCase());
}

export function isEscalationSubmitterRole(role) {
  return ESCALATION_SUBMITTER_ROLES.includes(String(role || '').toLowerCase());
}
