export const responsibilityLabels = { copay: 'Copay', deductible: 'Deductible', coinsurance: 'Coinsurance', patient_balance: 'Patient responsibility' };

export function presentBalance(row, { collectible, own, staff = false, responsibility = {} }) {
  const net = Math.max(0, Number(row.amountCents) - Number(row.paidCents));
  const due = collectible && row.status === 'open' && !row.holdReason && !row.disputedAt ? net : 0;
  const settled = row.status === 'paid' || (net === 0 && Number(row.paidCents) > 0);
  const label = responsibilityLabels[responsibility.responsibilityType] || 'Services';
  return {
    ...row,
    balanceCents: staff ? net : due,
    dueCents: due,
    // Held/unverified gross charges are not patient bills.
    ...(!staff && !collectible && !settled ? {amountCents:null,totalCents:null} : {}),
    canPay: !staff && own && due > 0,
    billingState: settled ? 'paid' : row.status === 'void' ? 'void' : due > 0 ? 'due' : 'review',
    description: label === 'Services' ? 'Services' : `Visit · ${label}`,
    explanation: settled ? 'Payment recorded. Nothing remains due for this share.' : row.status === 'void' ? 'Cancelled. Nothing is due.' : due === 0 ? 'Under review. Nothing is due while billing verifies your responsibility.' : responsibility.verificationBasis === 'era' ? 'Your share verified against the payer’s remittance, less payments already recorded.' : responsibility.responsibilityType === 'copay' ? 'Copay verified for this visit. The payer’s final determination may change your responsibility; prior payments will be applied.' : 'Your verified share, less payments already recorded.'
  };
}
