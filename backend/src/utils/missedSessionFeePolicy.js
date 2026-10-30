export const MISSED_FEE_POLICY_VERSION = 'missed-fee-share-v1';
export const MISSED_FEE_SHARE_BASIS_POINTS = Object.freeze({ 1: 2000, 2: 3000, 3: 4000 });

export function missedFeeProjection({ category, collectedCents, refundedCents = 0, approvedCents = 0 }) {
  const basisPoints = MISSED_FEE_SHARE_BASIS_POINTS[category];
  if (!basisPoints) throw new Error('A verified Category 1, 2 or 3 is required.');
  for (const amount of [collectedCents, refundedCents, approvedCents]) {
    if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('Fee amounts must be nonnegative integer cents.');
  }
  if (refundedCents > collectedCents) throw new Error('Refunds exceed recorded collections.');
  const netCollectedCents = collectedCents - refundedCents;
  const entitlementCents = Math.round(netCollectedCents * basisPoints / 10000);
  return { basisPoints, netCollectedCents, entitlementCents,
    pendingCents: Math.max(0, entitlementCents - approvedCents),
    reviewRequired: approvedCents > entitlementCents };
}

export function assertMissedFeeEligibility({ status, medicaid, packageEntitlementId, packageFeeReviewed = false, agreementConfirmed, evidence, eventDate, effectiveOn, enabled }) {
  if (!enabled || !effectiveOn || eventDate < effectiveOn) throw new Error('The missed-session fee compensation policy is not active for this appointment date.');
  if (!['no_show', 'late_canceled'].includes(status)) throw new Error('Complete the no-show or late-cancellation appointment outcome first.');
  if (medicaid) throw new Error('A missed-appointment fee cannot be collected for a client with Medicaid coverage.');
  if (packageEntitlementId && !packageFeeReviewed) throw new Error('Package and subscription appointments require separate agreement review; credits and forfeitures are not collected fees.');
  if (agreementConfirmed !== true || String(evidence || '').trim().length < 8) throw new Error('Confirm the existing signed client agreement permits this fee and record its reference.');
}

export function validatePackageFeeReview({ review, entitlementId, amountCents, eventDate, history = [] }) {
  if (!review || Number(review.entitlementId) !== Number(entitlementId) || review.separateFeePermitted !== true || review.existingExemptionResolved !== true || review.makeupCreditRetained !== true) throw new Error('Review the signed package agreement, resolve any existing fee exemption, and retain the makeup credit before adding a separate fee.');
  if (String(review.agreementReference || '').trim().length < 8) throw new Error('Record the signed package agreement reference.');
  const dates = [review.signedOn, review.effectiveOn];
  if (dates.some(date => !/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date)
    || review.signedOn > review.effectiveOn || review.effectiveOn > eventDate) throw new Error('The separate fee must be authorized by an agreement signed and effective on or before this appointment date; do not apply changed terms retroactively.');
  if (!Number.isSafeInteger(Number(review.permittedFeeCents)) || Number(review.permittedFeeCents) < amountCents) throw new Error('The fee exceeds the amount permitted by the reviewed package agreement.');
  if (history.some(row => row.reason_code === 'SESSION_COMPLETE')) throw new Error('A completed package session cannot also be treated as a missed session.');
  const forfeiture = history.filter(row => ['SESSION_NOSHOW_FORFEIT', 'MISSED_FREE_MISS'].includes(row.reason_code)).at(-1);
  if (forfeiture && !history.some(row => row.reason_code === 'MISSED_WAIVER_RESTORE' && Number(row.id) > Number(forfeiture.id))) throw new Error('Restore the forfeited credit or used free-miss allowance before recording a separate fee; preserve existing exemptions and never count credit consumption as a fee collection.');
  if (history.at(-1)?.direction === 'RESERVE') throw new Error('Release the unused appointment reservation so the makeup credit remains available before adding a separate fee.');
  return { entitlementId: Number(entitlementId), agreementReference: String(review.agreementReference).trim().slice(0,2000), signedOn: review.signedOn,
    effectiveOn: review.effectiveOn, permittedFeeCents: Number(review.permittedFeeCents), separateFeePermitted: true, existingExemptionResolved: true, makeupCreditRetained: true };
}
