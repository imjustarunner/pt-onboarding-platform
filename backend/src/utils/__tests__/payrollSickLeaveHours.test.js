import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSickLeaveHours, uniformSickLeaveAccrual, uniformSickLeavePolicyApplies, withSickLeaveHours } from '../payrollSickLeaveHours.js';

test('requested clinical, H2014, H0031 and indirect examples use one common denominator', () => {
  const result = calculateSickLeaveHours({ total_amount: 91, direct_hours: 2.5, indirect_hours: 0.75, breakdown: {
    '90837': { hours: 1, amount: 44, category: 'direct' },
    H2014: { hours: 1, amount: 22, category: 'direct', units: 4 },
    H0031: { hours: 0.5, amount: 10, category: 'direct', units: 30 },
    INDIRECT: { hours: 0.75, amount: 15, category: 'indirect' }
  } });
  assert.equal(result.clinicalSickLeaveHours, 1.2);
  assert.equal(result.directHours, 1.5);
  assert.equal(result.indirectHours, 0.75);
  assert.equal(result.sickLeaveHours, 3.45);
  assert.equal(result.projectedSickLeaveAccrual, 0.115);
  assert.equal(result.ordinaryEarnings, 91);
  assert.equal(result.adpAllocationRate, 26.376812);
  assert.equal(result.reconciliationRequired, false);
  assert.equal(result.actualWorkedHours, null);
  assert.equal(result.actualHoursReviewRequired, true);
});

test('H-code automatic indirect and homework/tutoring count once without clinical multiplier', () => {
  const result = calculateSickLeaveHours({ total_amount: 68, direct_hours: 3, indirect_hours: 1/6, breakdown: {
    H2014: { hours: 1, amount: 20, payType: 'hcode' },
    'AUTO INDIRECT': { hours: 1/6, amount: 4, category: 'indirect' },
    'HOMEWORK HELP': { hours: 1, amount: 20, category: 'direct' },
    TUTORING: { hours: 1, amount: 24, category: 'tutoring' },
    __paySystem: { lines: [{ payType: 'hcode', autoIndirectHours: 1/6 }], leaveBasis: { indirect: 1/6 } }
  } });
  assert.equal(result.sickLeaveHours, 3.166667);
  assert.equal(result.clinicalCredits, 0);
});

test('bonus variants, fee shares, leave pay and reimbursements stay separate with no invented hours', () => {
  const result = calculateSickLeaveHours({ total_amount: 272, direct_hours: 1, breakdown: {
    '90837': { hours: 1, amount: 44 },
    __adjustments: { lines: [
      { type: 'time_claim', taxable: true, amount: 32, meta: { creditsHours: 0, claimType: 'missed_session_fee' } },
      { type: 'bonus', taxable: true, amount: 25 },
      { type: 'holiday_bonus', taxable: true, amount: 15 },
      { type: 'shift_coverage', taxable: true, amount: 10 },
      { type: 'pto', taxable: true, amount: 88 },
      { type: 'mileage', taxable: false, amount: 58 }
    ] }
  } });
  assert.equal(result.sickLeaveHours, 1.2);
  assert.equal(result.ordinaryEarnings, 44);
  assert.equal(result.bonusPay, 50);
  assert.equal(result.extraTaxablePay, 32);
  assert.equal(result.ptoPay, 88);
  assert.equal(result.nonTaxablePay, 58);
  assert.equal(result.unclassifiedPay, 0);
});

test('salary suppresses service-base dollars but preserves additional approved time-claim earnings', () => {
  const result = calculateSickLeaveHours({ total_amount: 3261.52, direct_hours: 14, indirect_hours: 11.4, breakdown: {
    '90837': { hours: 14, amount: 0 },
    '99415': { hours: 7.719722, amount: 501.78194, category: 'indirect' },
    MEETING: { hours: 0.836167, amount: 0, category: 'indirect' },
    __adjustments: { salaryAmount: 3076.92, salaryIncludeServicePay: false, lines: [
      { type: 'time_claim', taxable: true, amount: 184.60, bucket: 'indirect', meta: { creditsHours: 2.84 } }
    ] }
  } });
  assert.equal(result.ordinaryEarnings, 184.60);
  assert.equal(result.salaryPay, 3076.92);
  assert.equal(result.unclassifiedPay, 0);
});

