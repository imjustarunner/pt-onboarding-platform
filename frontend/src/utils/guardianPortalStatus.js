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
  if (permissions.billingOnly === true) return { label: 'Billing access', detail: permissions.billingDetailLevel === 'payer_plus' ? 'Can review billing details and make payments.' : 'Can review amounts due and make payments.' };
  if (permissions.pendingGuardianVerification === true) return { label: 'Guardian verification pending', detail: 'Verify the guardian’s identity and authority in Portal access to complete this step.' };
  if (permissions.noView === true || permissions.noViewOtherGuardian === true) return {
    label: 'Linked · records restricted', detail: 'Portal sign-in is enabled. A saved privacy restriction limits record access. Review the relationship permissions and consent in the client’s Guardians tab.'
  };
  return { label: enrollment === 'accepted' ? 'Own enrollment completed' : 'Access available', detail: enrollment === 'accepted' ? 'This guardian completed their own enrollment. Access still follows the saved permissions.' : 'Access follows the saved permissions. Enrollment completion has not been inferred from this switch.' };
}
