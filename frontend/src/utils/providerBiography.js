export function providerBiographyPermissions(actor, targetUserId, affiliations = []) {
  const targetId = Number(targetUserId), actorId = Number(actor?.id);
  const isSelf = targetId > 0 && actorId === targetId;
  const manager = ['admin', 'super_admin', 'support', 'staff'].includes(String(actor?.role || '').toLowerCase());
  const canEditPublic = isSelf || manager;
  const hasSchool = affiliations.some(affiliation => String(affiliation.organization_type || '').toLowerCase() === 'school'
    && ![false, 0, '0'].includes(affiliation.is_active));
  return { canEditPublic, hasSchool, canEditSchool: canEditPublic && hasSchool };
}

export function saveSchoolBiography(api, { userId, schoolId, schoolBlurb }) {
  if (!Number.isSafeInteger(Number(userId)) || Number(userId) <= 0
    || !Number.isSafeInteger(Number(schoolId)) || Number(schoolId) <= 0) {
    throw new Error('Select an affiliated school before saving your school biography.');
  }
  return api.put(`/users/${Number(userId)}/provider-school-biography`, {
    schoolId: Number(schoolId), schoolBlurb: String(schoolBlurb || '').trim() || null
  });
}
