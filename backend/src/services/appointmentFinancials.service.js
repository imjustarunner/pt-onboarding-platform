import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import { decryptFamilyBilling } from './familyBillingEncryption.service.js';

export function patientLedgerSummary(row, payload) {
  const closedZero=payload.zeroResponsibilityClosed === true && payload.finalPatientResponsibilityCents === 0;
  const paid=Number(row.paid_cents || 0);
  return {responsibilityCents:closedZero ? 0 : Number(row.amount_cents),paidCents:paid,
    balanceCents:closedZero ? 0 : Math.max(0,Number(row.amount_cents)-paid),refundReviewCents:closedZero ? paid : 0,
    status:row.status,held:!!row.hold_reason || !!row.disputed_at,currency:row.currency,
    verificationBasis:payload.verificationBasis || null};
}

// Called only after financial authorization. Never infer insurance payments from charges.
export async function appointmentFinancials(agencyId,clientId,claim) {
  const [lines]=await clinicalPool.execute('SELECT line_number AS lineNumber,procedure_code AS serviceCode,modifiers_json AS modifiers,units,charge_cents AS chargeCents FROM clinical_claim_lines WHERE clinical_claim_id=? ORDER BY line_number',[claim.id]);
  const [[row]]=await pool.execute(`SELECT r.*,COALESCE((SELECT SUM(a.paid_cents) FROM family_receivable_allocations a WHERE a.receivable_id=r.id),0) AS paid_cents
    FROM family_receivables r WHERE r.agency_id=? AND r.client_id=?
      AND ((r.source_type='claim_responsibility' AND r.source_key=?) OR (r.source_type='clinical_copay' AND r.source_key=?))
    ORDER BY (r.source_type='claim_responsibility') DESC LIMIT 1`,[agencyId,clientId,String(claim.parent_claim_id || claim.id),String(claim.clinical_session_id || '')]);
  const payload=row?.source_payload ? decryptFamilyBilling(row.source_payload,`receivable:${agencyId}:${clientId}`) : {};
  const patient = row ? patientLedgerSummary(row,payload) : null;
  if (patient?.paidCents > 0) {
    const [payments] = await pool.execute(
      `SELECT p.allocation_id,p.snapshot_encrypted,p.amount_cents -
              COALESCE((SELECT SUM(f.amount_cents) FROM family_payment_refunds f WHERE f.payment_id=p.id AND f.status='succeeded'),0) AS net_cents
       FROM family_ledger_payments p JOIN family_receivable_allocations a ON a.id=p.allocation_id
       WHERE a.receivable_id=? AND p.agency_id=? AND p.processor='CASH' AND p.status='succeeded'`,[row.id,agencyId]);
    patient.paidExternallyCents = payments.reduce((sum,payment) => {
      const details = decryptFamilyBilling(payment.snapshot_encrypted,`ledger-payment:${agencyId}:${payment.allocation_id}`);
      return sum + (details?.paymentMethod === 'external' ? Math.max(0,Number(payment.net_cents)) : 0);
    },0);
  }
  if (patient?.status === 'open' && patient.balanceCents > 0 && !patient.held) {
    const [shares] = await pool.execute(
      `SELECT a.id AS allocationId,a.payer_user_id AS payerUserId,
              a.amount_cents-a.paid_cents AS balanceCents,CONCAT_WS(' ',u.first_name,u.last_name) AS payerName
       FROM family_receivable_allocations a JOIN users u ON u.id=a.payer_user_id
       WHERE a.receivable_id=? AND a.amount_cents>a.paid_cents ORDER BY a.id`,[row.id]);
    patient.paymentShares = shares;
  }
  return {lines,patient};
}
