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
    FROM family_receivables r WHERE r.agency_id=? AND r.client_id=? AND r.source_type='claim_responsibility' AND r.source_key=?`,[agencyId,clientId,String(claim.parent_claim_id || claim.id)]);
  const payload=row?.source_payload ? decryptFamilyBilling(row.source_payload,`receivable:${agencyId}:${clientId}`) : {};
  return {lines,patient:row ? patientLedgerSummary(row,payload) : null};
}
