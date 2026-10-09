import { describe, expect, it } from 'vitest';
import { employeeTimeStatusLabel, isTimeAppliedToPayroll } from '../employeeTimeStatus';
import { getPayrollActionRequired } from '../payrollUiHelpers';

describe('employee recorded time payroll status', () => {
  it.each([
    { source: 'onboarding_portal' },
    { source: 'provider_update' },
    { source: 'cosign_review_activity' },
    { noteAidUsedDuringSession: true, entryMethod: 'clock' }
  ])('keeps $source audit entries pending without implying approval', (payload) => {
    const row = { id: 1, status: 'submitted', payload };
    expect(employeeTimeStatusLabel(row)).toBe('Awaiting payroll review');
    expect(isTimeAppliedToPayroll(row)).toBe(false);
    expect(getPayrollActionRequired({ timeClaims: [row] })[0].statusLabel).toBe('Awaiting payroll review');
    expect(row.status).toBe('submitted'); // Backend actions still use the real audit status.
  });
  it.each([
    {}, { target_payroll_period_id: 4 }, { applied_amount: 32.5 },
    { target_payroll_period_id: 4, applied_amount: null },
    { target_payroll_period_id: 4, applied_amount: '' },
    { target_payroll_period_id: 4, applied_amount: 'invalid' },
    { target_payroll_period_id: 4, applied_amount: -1 }
  ])('requires application evidence after acceptance: %j', (fields) => {
    const row = { status: 'approved', ...fields };
    expect(isTimeAppliedToPayroll(row)).toBe(false);
    expect(employeeTimeStatusLabel(row)).toBe('Accepted — awaiting payroll application');
  });
  it.each([0, 32.5, '32.50'])('shows approved amounts, including zero, only once assigned to payroll', (amount) => {
    const row = { status: 'approved', target_payroll_period_id: 4, applied_amount: amount };
    expect(isTimeAppliedToPayroll(row)).toBe(true);
    expect(employeeTimeStatusLabel(row)).toBe('Applied to payroll');
    expect(employeeTimeStatusLabel({ ...row, status: 'paid' })).toBe('Paid');
    expect(isTimeAppliedToPayroll({ ...row, status: 'submitted' })).toBe(false);
  });
  it('uses the same policy for co-sign activity rows and accurately shows corrections', () => {
    expect(employeeTimeStatusLabel({ claim_status: 'submitted' })).toBe('Awaiting payroll review');
    expect(employeeTimeStatusLabel({ claim_status: 'approved', target_payroll_period_id: 2, applied_amount: 10 })).toBe('Applied to payroll');
    expect(employeeTimeStatusLabel({ claim_status: null })).toBe('Recorded — awaiting confirmation');
    expect(employeeTimeStatusLabel({ status: 'deferred' })).toBe('Needs changes');
    expect(employeeTimeStatusLabel({ status: 'rejected' })).toBe('Not accepted');
    expect(employeeTimeStatusLabel({ status: 'withdrawn' })).toBe('Withdrawn');
  });
  it('preserves presentation and actions for other kinds of claims', () => {
    const row = { id: 9, status: 'submitted' };
    expect(getPayrollActionRequired({ mileageClaims: [row] })[0].statusLabel).toBe('Pending');
    expect(row.status).toBe('submitted');
  });
});
