const enabled = (value) => value === true || value === 1 || value === '1';
export const eventOperationsDraft = (event = {}) => ({
  requiresPayment: enabled(event.requiresPayment),
  paymentAmount: event.paymentAmount ?? '',
  paymentPaid: enabled(event.paymentPaid),
  paymentNotes: event.paymentNotes || '',
  staffAudienceScope: ['audience', 'outreach_due'].includes(event.staffAudienceScope) ? event.staffAudienceScope : (String(event.eventType || '').startsWith('school_') || String(event.category || '').includes('outreach') ? 'outreach_due' : 'audience'),
  countsTowardOutreachCommitment: enabled(event.countsTowardOutreachCommitment),
  coordinatorUserIds: Array.isArray(event.coordinatorUserIds) ? [...event.coordinatorUserIds] : [],
  publicRegistrationEnabled: enabled(event.publicRegistrationEnabled),
  attendeeCheckInEnabled: enabled(event.attendeeCheckInEnabled),
  attendeeSmsEnabled: enabled(event.attendeeSmsEnabled)
});

export const eventOperationsPayload = (draft) => ({
  ...eventOperationsDraft(draft),
  paymentAmount: draft.paymentAmount === '' || draft.paymentAmount == null ? null : Number(draft.paymentAmount),
  paymentNotes: String(draft.paymentNotes || '').trim()
});

export function eventPaymentError(draft) {
  if (!draft.requiresPayment || draft.paymentAmount === '' || draft.paymentAmount == null) return '';
  const amount = Number(draft.paymentAmount);
  return Number.isFinite(amount) && amount >= 0 && amount <= 999999.99
    ? '' : 'Enter a fee from $0 to $999,999.99, or leave the amount blank.';
}

export const needsEventPayment = (event) => enabled(event.requiresPayment) && !enabled(event.paymentPaid);

export function eventPaymentLabel(event) {
  if (!enabled(event.requiresPayment)) return 'No fee';
  const amount = event.paymentAmount == null || event.paymentAmount === ''
    ? 'Amount pending' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(event.paymentAmount));
  return `${enabled(event.paymentPaid) ? 'Paid' : 'Needs payment'} · ${amount}`;
}