test('actual compensable hours set an accrual floor while remaining separately identifiable', () => {
  const result = calculateSickLeaveHours({ total_amount: 44, actual_worked_hours: 1.5, breakdown: { '90837': { hours: 1, amount: 44 } } });
  assert.equal(result.equivalentHours, 1.2);
  assert.equal(result.reconciliationHours, 0.3);
  assert.equal(result.sickLeaveHours, 1.5);
  assert.equal(result.actualHoursReviewRequired, false);
  assert.equal(result.allocationRateIsLegalHourlyRate, false);
});

test('uniform accrual rounds up to ledger hundredths and subtracts already credited amounts once', () => {
  const summaryRow = { breakdown: { __sickLeaveHours: { sickLeaveHours: 3.45 } } };
  assert.equal(uniformSickLeaveAccrual({ summaryRow }).sickEarn, 0.12);
  assert.equal(uniformSickLeaveAccrual({ summaryRow, alreadyCreditedSickHours: 0.04 }).sickEarn, 0.08);
  assert.equal(uniformSickLeaveAccrual({ summaryRow, alreadyCreditedSickHours: 1 }).sickEarn, 0);
  assert.equal(uniformSickLeaveAccrual({ summaryRow, preservePriorEarn: 0.14 }).sickEarn, 0.14);
  assert.equal(uniformSickLeaveAccrual({ summaryRow, preservePriorEarn: 0.08 }).sickEarn, 0.12);
});

test('prospective dates and saved snapshots preserve historical calculations', () => {
  const policy = { sickLeaveHoursEffectiveOn: '2026-11-07' };
  assert.equal(uniformSickLeavePolicyApplies({ policy, periodStart: '2026-10-24' }), false);
  assert.equal(uniformSickLeavePolicyApplies({ policy, periodStart: '2026-11-07' }), true);
  assert.equal(uniformSickLeavePolicyApplies({ policy: {}, periodStart: '2026-11-07' }), false);
  const saved = { version: 'saved', sickLeaveHours: 10 };
  assert.deepEqual(withSickLeaveHours({ breakdown: JSON.stringify({ __sickLeaveHours: saved }) }).sick_leave_summary, saved);
});

test('unreconciled earning classifications remain visible instead of inventing an hourly amount', () => {
  const result = calculateSickLeaveHours({ total_amount: 100, breakdown: {} });
  assert.equal(result.adpAllocationRate, null);
  assert.equal(result.unclassifiedPay, 100);
  assert.equal(result.reconciliationRequired, true);
});

test('explicit pay types override code prefixes and flat quantities never create accrual hours', () => {
  const result = calculateSickLeaveHours({ total_amount: 88, breakdown: {
    '90837': { hours: 1, amount: 18, category: 'direct', payType: 'support_activity' },
    '90834': { hours: 1, amount: 20, category: 'direct', payType: 'indirect' },
    '99999': { hours: 0, creditsHours: 0, hourEquivalent: 4, amount: 50, category: 'direct', payType: 'flat' },
    '99998': { hours: 0, hourEquivalent: 2, amount: 0, category: 'direct', payType: 'skip' }
  } });
  assert.equal(result.clinicalCredits, 0);
  assert.equal(result.sickLeaveHours, 2);
  assert.equal(result.supportHours, 1);
  assert.equal(result.indirectHours, 1);
  assert.equal(result.ordinaryEarnings, 38);
  assert.equal(result.extraTaxablePay, 50);
  assert.equal(result.unclassifiedPay, 0);
});


