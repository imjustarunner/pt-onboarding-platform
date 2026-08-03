/** Shared PTO accrual math used by posting and manual direct pay lines. */

export const DEFAULT_PTO_ACCRUAL_POLICY = {
  /** Sick hours earned per 1 worked hour (hourly employees). */
  sickHourlyMultiplier: 1.0,
  /** Sick hours earned per 1 credit (fee-for-service). */
  sickFfsMultiplier: 1.2,
  /** Training hours earned per 30 credits (salary / FFS when eligible). */
  trainingAccrualPer30: 0.25,
  /** @deprecated Kept for reading old agency JSON only; not used for sick math. */
  sickAccrualPer30: 1.0
};

/**
 * Accrual from paid-time basis hours/credits.
 *
 * Sick:
 *   - hourly: basis × sickHourlyMultiplier (default 1.0)
 *   - fee_for_service: basis × sickFfsMultiplier (default 1.2)
 *   - salaried: 0 (personal PTO is contract/manual)
 *
 * Training:
 *   - hourly: always 0
 *   - salaried / fee_for_service when agency+user eligible: (basis / 30) × trainingAccrualPer30
 *   - salaried uses the full basis for training (sick basis is not zeroed for training)
 */
export function computeAccrualFromBasisHours({
  basisHours,
  policy,
  employmentType,
  trainingPtoEligible
}) {
  const employment = String(employmentType || 'hourly').trim().toLowerCase();
  const rawBasis = Number(basisHours || 0);
  const basis = Number.isFinite(rawBasis) && rawBasis > 0 ? rawBasis : 0;

  const hourlyMult = Number(
    policy?.sickHourlyMultiplier
      ?? DEFAULT_PTO_ACCRUAL_POLICY.sickHourlyMultiplier
  );
  const ffsMult = Number(
    policy?.sickFfsMultiplier
      ?? DEFAULT_PTO_ACCRUAL_POLICY.sickFfsMultiplier
  );
  const trainingPer30 = Number(
    policy?.trainingAccrualPer30
      ?? DEFAULT_PTO_ACCRUAL_POLICY.trainingAccrualPer30
  );

  let sickEarn = 0;
  if (employment === 'hourly') {
    sickEarn = basis * (Number.isFinite(hourlyMult) ? hourlyMult : 1);
  } else if (employment === 'fee_for_service') {
    sickEarn = basis * (Number.isFinite(ffsMult) ? ffsMult : 1.2);
  }

  let trainingEarn = 0;
  if (employment !== 'hourly' && policy?.trainingPtoEnabled && trainingPtoEligible) {
    trainingEarn = (basis / 30) * (Number.isFinite(trainingPer30) ? trainingPer30 : 0.25);
  }

  return {
    sickEarn: Math.round(sickEarn * 100) / 100,
    trainingEarn: Math.round(trainingEarn * 100) / 100
  };
}

/** Paid-time hours that count toward PTO (excludes flat $ buckets). */
export function paidTimeBasisFromSummaryRow(summaryRow) {
  if (!summaryRow) return 0;
  const direct = Number(summaryRow.direct_hours || 0);
  const indirect = Number(summaryRow.indirect_hours || 0);
  let otherPaid = 0;

  let breakdown = summaryRow.breakdown;
  if (typeof breakdown === 'string') {
    try { breakdown = JSON.parse(breakdown); } catch { breakdown = null; }
  }
  if (breakdown && typeof breakdown === 'object') {
    const stored = Number(
      breakdown.otherPaidTimeHours
      ?? breakdown.__otherHours
      ?? breakdown.otherHours
    );
    if (Number.isFinite(stored) && stored > 0) {
      otherPaid = stored;
    } else {
      // Legacy summaries: recover other_1 / other paid-time from adjustment lines.
      const lines = Array.isArray(breakdown?.__adjustments?.lines)
        ? breakdown.__adjustments.lines
        : [];
      for (const line of lines) {
        const b = String(line?.bucket || '').trim().toLowerCase();
        if (b !== 'other' && b !== 'other_1') continue;
        const hrs = Number(line?.meta?.creditsHours ?? line?.meta?.hours ?? 0);
        if (Number.isFinite(hrs) && hrs > 0) otherPaid += hrs;
      }
      // Last resort: total − direct − indirect (flat $ codes usually have 0 credits).
      if (!(otherPaid > 0)) {
        const total = Number(summaryRow.total_hours || 0);
        const residual = total - direct - indirect;
        if (Number.isFinite(residual) && residual > 1e-9) otherPaid = residual;
      }
    }
  }

  const basis = direct + indirect + otherPaid;
  return Number.isFinite(basis) && basis > 0 ? basis : 0;
}
