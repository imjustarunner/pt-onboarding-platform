import pool from '../../config/database.js';
import clinicalPool from '../../config/clinicalDatabase.js';
import { billingError, positiveId, requireResponsiblePayer } from '../familyBillingPolicy.service.js';
import { readClientInsurance } from '../clientInsurance.service.js';
import { hasMedicaidCoverage, isNonClinicalPaymentChannel } from '../../utils/insurancePaymentPolicy.js';
import { getReadiness, assertReady, insuranceFingerprint } from './readiness.js';
import { assertLedgerIntegrity } from './integrity.js';
import { decryptFamilyBilling } from '../familyBillingEncryption.service.js';

export function cents(value, { allowZero = false } = {}) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < (allowZero ? 0 : 1) || n > 1000000000) throw billingError(400, 'Enter a valid amount in cents');
  return n;
}
export function dateOnly(value) {
  const s = (value instanceof Date ? value.toISOString() : String(value || '')).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(Date.parse(s)) || new Date(s).toISOString().slice(0, 10) !== s) throw billingError(400, 'Enter a valid date');
  return s;
}
export const today = () => new Date().toISOString().slice(0, 10);
export function key(value) {
  const s = String(value || '');
  if (!/^[a-zA-Z0-9:_-]{8,150}$/.test(s)) throw billingError(400, 'A valid request key is required');
  return s;
}
export function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  return typeof value === 'string' ? JSON.parse(value) : value;
}
export async function requireBillingStaff(user, agencyId, db = pool) {
  const aid = positiveId(agencyId), uid = positiveId(user?.id);
  if (['provider', 'provider_plus'].includes(user.role)) throw billingError(403, 'Billing staff access is required for this organization');
  if (['super_admin', 'superadmin'].includes(user.role)) {
    const [agency] = await db.execute('SELECT id FROM agencies WHERE id = ?', [aid]);
    if (agency.length) return;
  }
  const [rows] = await db.execute('SELECT has_billing_access FROM user_agencies WHERE user_id = ? AND agency_id = ?', [uid, aid]);
  if (!rows.length || (!['admin', 'agency_admin', 'backoffice_admin'].includes(user.role) && Number(rows[0].has_billing_access) !== 1)) throw billingError(403, 'Billing staff access is required for this organization');
}
export async function requireClient(agencyId, clientId, db = pool) {
  const [rows] = await db.execute('SELECT id FROM clients WHERE id = ? AND agency_id = ?', [positiveId(clientId), positiveId(agencyId)]);
  if (!rows.length) throw billingError(404, 'Client not found in this organization');
}
export function normalizeShares(shares) {
  if (!Array.isArray(shares) || !shares.length || shares.length > 10) throw billingError(400, 'Select between one and ten responsible payers');
  const rows = shares.map(s => ({ payerUserId: positiveId(s.payerUserId), basisPoints: cents(s.basisPoints) }));
  if (new Set(rows.map(s => s.payerUserId)).size !== rows.length || rows.reduce((n, s) => n + s.basisPoints, 0) !== 10000) throw billingError(400, 'Payer percentages must total 100% with no duplicate payers');
  return rows;
}
export function allocateCents(amount, shares) {
  const total = cents(amount, { allowZero: true }), normalized = normalizeShares(shares);
  const rows = normalized.map((s, index) => ({ ...s, index, amountCents: Math.floor(total * s.basisPoints / 10000), remainder: total * s.basisPoints % 10000 }));
  let remaining = total - rows.reduce((n, s) => n + s.amountCents, 0);
  for (const row of [...rows].sort((a, b) => b.remainder - a.remainder || a.payerUserId - b.payerUserId)) if (remaining-- > 0) row.amountCents++;
  return rows.map(({ payerUserId, amountCents }) => ({ payerUserId, amountCents }));
}
export async function assertSharesAuthorized(agencyId, clientId, shares, db = pool) {
  for (const s of normalizeShares(shares)) await requireResponsiblePayer(s.payerUserId, clientId, agencyId, db);
}
export async function assertCollectible(receivable, db = pool) {
  if (receivable.status !== 'open' || receivable.disputed_at || receivable.hold_reason) throw billingError(409, 'This balance is settled or on hold and cannot be collected');
  await assertLedgerIntegrity(receivable,db);
  if(receivable.source_type==='clinical_self_pay'){const {assertSelfPayVisit}=await import('./serviceCharges.js');await assertSelfPayVisit(receivable);}
  if(receivable.source_type==='claim_responsibility') {
    const [claims]=await clinicalPool.execute(`SELECT c.id,s.encounter_status,c.claim_status,c.claim_lifecycle,
      (SELECT COALESCE(MAX(cr.id),0) FROM clinical_claim_change_requests cr WHERE cr.agency_id=c.agency_id AND cr.clinical_session_id=c.clinical_session_id) AS latest_change_id,
      EXISTS(SELECT 1 FROM clinical_claim_change_requests cr WHERE cr.agency_id=c.agency_id AND cr.clinical_session_id=c.clinical_session_id AND cr.status IN ('pending','reconciliation_required')) AS correction_pending
      FROM clinical_claims c JOIN clinical_sessions s ON s.id=c.clinical_session_id AND s.agency_id=c.agency_id AND s.client_id=c.client_id
      WHERE c.id=? AND c.agency_id=? AND c.client_id=? AND c.is_deleted=0`,[receivable.source_key,receivable.agency_id,receivable.client_id]);
    const claim=claims[0];
    if(!claim||claim.claim_lifecycle==='void'||claim.encounter_status!=='completed'||['VOID','VOIDED','CANCELLED','CANCELED'].includes(String(claim.claim_status).toUpperCase())||Number(claim.correction_pending))throw billingError(409,'The visit or claim needs review before collecting patient responsibility');
    const payload=receivable.source_payload?decryptFamilyBilling(receivable.source_payload,`receivable:${receivable.agency_id}:${receivable.client_id}`):{};
    if(Number(payload.verifiedClaimChangeId||0)!==Number(claim.latest_change_id))throw billingError(409,'The claim changed. Reverify patient responsibility before collection');
  }
  if(receivable.source_type==='learning_charge'){
    const [charges]=await db.execute('SELECT total_cents,charge_status FROM learning_session_charges WHERE id=? AND agency_id=?',[receivable.source_key,receivable.agency_id]);
    if(!charges.length||Number(charges[0].total_cents)!==Number(receivable.amount_cents)||['CAPTURED','VOIDED','REFUNDED'].includes(charges[0].charge_status))throw billingError(409,'The source charge changed or was settled. Reconcile this balance before collection.');
    const [otherPayments]=await db.execute("SELECT id FROM learning_payments WHERE agency_id=? AND learning_session_charge_id=? AND payment_status NOT IN ('VOIDED','REFUNDED','FAILED') LIMIT 1",[receivable.agency_id,receivable.source_key]);
    if(otherPayments.length)throw billingError(409,'Another payment exists for this service; reconcile it before collection');
  }
  const insurance = await readClientInsurance(receivable.client_id, receivable.agency_id, db);
  if (hasMedicaidCoverage(insurance) && !isNonClinicalPaymentChannel(receivable.service_domain)) throw billingError(409, 'Medicaid-protected services cannot be collected from the family');
  if (!isNonClinicalPaymentChannel(receivable.service_domain)) {
    if(receivable.id) {
      const { assertCoverageCollectionSafe } = await import('../coverageVerification.service.js');
      await assertCoverageCollectionSafe(receivable.agency_id,receivable.client_id,db);
    }
    if(receivable.source_type==='claim_responsibility'&&insurance?.secondary) {
      const payload=receivable.source_payload?decryptFamilyBilling(receivable.source_payload,`receivable:${receivable.agency_id}:${receivable.client_id}`):{};
      if(payload.verificationBasis!=='era'||payload.finalPayerId!==insurance.secondary.payerId)throw billingError(409,'Secondary coverage is recorded; review final payer responsibility before collection');
      const [[finalClaim]]=await clinicalPool.execute('SELECT id FROM clinical_claims WHERE id=? AND agency_id=? AND client_id=? AND parent_claim_id=? AND payer_sequence=2 AND destination_payer_id=? AND claimmd_submitted_at IS NOT NULL AND is_deleted=0 AND claim_lifecycle<>\'void\'',[payload.finalAdjudicationClaimId||0,receivable.agency_id,receivable.client_id,receivable.source_key,insurance.secondary.payerId]);
      if(!finalClaim)throw billingError(409,'Final secondary claim needs reconciliation before collection');
    }
    assertReady(await getReadiness(receivable.agency_id, receivable.client_id, db), insurance);
    if (!receivable.insurance_reviewed || receivable.insurance_fingerprint !== insuranceFingerprint(insurance)) throw billingError(409, 'Patient responsibility must be verified against current coverage or agreed self-pay terms first');
  }
}
export async function transaction(work) {
  const db = await pool.getConnection();
  try { await db.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED'); await db.beginTransaction(); const value = await work(db); await db.commit(); return value; }
  catch (e) { await db.rollback(); throw e; }
  finally { db.release(); }
}
export function allocationDue(allocation) { return Math.max(0, Number(allocation.amount_cents) - Number(allocation.paid_cents)); }
