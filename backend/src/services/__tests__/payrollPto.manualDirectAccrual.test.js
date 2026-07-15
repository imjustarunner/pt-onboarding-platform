import test from 'node:test';
import assert from 'node:assert/strict';
import { computeAccrualFromBasisHours } from '../../utils/payrollPtoAccrual.util.js';

test('computeAccrualFromBasisHours matches posting formula (1 sick / 30 hours)', () => {
  const out = computeAccrualFromBasisHours({
    basisHours: 30,
    policy: { sickAccrualPer30: 1, trainingAccrualPer30: 0.25, trainingPtoEnabled: true },
    employmentType: 'hourly',
    trainingPtoEligible: true
  });
  assert.equal(out.sickEarn, 1);
  assert.equal(out.trainingEarn, 0.25);
});

test('computeAccrualFromBasisHours skips sick for salaried (basis forced to 0)', () => {
  const out = computeAccrualFromBasisHours({
    basisHours: 30,
    policy: { sickAccrualPer30: 1, trainingAccrualPer30: 0.25, trainingPtoEnabled: true },
    employmentType: 'salaried',
    trainingPtoEligible: true
  });
  assert.equal(out.sickEarn, 0);
  // Training also uses the same (zero) basis for salaried in posting accrual.
  assert.equal(out.trainingEarn, 0);
});

test('computeAccrualFromBasisHours skips training when not eligible / disabled', () => {
  const out = computeAccrualFromBasisHours({
    basisHours: 60,
    policy: { sickAccrualPer30: 1, trainingAccrualPer30: 0.25, trainingPtoEnabled: false },
    employmentType: 'fee_for_service',
    trainingPtoEligible: true
  });
  assert.equal(out.sickEarn, 2);
  assert.equal(out.trainingEarn, 0);
});
