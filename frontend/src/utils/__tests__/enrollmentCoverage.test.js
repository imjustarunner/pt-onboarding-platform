import { describe, expect, it } from 'vitest';
import {
  authorizationIsComplete,
  coverageWithAuthorization,
  coverageWithChoice,
  enrollmentCoverageFingerprint,
  isSelfPayCoverage
} from '../enrollmentCoverage.js';

describe('enrollment coverage', () => {
  it('requires a new agreement and removes abandoned commercial coverage when changing to self-pay', () => {
    const agreed = coverageWithAuthorization(
      { payerChoice: 'insurance', primary: { insurerName: 'Commercial', memberId: 'ABC' } },
      { agreed: true, signature: 'QA Adult' }
    );
    const selfPay = coverageWithChoice(agreed, true);
    expect(isSelfPayCoverage(selfPay)).toBe(true);
    expect(selfPay.primary.insurerName).toBe('Self-Pay');
    expect(selfPay.primary.memberId).toBeUndefined();
    expect(selfPay.authorizationAgreed).toBe(false);
    expect(selfPay.authorizationSignature).toBe('');
    expect(authorizationIsComplete(selfPay, { paymentChoice: 'na' })).toBe(false);
  });

  it('does not treat an unsigned agreement as complete', () => {
    const info = coverageWithAuthorization({ isSelfPay: true }, { agreed: true, signature: 'A' });
    expect(authorizationIsComplete(info, { paymentChoice: 'na' })).toBe(false);
  });
  it('does not revive cleared signatures or timestamp from a previous agreement', () => {
    const previous={authorizationAgreed:true,authorizationSignature:'QA Old',authorizationSignatureData:'x'.repeat(80),authorizationSignedAt:'2026-11-01T00:00:00Z'};
    const changed=coverageWithAuthorization(previous,{agreed:false,signature:'',signatureData:''});
    expect(changed).toMatchObject({authorizationAgreed:false,authorizationSignature:'',authorizationSignatureData:'',authorizationSignedAt:null});
  });
  it('keeps known Medicaid protective coverage when self-pay is requested', () => {
    const current={primary:{insurerName:'Commercial',memberId:'ABC'},secondary:{insurerName:'Medicaid',isMedicaid:true},authorizationAgreed:true,authorizationSignature:'QA Old'};
    const next=coverageWithChoice(current,true);
    expect(next.secondary).toEqual(current.secondary);
    expect(next.authorizationAgreed).toBe(false);
  });
  it('tracks child Medicaid IDs but excludes confirmation itself from policy changes', () => {
    const before={primary:{insurerName:'Medicaid'},medicaidByClient:[{clientIndex:0,memberId:'A'},{clientIndex:1,memberId:'B'}],clientCoverages:[{clientIndex:0,confirmed:true}]};
    expect(enrollmentCoverageFingerprint({...before,clientCoverages:[{clientIndex:0,confirmed:false}]})).toBe(enrollmentCoverageFingerprint(before));
    expect(enrollmentCoverageFingerprint({...before,medicaidByClient:[{clientIndex:0,memberId:'A'},{clientIndex:1,memberId:'CHANGED'}]})).not.toBe(enrollmentCoverageFingerprint(before));
  });
});
