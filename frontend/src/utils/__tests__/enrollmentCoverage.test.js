import { describe, expect, it } from 'vitest';
import {
  authorizationIsComplete,
  coverageWithAuthorization,
  coverageWithChoice,
  isSelfPayCoverage
} from '../enrollmentCoverage.js';

describe('enrollment coverage', () => {
  it('keeps the authorization when the person changes to self-pay', () => {
    const agreed = coverageWithAuthorization(
      { payerChoice: 'insurance', primary: { insurerName: 'Commercial', memberId: 'ABC' } },
      { agreed: true, signature: 'QA Adult' }
    );
    const selfPay = coverageWithChoice(agreed, true);
    expect(isSelfPayCoverage(selfPay)).toBe(true);
    expect(selfPay.primary.memberId).toBe('ABC');
    expect(selfPay.authorizationAgreed).toBe(true);
    expect(selfPay.authorizationSignature).toBe('QA Adult');
    expect(authorizationIsComplete(selfPay, { paymentChoice: 'na' })).toBe(true);
  });

  it('does not treat an unsigned agreement as complete', () => {
    const info = coverageWithAuthorization({ isSelfPay: true }, { agreed: true, signature: 'A' });
    expect(authorizationIsComplete(info, { paymentChoice: 'na' })).toBe(false);
  });
});
