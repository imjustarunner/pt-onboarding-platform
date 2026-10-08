/** Shared PTO accrual math used by posting and manual direct pay lines. */

export const DEFAULT_PTO_ACCRUAL_POLICY = {
  /** Sick hours earned per 1 worked hour (hourly employees). */
  sickHourlyMultiplier: 0.034,
  /** Sick hours earned per 1 credit/hour of paid time (fee-for-service). */
  sickFfsMultiplier: 0.04,
  /** Training hours earned per 30 credits (salary / FFS when eligible). */
  trainingAccrualPer30: 0.25,
  /** @deprecated Kept for reading old agency JSON only; not used for sick math. */
  sickAccrualPer30: 1.0
};

/**
 * Accrual from paid-time basis hours/credits.
 *
 * Sick:
 *   - hourly: basis × sickHourlyMultiplier (default 0.034)
 *   - fee_for_service: basis × sickFfsMultiplier (default 0.04) — all paid time
 *   - salaried: 0 (personal PTO is contract/manual)
 *
 * Training:
 *   - hourly: always 0
 *   - salaried / fee_for_service when agency+user eligible: (basis / 30) × trainingAccrualPer30
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
  const safeHourly = Number.isFinite(hourlyMult) ? hourlyMult : 0.034;
  const safeFfs = Number.isFinite(ffsMult) ? ffsMult : 0.04;

  let sickEarn = 0;
  if (employment === 'hourly') {
    sickEarn = basis * safeHourly;
  } else if (employment === 'fee_for_service') {
    sickEarn = basis * safeFfs;
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

function parseBreakdown(summaryRow) {
  let breakdown = summaryRow?.breakdown;
  if (typeof breakdown === 'string') {
    try { breakdown = JSON.parse(breakdown); } catch { breakdown = null; }
  }
  return breakdown && typeof breakdown === 'object' ? breakdown : null;
}

/** Paid-time hours that count toward PTO (excludes flat $ buckets). */
export function paidTimeBasisFromSummaryRow(summaryRow) {
  if (!summaryRow) return 0;
  const direct = Number(summaryRow.direct_hours || 0);
  const indirect = Number(summaryRow.indirect_hours || 0);
  let otherPaid = 0;

  const breakdown = parseBreakdown(summaryRow);
  if (breakdown) {
    const stored = Number(
      breakdown.otherPaidTimeHours
      ?? breakdown.__otherHours
      ?? breakdown.otherHours
    );
    if (Number.isFinite(stored) && stored > 0) {
      otherPaid = stored;
    } else {
      const lines = Array.isArray(breakdown?.__adjustments?.lines)
        ? breakdown.__adjustments.lines
        : [];
      for (const line of lines) {
        const b = String(line?.bucket || '').trim().toLowerCase();
        if (b !== 'other' && b !== 'other_1') continue;
        const hrs = Number(line?.meta?.creditsHours ?? line?.meta?.hours ?? 0);
        if (Number.isFinite(hrs) && hrs > 0) otherPaid += hrs;
      }
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

/** Signed service-credit amendment: credit pay is unchanged; only its leave basis
 * includes the handbook admin ratio. H-code admin is already on the paid ledger.
 * Keep old service-date rows on their prior accrual policy in a mixed pay period. */
export function computeServiceCreditLeave({summaryRow, alreadyCreditedManualDirect=0, policy, employmentType, trainingPtoEligible}) {
  const breakdown=parseBreakdown(summaryRow);
  const ps=breakdown?.__paySystem;
  const modernLines=(ps?.lines||[]).filter(l=>l.compensationPolicyVersion==='itsco-2026-10-service-credit-v2');
  if (employmentType!=='fee_for_service' || !modernLines.length) return null;
  const basis=ps.leaveBasis;
  const allLinePaid=(ps.lines||[]).reduce((n,l)=>n+Number(l.hourEquivalent||0)+Number(l.autoIndirectHours||0),0);
  const remaining=Math.max(0,paidTimeBasisFromSummaryRow(summaryRow)-allLinePaid-Number(alreadyCreditedManualDirect||0));
  const direct=Number(basis.direct||0), indirect=Number(basis.indirect||0), support=Number(basis.support||0)+remaining;
  const legacy=Number(basis.legacyPaidBasis||0);
  const programEarn=(direct+indirect+support)/30+legacy*Number(policy?.sickFfsMultiplier??0.04);
  const recordedActual=Number(summaryRow?.actual_worked_hours ?? breakdown?.actualWorkedHours ?? 0);
  const statutoryFloor=Math.max(0,recordedActual/30-Number(alreadyCreditedManualDirect||0)*Number(policy?.sickFfsMultiplier??0.04));
  const old=computeAccrualFromBasisHours({basisHours:Math.max(0,paidTimeBasisFromSummaryRow(summaryRow)-alreadyCreditedManualDirect),policy,employmentType,trainingPtoEligible});
  return {sickEarn:Math.round(Math.max(programEarn,statutoryFloor)*100)/100,trainingEarn:old.trainingEarn,
    directBasisHours:direct,indirectBasisHours:indirect,supportBasisHours:support,legacyBasisHours:legacy,
    reconciliationAddedHours:Math.max(0,statutoryFloor-programEarn)};
}

/** ITSCO's Colorado protected sick-leave bank must retain the statutory carryover. */
export function protectedSickRolloverLimit({agencyId,configuredLimit}) {
  const value=Number(configuredLimit);
  const configured=Number.isFinite(value)&&value>=0?value:48;
  return Number(agencyId)===2?Math.max(48,configured):configured;
}
