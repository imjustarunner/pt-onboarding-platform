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

export const DISCLOSURE_INCLUDE_OPTIONS = [
  { value: 'auto', label: 'Auto (clinical role or supervisor)' },
  { value: 'include', label: 'Always include on disclosure' },
  { value: 'exclude', label: 'Never include on disclosure' }
];

export function disclosureIncludeFromMembership(agency) {
  const v = agency?.include_on_disclosure;
  if (v === true || v === 1 || v === '1') return 'include';
  if (v === false || v === 0 || v === '0') return 'exclude';
  return 'auto';
}
