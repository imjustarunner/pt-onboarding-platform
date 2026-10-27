export function supervisionActivityLabel(claim) {
  const p = claim?.payload || {};
  if (!p.supervisionSessionId) return null;
  return String(p.sessionType || '').toLowerCase() === 'group' ? 'Group supervision' : 'Individual supervision';
}

export function mileageUsesTier(claim, settings = {}) {
  return !claim?.event_travel_report_id && (claim?.claim_type === 'school_travel' || settings.standardMileageUsesTierRates === true);
}

export function mileageBillableMiles(claim) {
  if (claim?.claim_type === 'school_travel') return Math.max(0, Number(claim.eligible_miles ?? claim.miles ?? 0));
  return Math.max(0, Number(claim?.miles || 0)) * (Number(claim?.round_trip) === 1 ? 2 : 1);
}

export function mileageEstimate(claim, { rates = [], settings = {} } = {}, tier = claim?.tier_level) {
  if (claim?.status === 'approved') return claim.applied_amount == null ? null : Number(claim.applied_amount);
  const rate = mileageUsesTier(claim, settings)
    ? rates.find((r) => Number(r.tierLevel) === Number(tier))?.ratePerMile
    : settings.standardMileageRatePerMile;
  return Number(rate) > 0 ? Math.round(mileageBillableMiles(claim) * Number(rate) * 100) / 100 : null;
}

export function approvedTimeDraft(claim) {
  const hours = Number(claim.credits_hours ?? claim.payload?.creditsHours ?? Number(claim.payload?.totalMinutes || 0) / 60);
  const rates = claim.payEstimate?.availableRates || [];
  const storedKey = claim.payload?.payRateKey || claim.payEstimate?.selectedRateKey;
  const storedRate = claim.payload?.payRateAmount ?? claim.payEstimate?.selectedRateAmount;
  const effectiveRate = storedRate != null ? Number(storedRate) : (hours > 0 ? Number(claim.applied_amount || 0) / hours : 0);
  // Keep the approved dollars until payroll explicitly changes the rate or hours.
  const selected = rates.find((r) => r.key === storedKey && Math.abs(Number(r.amount) - effectiveRate) < 0.000001);
  return { hours, bucket: claim.bucket || claim.payload?.bucket || 'indirect', rateKey: selected?.key || 'approved_rate',
    rateAmount: effectiveRate, rateLabel: claim.payload?.payRateLabel || claim.payEstimate?.rateLabel || 'Approved rate',
    amount: Number(claim.applied_amount || 0), dirty: false };
}
