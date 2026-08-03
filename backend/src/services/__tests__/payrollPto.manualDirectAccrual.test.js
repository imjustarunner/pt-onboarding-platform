import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeAccrualFromBasisHours,
  paidTimeBasisFromSummaryRow
} from '../../utils/payrollPtoAccrual.util.js';

const policy = {
  sickHourlyMultiplier: 1,
  sickFfsMultiplier: 1.2,
  trainingAccrualPer30: 0.25,
  trainingPtoEnabled: true
};

test('hourly sick is 1:1 and never earns training', () => {
  const out = computeAccrualFromBasisHours({
    basisHours: 30,
    policy,
    employmentType: 'hourly',
    trainingPtoEligible: true
  });
  assert.equal(out.sickEarn, 30);
  assert.equal(out.trainingEarn, 0);
});

test('fee_for_service sick is 1.2 per credit', () => {
  const out = computeAccrualFromBasisHours({
    basisHours: 10,
    policy,
    employmentType: 'fee_for_service',
    trainingPtoEligible: true
  });
  assert.equal(out.sickEarn, 12);
  assert.equal(out.trainingEarn, Math.round((10 / 30) * 0.25 * 100) / 100);
});

test('salaried earns training from credits but not sick', () => {
  const out = computeAccrualFromBasisHours({
    basisHours: 30,
    policy,
    employmentType: 'salaried',
    trainingPtoEligible: true
  });
  assert.equal(out.sickEarn, 0);
  assert.equal(out.trainingEarn, 0.25);
});

test('training skipped when agency training disabled', () => {
  const out = computeAccrualFromBasisHours({
    basisHours: 60,
    policy: { ...policy, trainingPtoEnabled: false },
    employmentType: 'fee_for_service',
    trainingPtoEligible: true
  });
  assert.equal(out.sickEarn, 72);
  assert.equal(out.trainingEarn, 0);
});

test('paidTimeBasisFromSummaryRow includes otherPaidTimeHours', () => {
  const basis = paidTimeBasisFromSummaryRow({
    direct_hours: 5,
    indirect_hours: 3,
    total_hours: 10,
    breakdown: { otherPaidTimeHours: 2 }
  });
  assert.equal(basis, 10);
});

test('paidTimeBasisFromSummaryRow recovers other_1 from legacy adjustment lines', () => {
  const basis = paidTimeBasisFromSummaryRow({
    direct_hours: 4,
    indirect_hours: 1,
    total_hours: 7,
    breakdown: {
      __adjustments: {
        lines: [
          { bucket: 'other_1', meta: { creditsHours: 2 } }
        ]
      }
    }
  });
  assert.equal(basis, 7);
});
