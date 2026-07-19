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