test('future app example includes automatic H-code indirect separately and exactly once', () => {
  const row = { total_amount: 96, direct_hours: 2.5, indirect_hours: 1, breakdown: {
    '90837': { hours: 1, amount: 44, payType: 'credit' },
    H2014: { hours: 1, amount: 22, payType: 'hcode' },
    H0031: { hours: 0.5, amount: 10, payType: 'hcode' },
    'AUTO INDIRECT': { hours: 0.25, amount: 5, category: 'indirect', rateSource: 'pay_system_auto_indirect' },
    INDIRECT: { hours: 0.75, amount: 15, category: 'indirect' },
    __paySystem: { autoIndirectAmount: 5, leaveBasis: { indirect: 0.25 } }
  } };
  const result=calculateSickLeaveHours(row);
  assert.equal(result.sickLeaveHours,3.7);
  assert.equal(result.automaticIndirectHours,0.25);
  assert.equal(result.automaticIndirectPay,5);
  assert.equal(result.additionalIndirectHours,0.75);
  assert.equal(result.ordinaryEarnings,96);
  assert.equal(result.projectedSickLeaveAccrual,0.123333);
  assert.equal(result.reconciliationRequired,false);
});

test('current and earlier periods hide projections without modifying saved snapshots or balances', () => {
  const saved={total_hours:27.46,total_amount:1180.30,breakdown:{__sickLeaveHours:{sickLeaveHours:32.16},'90837':{hours:23.5,amount:1034}}};
  const before=JSON.stringify(saved);
  for(const periodStart of ['2026-10-10','2026-10-24']) {
    const result=withSickLeaveHours(saved,{policy:{sickLeaveHoursEffectiveOn:'2026-11-07'},periodStart});
    assert.equal(result.sick_leave_summary,null);
    assert.equal(result.sick_leave_calculation_active,false);
    assert.equal(result.breakdown.__sickLeaveHours,undefined);
    assert.equal(result.total_hours,27.46);
    assert.equal(result.total_amount,1180.30);
  }
  assert.equal(JSON.stringify(saved),before);
  const future=withSickLeaveHours({total_amount:44,breakdown:{'90837':{hours:1,amount:44}}},{policy:{sickLeaveHoursEffectiveOn:'2026-11-07'},periodStart:'2026-11-07'});
  assert.equal(future.sick_leave_summary.sickLeaveHours,1.2);
});


test('owner-approved current period starts app calculation without converting earlier periods', () => {
  const policy={sickLeaveHoursEffectiveOn:'2026-10-24'};
  const row={total_amount:27,breakdown:{H2014:{hours:1.5,amount:27,payType:'hcode'}}};
  assert.equal(withSickLeaveHours(row,{policy,periodStart:'2026-10-10'}).sick_leave_calculation_active,false);
  assert.equal(withSickLeaveHours(row,{policy,periodStart:'2026-10-24'}).sick_leave_summary.sickLeaveHours,1.5);
  assert.equal(withSickLeaveHours(row,{policy,periodStart:'2026-11-07'}).sick_leave_calculation_active,true);
});

test('completed October 23 statements retain their existing automatic indirect pay line', () => {
  const row={total_amount:35,total_hours:1.75,breakdown:{H2014:{hours:1.5,amount:30,payType:'hcode'},'AUTO INDIRECT':{hours:.25,amount:5,category:'indirect'}}};
  const before=JSON.stringify(row);
  const shown=withSickLeaveHours(row,{policy:{sickLeaveHoursEffectiveOn:'2026-10-24'},periodStart:'2026-10-10'});
  assert.equal(shown.sick_leave_calculation_active,false);
  assert.equal(shown.total_amount,35);assert.equal(shown.total_hours,1.75);
  assert.deepEqual(shown.breakdown['AUTO INDIRECT'],row.breakdown['AUTO INDIRECT']);
  assert.equal(JSON.stringify(row),before);
});
