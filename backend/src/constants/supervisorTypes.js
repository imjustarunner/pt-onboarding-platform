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
