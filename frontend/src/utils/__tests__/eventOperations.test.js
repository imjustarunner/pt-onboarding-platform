import { describe, expect, it } from 'vitest';
import { eventOperationsDraft, eventOperationsPayload, eventPaymentError, eventPaymentLabel, needsEventPayment } from '../eventOperations';

describe('event payment tracking', () => {
  it('keeps unpaid unknown amounts visible in the outstanding filter', () => {
    const draft = eventOperationsDraft({ requiresPayment: true });
    expect(eventOperationsPayload(draft).paymentAmount).toBeNull();
    expect(needsEventPayment(draft)).toBe(true);
    expect(eventPaymentLabel(draft)).toBe('Needs payment · Amount pending');
  });
  it('treats a known zero-dollar fee separately from an unknown fee and clears paid items from outstanding', () => {
    const draft = eventOperationsDraft({ requiresPayment: true, paymentAmount: 0, paymentPaid: true });
    expect(eventOperationsPayload(draft).paymentAmount).toBe(0);
    expect(needsEventPayment(draft)).toBe(false);
    expect(eventPaymentLabel(draft)).toBe('Paid · $0.00');
  });
  it.each([-1, 'invalid', Infinity, 1000000])('rejects an invalid fee %s without interpreting it as unpaid unknown', amount => {
    expect(eventPaymentError({ requiresPayment: true, paymentAmount: amount })).toContain('Enter a fee');
  });
  it('keeps publication and texting opt-in disabled on new events', () => {
    expect(eventOperationsDraft()).toMatchObject({ publicRegistrationEnabled: false, attendeeSmsEnabled: false, attendeeCheckInEnabled: false, coordinatorUserIds: [] });
  });
  it('defaults school outreach to the signed commitment audience and preserves an explicit override', () => {
    expect(eventOperationsDraft({ eventType: 'school_open_house' }).staffAudienceScope).toBe('outreach_due');
    expect(eventOperationsDraft({ eventType: 'school_open_house', staffAudienceScope: 'audience' }).staffAudienceScope).toBe('audience');
    expect(eventOperationsDraft({ eventType: 'company_event' }).staffAudienceScope).toBe('audience');
  });
});
