import { describe, it, expect } from 'vitest';
import { coverageFingerprint } from '../coverageVerification.service.js';
import { estimatePatientShare } from '../familyLedger/patientSharePreview.js';

const serviceDate = '2026-11-21';
const now = new Date('2026-11-21T20:00:00Z');
const insurance = {
  primary: {
    insurerName: 'Example payer', payerId: 'EXAMPLE', memberId: 'X123',
    subscriberFirstName: 'Sample', subscriberLastName: 'Patient', subscriberDob: '1985-04-18',
    relationshipToSubscriber: 'self'
  }
};

function input(deductible) {
  const benefits = [
    { benefit_coverage_code: 'A', benefit_period_code: '27', benefit_percent: '0.2' },
    { benefit_coverage_code: 'B', benefit_period_code: '27', benefit_amount: '0' },
    { benefit_coverage_code: 'C', benefit_period_code: '23', benefit_amount: '1000' },
    { benefit_coverage_code: 'C', benefit_period_code: '29', benefit_amount: deductible }
  ];
  const check = {
    id: 3, policy_slot: 'primary', status: 'returned', insurance_fingerprint: coverageFingerprint(insurance),
    evidence: {
      summary: { status: 'active_reported', identityMatches: true },
      result: {
        elig: {
          payerid: 'EXAMPLE', eligid: 'example-271', ins_number: 'X123', ins_name_f: 'Sample',
          ins_name_l: 'Patient', ins_dob: '19850418',
          benefit: [
            { benefit_code: '30', benefit_coverage_code: '1' },
            ...benefits.map((row) => ({ benefit_code: 'MH', benefit_level_code: 'IND', inplan_network: 'Y', ...row }))
          ]
        }
      }
    }
  };
  return { insurance, coverage: { latestCheckId: 3, checks: [check] }, serviceDate, allowedAmountCents: 12000, now };
}

describe('insured patient share preview', () => {
  it.each([
    ['0', 0, 2400, 2400],
    ['50', 5000, 1400, 6400],
    ['150', 12000, 0, 12000]
  ])('applies %s dollars of remaining deductible up to the allowed amount', (remaining, deductibleAppliedCents, coinsuranceCents, estimatedPatientCents) => {
    expect(estimatePatientShare(input(remaining))).toMatchObject({
      deductibleAppliedCents, coinsuranceCents, estimatedPatientCents, coinsuranceBasisPoints: 2000
    });
  });

  it('rounds the patient share to the nearest cent', () => {
    expect(estimatePatientShare({ ...input('0'), allowedAmountCents: 12003 }).estimatedPatientCents).toBe(2401);
  });

  it('holds when the deductible is missing or the evidence is no longer current', () => {
    expect(() => estimatePatientShare(input(''))).toThrow('explicit deductible');
    expect(() => estimatePatientShare({ ...input('0'), now: new Date('2026-12-01T00:00:00Z') })).toThrow('plan benefits');
    const request = input('0');
    request.coverage.latestCheckId = 4;
    expect(() => estimatePatientShare(request)).toThrow('active eligibility');
  });

  it('holds unresolved coverage and mixed copays', () => {
    const request = input('0');
    request.coverage.latestReview = { status: 'unresolved' };
    expect(() => estimatePatientShare(request)).toThrow('outstanding coverage');
    request.coverage.latestReview.status = 'verified';
    request.coverage.checks[0].evidence.result.elig.benefit[2].benefit_amount = '25';
    expect(() => estimatePatientShare(request)).toThrow('confirmed zero copay');
  });
});
