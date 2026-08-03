import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeAccrualFromBasisHours,
  paidTimeBasisFromSummaryRow
} from '../../utils/payrollPtoAccrual.util.js';

const policy = {
  sickHourlyMultiplier: 0.034,
  sickFfsMultiplier: 0.04,
  trainingAccrualPer30: 0.25,
  trainingPtoEnabled: true
};

test('hourly sick uses 0.034 ratio and never earns training', () => {
  const out = computeAccrualFromBasisHours({
    basisHours: 100,
    policy,
    employmentType: 'hourly',
    trainingPtoEligible: true
  });
  assert.equal(out.sickEarn, 3.4);
  assert.equal(out.trainingEarn, 0);
});

test('fee_for_service sick uses 0.04 on all paid time', () => {
  const out = computeAccrualFromBasisHours({
    basisHours: 100,
    policy,
    employmentType: 'fee_for_service',
    trainingPtoEligible: true
  });
  assert.equal(out.sickEarn, 4);
  assert.equal(out.trainingEarn, Math.round((100 / 30) * 0.25 * 100) / 100);
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

test('paidTimeBasisFromSummaryRow includes otherPaidTimeHours', () => {
  const basis = paidTimeBasisFromSummaryRow({
    direct_hours: 5,
    indirect_hours: 3,
    total_hours: 10,
    breakdown: { otherPaidTimeHours: 2 }
  });
  assert.equal(basis, 10);
});
