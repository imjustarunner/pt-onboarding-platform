export const ESCALATION_STATUSES = [
  { id: 'submitted', label: 'Submitted' },
  { id: 'under_review', label: 'Under Review' },
  { id: 'assigned', label: 'Assigned' },
  { id: 'awaiting_information', label: 'Awaiting Information' },
  { id: 'resolved', label: 'Resolved' }
];

/** In-progress statuses shown in the workflow dropdown (excludes resolved). */
export const ESCALATION_WORKFLOW_STATUSES = ESCALATION_STATUSES.filter((s) => s.id !== 'resolved');

const LEGACY_ESCALATION_STATUS_LABELS = {
  closed: 'Closed'
};

export const ESCALATION_PRIORITIES = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' }
];

export function escalationStatusLabel(status) {
  const key = String(status || '').toLowerCase();
  const hit = ESCALATION_STATUSES.find((s) => s.id === key);
  if (hit) return hit.label;
  return LEGACY_ESCALATION_STATUS_LABELS[key] || String(status || 'Submitted');
}

export function escalationStatusTone(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'submitted') return 'new';
  if (s === 'under_review' || s === 'assigned') return 'active';
  if (s === 'awaiting_information') return 'wait';
  if (s === 'resolved' || s === 'closed') return 'done';
  return '';
}
