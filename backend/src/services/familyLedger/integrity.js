import pool from '../../config/database.js';
import {billingError} from '../familyBillingPolicy.service.js';

// Settlement entries, less confirmed refunds, must agree with the cached total.
// A status label alone is never sufficient evidence of payment.
export async function ledgerIntegrity(agencyId,receivableId,db=pool) {
  const [rows]=await db.execute(`SELECT a.id,a.amount_cents,a.paid_cents,
    COALESCE((SELECT SUM(p.amount_cents) FROM family_ledger_payments p WHERE p.allocation_id=a.id AND p.status='succeeded'),0)
    - COALESCE((SELECT SUM(f.amount_cents) FROM family_payment_refunds f JOIN family_ledger_payments p ON p.id=f.payment_id WHERE p.allocation_id=a.id AND f.status='succeeded'),0) AS settled_cents
    FROM family_receivable_allocations a WHERE a.agency_id=? AND a.receivable_id=?`,[agencyId,receivableId]);
  return {allocatedCents:rows.reduce((n,a)=>n+Number(a.amount_cents),0),paidCents:rows.reduce((n,a)=>n+Number(a.paid_cents),0),mismatch:rows.some(a=>Number(a.paid_cents)!==Number(a.settled_cents))};
}
export async function assertLedgerIntegrity(receivable,db=pool) {
  if(!receivable.id)return;
  const result=await ledgerIntegrity(receivable.agency_id,receivable.id,db);
  if(result.mismatch||result.allocatedCents!==Number(receivable.amount_cents))throw billingError(409,'Payment records and balance totals disagree. Reconcile this balance before collection');
}
