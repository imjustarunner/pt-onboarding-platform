/** Tenant-scoped role on user_agencies.agency_role (NULL = inherit users.role). */
export const AGENCY_POSITION_ROLE_OPTIONS = [
  { value: '', label: 'Same as profile role' },
  { value: 'provider', label: 'Provider' },
  { value: 'provider_plus', label: 'Provider Plus' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'intern', label: 'Intern' },
  { value: 'intern_plus', label: 'Intern Plus' },
  { value: 'clinical_practice_assistant', label: 'CPA' },
  { value: 'facilitator', label: 'Facilitator' },
  { value: 'tutor', label: 'Tutor' },
  { value: 'admin', label: 'Admin' },
  { value: 'staff', label: 'Staff' },
  { value: 'support', label: 'Support' }
];

export const AGENCY_POSITION_ROLE_VALUES = new Set(
  AGENCY_POSITION_ROLE_OPTIONS.map((o) => o.value).filter(Boolean)
);

export const DISCLOSURE_INCLUDE_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'include', label: 'Always include' },
  { value: 'exclude', label: 'Never include' }
];

export function normalizeAgencyRole(role) {
  const raw = String(role || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (raw === 'cpa' || raw === 'clinical_practice_asst') return 'clinical_practice_assistant';
  if (raw === 'same_as_profile' || raw === 'inherit') return '';
  return raw;
}
