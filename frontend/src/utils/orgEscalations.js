export const ESCALATION_STATUSES = [
  { id: 'submitted', label: 'Submitted' },
  { id: 'under_review', label: 'Under Review' },
  { id: 'assigned', label: 'Assigned' },
  { id: 'awaiting_information', label: 'Awaiting Information' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'closed', label: 'Closed' }
];

export const ESCALATION_PRIORITIES = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' }
];

export function escalationStatusLabel(status) {
  const hit = ESCALATION_STATUSES.find((s) => s.id === String(status || '').toLowerCase());
  return hit?.label || String(status || 'Submitted');
}

export function escalationStatusTone(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'submitted') return 'new';
  if (s === 'under_review' || s === 'assigned') return 'active';
  if (s === 'awaiting_information') return 'wait';
  if (s === 'resolved' || s === 'closed') return 'done';
  return '';
}
