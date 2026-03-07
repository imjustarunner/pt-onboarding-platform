function normalizeName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export const FAKEY_SCHOOL_PILOT_NAMES = ['fakey school'];

export function isFakeySchoolPilotOrg(organization) {
  const name = normalizeName(organization?.name);
  if (!name) return false;
  return FAKEY_SCHOOL_PILOT_NAMES.includes(name);
}

export function isPilotSchoolStaffUser({ role, organization }) {
  const roleNorm = String(role || '').trim().toLowerCase();
  if (roleNorm !== 'school_staff') return false;
  return isFakeySchoolPilotOrg(organization);
}

