import { describe, it, expect } from 'vitest';
import { deriveBillingOutstandingAmounts } from '../billingReportIngest.service.js';
describe('posted insurance balances', () => {
  const paid = { chargeRate: 200, insuranceAmount: 200, insuranceAmountPaid: 120, insuranceOutstanding: 0, patientResponsibility: 0, primaryPayer: 'Commercial payer' };
  it('preserves final zero balances instead of recreating contractual adjustments as debt', () => {
    expect(deriveBillingOutstandingAmounts(paid)).toMatchObject({ patientBalance: 0, insuranceOutstanding: 0 });
    expect(deriveBillingOutstandingAmounts({ ...paid, patientBalance: 25 })).toMatchObject({ patientBalance: 0, insuranceOutstanding: 0 });
  });
  it('keeps actual patient responsibility and applies prior payments', () => {
    expect(deriveBillingOutstandingAmounts({ ...paid, patientResponsibility: 25, patientAmount: 10 })).toMatchObject({ patientBalance: 15, insuranceOutstanding: 0 });
  });
  it('does not treat missing or invalid insurer balances as verified settlement', () => {
    for (const insuranceOutstanding of [null, undefined, '', 'unavailable']) expect(deriveBillingOutstandingAmounts({ ...paid, insuranceOutstanding }).insuranceOutstanding).toBe(80);
    expect(deriveBillingOutstandingAmounts({ ...paid, insuranceAmountPaid: 0 }).insuranceOutstanding).toBe(200);
  });
  it('keeps insurer follow-up open when there is a remaining payer balance', () => {
    expect(deriveBillingOutstandingAmounts({ ...paid, insuranceOutstanding: 80 })).toMatchObject({ patientBalance: 0, insuranceOutstanding: 80 });
  });
});
