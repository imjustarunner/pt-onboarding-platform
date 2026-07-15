/** Shared PTO accrual math used by posting and manual direct pay lines. */

export const DEFAULT_PTO_ACCRUAL_POLICY = {
  sickAccrualPer30: 1.0,
  trainingAccrualPer30: 0.25
};

/**
 * Same accrual math as posting-time PTO credit (basis / 30 × policy rates).
 * Salaried employees get 0 from an hours basis (mirrors runPtoAccrualForPostedPeriod).
 */
export function computeAccrualFromBasisHours({
  basisHours,
  policy,
  employmentType,
  trainingPtoEligible
}) {
  const employment = String(employmentType || 'hourly');
  const rawBasis = Number(basisHours || 0);
  const basis = (employment === 'hourly' || employment === 'fee_for_service')
    ? (Number.isFinite(rawBasis) ? rawBasis : 0)
    : 0;

  let sickEarn = 0;
  if (employment === 'hourly' || employment === 'fee_for_service') {
    sickEarn = (basis / 30) * Number(policy?.sickAccrualPer30 ?? DEFAULT_PTO_ACCRUAL_POLICY.sickAccrualPer30);
  }
  let trainingEarn = 0;
  if (policy?.trainingPtoEnabled && trainingPtoEligible) {
    trainingEarn = (basis / 30) * Number(policy?.trainingAccrualPer30 ?? DEFAULT_PTO_ACCRUAL_POLICY.trainingAccrualPer30);
  }

  return {
    sickEarn: Math.round(sickEarn * 100) / 100,
    trainingEarn: Math.round(trainingEarn * 100) / 100
  };
}
