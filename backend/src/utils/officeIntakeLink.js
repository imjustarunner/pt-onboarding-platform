export function linkLooksLikeOfficeIntake(link) {
  if (!link) return false;
  if (Number(link.inherits_school_master || 0) === 1) return false;
  const scope = String(link.scope_type || '').toLowerCase();
  if (scope === 'school') return false;
  return Number(link.inherits_office_master || 0) === 1 || scope === 'agency';
}

export function isOfficeEarlyAccountProvisionLink(link) {
  return linkLooksLikeOfficeIntake(link);
}
