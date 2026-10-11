import { expect, it } from 'vitest';
import { assessPayrollReadiness } from '../payrollReadiness.service.js';
const input = () => ({
  agency: { new_pay_system_enabled: 1 },
  period: { id: 147, period_start: '2026-10-10', period_end: '2026-10-23', status: 'draft' },
  previousPeriod: { id: 146, period_end: '2026-10-09', status: 'draft' },
  staff: [{ id: 7, category: 2, level: 2, pay_system_enabled: 1, effective_start: '2026-10-10', leave_account_user_id: 7,
    training_adp_through_date: '2026-10-09', training_adp_confirmed_at: new Date() }],
  amendments: [{ id: 1, user_id: 7, executed: true }], salaries: []
});
it('checks the new service period independently of the payroll about to be run', () => {
  expect(assessPayrollReadiness(input())).toMatchObject({ configurationChecksPassed: true, period: { id: 147 }, previousPeriod: { id: 146 } });
});
it('does not mistake configured categories and rates for payroll enrollment', () => {
  const data = input(); data.agency.new_pay_system_enabled = 0; data.staff[0].pay_system_enabled = 0; data.staff[0].effective_start = null;
  expect(assessPayrollReadiness(data).findings.map(row => row.code)).toEqual(expect.arrayContaining(['AGENCY_NOT_ENABLED', 'STAFF_NOT_ENABLED', 'START_DATE_REVIEW']));
});
it('requires executed agreements and flags conflicting salary treatment', () => {
  const data = input(); data.amendments[0].executed = false; data.salaries = [{ user_id: 7, include_service_pay: 0 }];
  expect(assessPayrollReadiness(data).findings.map(row => row.code)).toEqual(expect.arrayContaining(['SIGNATURES_PENDING', 'SALARY_OVERRIDES_SERVICE_PAY']));
});
it('does not count an older balance handoff as covering the preceding period', () => {
  const data = input(); data.staff[0].training_adp_through_date = '2026-09-25';
  expect(assessPayrollReadiness(data)).toMatchObject({ configurationChecksPassed: false, counts: { confirmedTrainingHandoffs: 0 } });
});
it('accepts database date objects and leaves salaried nonparticipants out of matrix checks', () => {
  const data = input(); data.staff[0].effective_start = new Date('2026-10-10T00:00:00Z');
  data.staff.push({ ...data.staff[0], id: 9, category: null, level: null, pay_system_enabled: 0 });
  expect(assessPayrollReadiness(data)).toMatchObject({ configurationChecksPassed: true, counts: { staff: 2, assigned: 1 } });
});
it('accepts an individual October 11 start after an October 10 salary end',()=>{
  const data=input();data.staff[0].effective_start='2026-10-11';data.salaries=[{user_id:7,include_service_pay:0,effective_end:'2026-10-10'}];
  const codes=assessPayrollReadiness(data).findings.map(row=>row.code);
  expect(codes).not.toContain('START_DATE_REVIEW');expect(codes).not.toContain('SALARY_OVERRIDES_SERVICE_PAY');
});
it('still flags salary extending into the individual new-pay dates',()=>{
  const data=input();data.staff[0].effective_start='2026-10-11';data.salaries=[{user_id:7,include_service_pay:0,effective_end:'2026-10-11'}];
  expect(assessPayrollReadiness(data).findings.map(row=>row.code)).toContain('SALARY_OVERRIDES_SERVICE_PAY');
});
