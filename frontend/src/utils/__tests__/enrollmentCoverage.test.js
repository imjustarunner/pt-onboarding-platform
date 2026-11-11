import { describe, expect, it } from 'vitest';
import {
  authorizationIsComplete,
  duplicateMedicaidMemberId,
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

it.each(['primary', 'secondary'])('rejects repeated sibling Medicaid IDs in %s but accepts a shared commercial subscriber', position => {
  const info = { primary: { insurerName: position === 'primary' ? 'Medicaid' : 'Commercial', memberId: 'SHARED-COMMERCIAL' },
    secondary: position === 'secondary' ? { insurerName: 'Medicaid' } : null, medicaidPlanPosition: position,
    medicaidByClient: [{clientIndex:0,memberId:'QA-ONE'}, {clientIndex:1,memberId:' qa-one '}] };
  expect(duplicateMedicaidMemberId(info,2)).toBe(true);
  info.medicaidByClient[1].memberId='QA-TWO';
  expect(duplicateMedicaidMemberId(info,2)).toBe(false);
  expect(duplicateMedicaidMemberId({primary:{insurerName:'Commercial',memberId:'FAMILY'}},2)).toBe(false);
});
it('checks separately entered Medicaid policies and allows the same ID in both tiers of one child', () => {
  const info={clientCoverages:[{clientIndex:0,primary:{insurerName:'Medicaid',memberId:'ONE'},secondary:{insurerName:'Medicaid',memberId:'ONE'}},{clientIndex:1,primary:{insurerName:'Medicaid',memberId:'TWO'}}]};
  expect(duplicateMedicaidMemberId(info,2)).toBe(false);
  info.clientCoverages[1].primary.memberId='ONE';
  expect(duplicateMedicaidMemberId(info,2)).toBe(true);
});
