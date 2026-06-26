export const SUPERVISOR_TYPES = Object.freeze(['clinical', 'manager', 'billing']);

export const SUPERVISOR_TYPE_LABELS = Object.freeze({
  clinical: 'Clinical',
  manager: 'Manager',
  billing: 'Billing'
});

export function normalizeSupervisorType(raw) {
  const t = String(raw || 'clinical').trim().toLowerCase();
  return SUPERVISOR_TYPES.includes(t) ? t : 'clinical';
}

export function supervisorTypeLabel(raw) {
  return SUPERVISOR_TYPE_LABELS[normalizeSupervisorType(raw)] || 'Clinical';
}

export function assignmentIsClinical(row) {
  return normalizeSupervisorType(row?.supervisor_type || row?.supervisorType || 'clinical') === 'clinical';
}

export function hasClinicalSupervisorInLists(lists) {
  return (lists || []).some((list) => Array.isArray(list) && list.some((row) => assignmentIsClinical(row)));
}
