/**
 * Gated medical billing — single agency flag: medicalBillingEnabled.
 * Chart, signing, claims, and Claim.MD all follow that switch.
 */

export const MEDICAL_BILLING_FLAG_KEYS = [
  'medicalBillingEnabled'
];

export function isTruthyFeatureFlag(v) {
  return v === true || v === 1 || v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export function parseAgencyFeatureFlags(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return typeof raw === 'string' && raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Master switch — medical billing / chart / claims stack. */
export function isMedicalBillingEnabled(flags) {
  return isTruthyFeatureFlag(parseAgencyFeatureFlags(flags).medicalBillingEnabled);
}

export function isClinicalChartEnabled(flags) {
  return isMedicalBillingEnabled(flags);
}

export function isClinicalNoteSigningEnabled(flags) {
  return isMedicalBillingEnabled(flags);
}

export function isMedicalClaimsEnabled(flags) {
  return isMedicalBillingEnabled(flags);
}

export function isClaimMdEnabled(flags) {
  return isMedicalBillingEnabled(flags);
}

export function canAccessMedicalBilling(user, agencyId) {
  const role = String(user?.role || user?.effectiveRole || '').toLowerCase();
  if (['provider', 'provider_plus'].includes(role) || !Number(agencyId)) return false;
  if (['admin', 'super_admin'].includes(role)) return true;
  return (user?.billingAgencyIds || []).map(Number).includes(Number(agencyId));
}

export function canAccessBillingWorkspace(user) {
  const role = String(user?.role || user?.effectiveRole || '').toLowerCase();
  if (['provider', 'provider_plus'].includes(role)) return false;
  return ['admin', 'super_admin'].includes(role) || (user?.billingAgencyIds || []).some(id => Number(id) > 0);
}
