function normalizeName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export const FAKEY_SCHOOL_PILOT_NAMES = ['fakey school'];
export const FAKEY_SCHOOL_PILOT_ORG_IDS = new Set([376]);

export function isFakeySchoolPilotOrg(organization) {
  const orgId = Number(organization?.id || 0);
  if (orgId && FAKEY_SCHOOL_PILOT_ORG_IDS.has(orgId)) return true;
  const name = normalizeName(organization?.name);
  const slug = normalizeName(organization?.slug || organization?.portal_url || organization?.portalUrl);
  const officialName = normalizeName(organization?.official_name || organization?.officialName);
  const markers = [name, slug, officialName].filter(Boolean);
  if (!markers.length) return false;

  const exactSet = new Set([
    ...FAKEY_SCHOOL_PILOT_NAMES,
    'fakey school',
    'fakey-school',
    'fakeyschool'
  ]);

  return markers.some((m) => exactSet.has(m) || m.includes('fakey school') || m.includes('fakey-school') || m.includes('fakey'));
}

export function isPilotSchoolStaffUser({ role, organization }) {
  const roleNorm = String(role || '').trim().toLowerCase();
  if (roleNorm !== 'school_staff') return false;
  const orgType = String(organization?.organization_type || organization?.organizationType || '').trim().toLowerCase();
  if (orgType === 'school' || orgType === 'program' || orgType === 'learning') return true;
  // Backward compatibility for environments where org type may be absent on pilot org records.
  return isFakeySchoolPilotOrg(organization);
}

