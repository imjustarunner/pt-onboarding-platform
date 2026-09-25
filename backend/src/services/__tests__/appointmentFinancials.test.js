import {it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{}}));
vi.mock('../familyBillingEncryption.service.js',()=>({decryptFamilyBilling:vi.fn()}));
import {patientLedgerSummary} from '../appointmentFinancials.service.js';
it('shows final zero responsibility separately from a preserved payment awaiting refund',()=>{
  expect(patientLedgerSummary({amount_cents:3000,paid_cents:3000,status:'paid',currency:'USD'},{zeroResponsibilityClosed:true,finalPatientResponsibilityCents:0})).toMatchObject({responsibilityCents:0,paidCents:3000,balanceCents:0,refundReviewCents:3000});
});
it('subtracts a posted copay once and leaves insurance reimbursement unknown',()=>{
  const result=patientLedgerSummary({amount_cents:4000,paid_cents:4000,status:'paid'},{});expect(result.balanceCents).toBe(0);expect(result).not.toHaveProperty('insurancePaidCents');
});
