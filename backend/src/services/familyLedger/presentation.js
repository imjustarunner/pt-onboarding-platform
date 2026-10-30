export const responsibilityLabels = { self_pay: 'Self-pay', copay: 'Copay', deductible: 'Deductible', coinsurance: 'Coinsurance', patient_balance: 'Patient responsibility', missed_session_fee: 'Missed appointment fee' };

export function presentBalance(row, { collectible, own, staff = false, responsibility = {} }) {
  const synthetic = row.sourceType === 'qa_appointment' && responsibility.syntheticOnly === true && responsibility.noCollection === true;
  const net = Math.max(0, Number(row.amountCents) - Number(row.paidCents));
  const due = !synthetic && collectible && row.status === 'open' && !row.holdReason && !row.disputedAt ? net : 0;
  const settled = row.status === 'paid' || (net === 0 && Number(row.paidCents) > 0);
  const noResponsibility = responsibility.zeroResponsibilityClosed === true && responsibility.finalPatientResponsibilityCents === 0;
  const refundReviewCents = noResponsibility ? Number(row.paidCents) : 0;
  const label = responsibilityLabels[responsibility.responsibilityType] || 'Services';
  const coverageReview = !synthetic && !collectible && !settled && !noResponsibility && !row.disputedAt
    && ['review', 'open'].includes(row.status) && row.holdReason === 'insurance_review';
  const responsibilityOnly = ['claim_responsibility', 'clinical_copay'].includes(row.sourceType)
    || ['copay', 'deductible', 'coinsurance', 'patient_balance'].includes(responsibility.responsibilityType);
  const referenceCents = Number(row.totalCents);
  const referencePrice = coverageReview && row.totalCents != null && Number.isSafeInteger(referenceCents) && referenceCents >= 0
    ? { amountCents: referenceCents, label: responsibilityOnly ? 'Previously recorded amount — under review' : 'Service price before coverage review' }
    : null;
  return {
    ...row,
    ...(synthetic ? { demoAmountCents: Number(row.amountCents) } : {}),
    ...(referencePrice ? { referencePrice } : {}),
    ...(noResponsibility ? { amountCents: 0, totalCents: 0, patientResponsibilityCents: 0, refundReviewCents } : {}),
    balanceCents: staff ? net : due,
    dueCents: due,
    // Held/unverified gross charges are not patient bills.
    ...(!staff && !collectible && !settled ? {amountCents:null,totalCents:null} : {}),
    isOwnShare: !!own,
    canPay: !staff && own && due > 0,
    canArrangePayments: !staff && !!own && (due > 0 || (synthetic && net > 0 && row.status === 'review' && row.holdReason === 'synthetic_demo' && !row.disputedAt)),
    autoPayAvailable: !synthetic,
    billingState: noResponsibility ? 'closed' : settled ? 'paid' : row.status === 'void' ? 'void' : due > 0 ? 'due' : 'review',
    ...(responsibility.serviceTerm ? {serviceCode:responsibility.serviceTerm.serviceCode,serviceUnits:responsibility.serviceTerm.units,unitAmountCents:responsibility.serviceTerm.amountCents,priceBasis:responsibility.serviceTerm.priceBasis} : {}),
    description: synthetic ? (responsibility.outcome === 'no_show' ? 'Missed appointment' : responsibility.outcome === 'completed' ? 'Counseling session' : 'Late cancellation') : responsibility.responsibilityType === 'missed_session_fee' ? (responsibility.feeKind === 'late_cancel' ? 'Late cancellation fee' : 'Missed appointment fee') : label === 'Services' ? 'Services' : `Visit · ${label}`,
    explanation: synthetic ? 'Test balance only. Nothing is due and payments are disabled.' : referencePrice ? (responsibilityOnly ? 'This previously recorded amount is being reviewed. We will confirm your share after reviewing coverage and payment terms. No payment is due yet.' : 'This is the full service price for reference. We are reviewing your coverage and payment terms to confirm your share. No payment is due yet.') : noResponsibility ? (refundReviewCents > 0 ? 'Your final patient responsibility is $0. Nothing is due. The office is reviewing your prior payment for a refund.' : 'Your final patient responsibility is $0. This balance is closed; nothing is due.') : settled ? 'Payment recorded. Nothing remains due for this share.' : row.status === 'void' ? 'Cancelled. Nothing is due.' : due === 0 ? 'Under review. Nothing is due while billing verifies your responsibility.' : responsibility.verificationBasis === 'era' ? 'Your share verified against the payer’s remittance, less payments already recorded.' : responsibility.responsibilityType === 'copay' ? 'Copay verified for this visit. The payer’s final determination may change your responsibility; prior payments will be applied.' : responsibility.responsibilityType === 'self_pay' ? 'Your agreed self-pay price for this completed visit, less payments already recorded.' : 'Your verified share, less payments already recorded.'
  };
}
