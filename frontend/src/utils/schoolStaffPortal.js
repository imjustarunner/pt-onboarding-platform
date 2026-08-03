const PORTAL_ORG_TYPES = new Set(['school', 'program', 'learning']);

const pickPortalSlug = (org) => {
  const raw = org?.portal_url || org?.portalUrl || org?.slug || '';
  return String(raw || '').trim().toLowerCase();
};

const isPortalOrg = (org) => {
  const t = String(org?.organization_type || org?.organizationType || '').toLowerCase();
  return PORTAL_ORG_TYPES.has(t);
};

/** School-staff portal slugs from agency memberships (school/program/learning only). */
export function getSchoolStaffPortalSlugs(agencies = []) {
  return (Array.isArray(agencies) ? agencies : [])
    .filter((a) => isPortalOrg(a))
    .map((a) => pickPortalSlug(a))
    .filter(Boolean);
}

/** Primary school portal slug for a school_staff user (first portal org membership). */
export function getPrimarySchoolStaffPortalSlug(agencies = []) {
  const slugs = getSchoolStaffPortalSlugs(agencies);
  return slugs[0] || null;
}

export function schoolStaffBelongsToPortalSlug(agencies = [], slug) {
  const target = String(slug || '').trim().toLowerCase();
  if (!target) return false;
  return getSchoolStaffPortalSlugs(agencies).includes(target);
}
