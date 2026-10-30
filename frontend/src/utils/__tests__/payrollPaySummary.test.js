import { expect, it } from 'vitest';
import { mergePayrollPaySummaryRows } from '../payrollPaySummary';

it('adds each period once and calculates a weighted allocation instead of summing rates', () => {
  const rows = mergePayrollPaySummaryRows([
    { user_id: 1, provider_name: 'Test', total_pay: 60, ordinary_earnings: 60, sick_leave_hours: 1.2, adp_allocation_rate: 50, actual_worked_hours: 1, actual_hours_review_required: 'NO' },
    { user_id: 1, provider_name: 'Test', total_pay: 40, ordinary_earnings: 40, sick_leave_hours: 1, adp_allocation_rate: 40, actual_worked_hours: 1, actual_hours_review_required: 'NO' }
  ]);
  expect(rows).toHaveLength(1);
  expect(rows[0].total_pay).toBe(100);
  expect(rows[0].sick_leave_hours).toBe(2.2);
  expect(rows[0].adp_allocation_rate).toBeCloseTo(100/2.2);
  expect(rows[0].actual_worked_hours).toBe(2);
});

it('keeps people with the same name separate and does not turn missing actual time into zero', () => {
  const rows = mergePayrollPaySummaryRows([
    { user_id: 1, provider_name: 'Test', total_pay: 40, actual_worked_hours: 1 },
    { user_id: 1, provider_name: 'Test', total_pay: 50, actual_worked_hours: null, actual_hours_review_required: 'YES' },
    { user_id: 2, provider_name: 'Test', total_pay: 30, actual_worked_hours: 1 }
  ]);
  expect(rows).toHaveLength(2);
  expect(rows[0].total_pay).toBe(90);
  expect(rows[0].actual_worked_hours).toBeNull();
  expect(rows[0].actual_hours_review_required).toBe('YES');
  expect(rows[1].total_pay).toBe(30);
});


it('does not turn current or mixed-period reporting into a historical sick-leave adjustment',()=>{
 const rows=mergePayrollPaySummaryRows([
 {user_id:7,total_pay:100,sick_leave_hours:null,ordinary_earnings:null,sick_leave_calculation_active:false},
 {user_id:7,total_pay:200,sick_leave_hours:5,ordinary_earnings:200,sick_leave_calculation_active:true}
 ]);
 expect(rows[0]).toMatchObject({total_pay:300,sick_leave_hours:null,ordinary_earnings:null,adp_allocation_rate:null,actual_hours_review_required:''});
});
