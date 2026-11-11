/** Relationship availability and completed enrollment are independent facts. */
export function guardianPortalStatus(guardian = {}) {
  const enabled = Number(guardian.access_enabled) === 1;
  let permissions = guardian.permissions_json || {};
  try { if (typeof permissions === 'string') permissions = JSON.parse(permissions); } catch { permissions = { noView: true }; }
  const enrollment = String(guardian.enrollment_status || '').toLowerCase();
  const pending = enrollment === 'pending' || enrollment === 'expired' || permissions.pendingOtherGuardianEnrollment === true;
  if (pending) return {
    label: enrollment === 'expired' ? 'Own enrollment invitation expired' : 'Own enrollment and signatures pending',
    detail: enabled ? 'Linked account. Records remain restricted until their own enrollment is completed.' : 'Linked account; access disabled. Their own enrollment is not complete.'
  };
  if (!enabled) return { label: 'Access disabled', detail: 'This relationship does not currently allow portal access.' };
  if (permissions.noView === true || permissions.noViewOtherGuardian === true || permissions.pendingGuardianVerification === true) return {
    label: 'Linked · records restricted', detail: 'Account availability does not grant access to private records or another guardian’s answers.'
  };
  return { label: enrollment === 'accepted' ? 'Own enrollment completed' : 'Access available', detail: enrollment === 'accepted' ? 'This guardian completed their own enrollment. Access still follows the saved permissions.' : 'Access follows the saved permissions. Enrollment completion has not been inferred from this switch.' };
}
