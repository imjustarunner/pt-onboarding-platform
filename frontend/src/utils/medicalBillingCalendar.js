/**
 * Calendar / encounter deep-links when medical billing flags are ON.
 * Keeps schedule UI additive — callers should gate with isMedicalBillingEnabled().
 */

export function noteAidEncounterQuery({
  clientId,
  officeEventId,
  encounterAction = 'document'
} = {}) {
  const q = { medicalBilling: '1' };
  if (clientId) q.clientId = String(clientId);
  if (officeEventId) q.officeEventId = String(officeEventId);
  if (encounterAction) q.encounterAction = String(encounterAction);
  return q;
}

export function medicalBillingHubPath(organizationSlug) {
  const slug = String(organizationSlug || '').trim();
  return slug ? `/${slug}/admin/medical-billing` : '/admin/medical-billing';
}
