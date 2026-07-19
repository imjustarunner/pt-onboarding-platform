/**
 * Agency feature_flags helpers for gated medical billing.
 */

export function parseFeatureFlags(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return typeof raw === 'string' && raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function isTruthyFlag(v) {
  return v === true || v === 1 || v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/** One tenant switch: medicalBillingEnabled turns the full medical billing stack on. */
export function getMedicalBillingFlags(agencyOrFlags) {
  const flags = agencyOrFlags?.feature_flags != null
    ? parseFeatureFlags(agencyOrFlags.feature_flags)
    : parseFeatureFlags(agencyOrFlags);
  const master = isTruthyFlag(flags.medicalBillingEnabled);
  return {
    medicalBillingEnabled: master,
    clinicalChartEnabled: master,
    clinicalNoteSigningEnabled: master,
    medicalClaimsEnabled: master,
    claimMdEnabled: master
  };
}

export function assertMedicalBillingFlag(agencyOrFlags, childKey = null) {
  const f = getMedicalBillingFlags(agencyOrFlags);
  if (!f.medicalBillingEnabled) {
    const err = new Error('Medical billing is not enabled for this agency');
    err.status = 403;
    throw err;
  }
  if (childKey && !f[childKey]) {
    const err = new Error(`${childKey} is not enabled for this agency`);
    err.status = 403;
    throw err;
  }
  return f;
}
