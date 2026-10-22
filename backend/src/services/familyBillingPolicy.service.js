import crypto from 'node:crypto';
import pool from '../config/database.js';
import { encryptFamilyBilling } from './familyBillingEncryption.service.js';
import {parseSupportJson} from './clientSupportPolicy.service.js';

export const BILLING_TERMS_VERSION = 'family-billing-2026-10-21-v2';
export const BILLING_TERMS = 'I accept financial responsibility for the clients I select. I authorize this organization to keep my payment method with Stripe and to charge my selected card for the amounts I approve. If I separately enable recurring billing for a client, I authorize charges for that client’s scheduled services and patient balances at the rates and payment schedule disclosed by the organization. A verified copay may be charged on the same day after the scheduled session ends and the provider confirms that the session occurred or signs the completed session note. A canceled or unconfirmed session does not authorize an automatic copay. Charges must stay within my selected per-charge limit and the disclosed service terms. Insurance coverage and patient responsibility must be verified first; Medicaid-protected care is excluded. Payment activity and receipts are recorded in Billing. This authorization does not permit charges for another client or use of another guardian’s card. I can revoke recurring authorization in Billing before a future charge; revocation does not cancel amounts already owed. Saving a card or signing a payment setup form alone does not enable recurring charges.';

export function billingError(status, message) { return Object.assign(new Error(message), { status, statusCode: status }); }
export function positiveId(value) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) throw billingError(400, 'A valid identifier is required');
  return n;
}
export function linkAllowsBillingView(link) {
  let p;
  try { p = typeof link?.permissions_json === 'string' ? JSON.parse(link.permissions_json) : (link?.permissions_json || {}); } catch { return false; }
  if (link?.independence_status === 'active' && link.relationship_type !== 'self') return parseSupportJson(link.support_scopes).includes('billing');
  return !!link && Number(link.access_enabled) === 1 && !p.noView && !p.noViewOtherGuardian;
}
export function linkAllowsBilling(link) {
  const dob=link?.date_of_birth instanceof Date?link.date_of_birth.toISOString().slice(0,10):String(link?.date_of_birth||'').slice(0,10);
  const cutoff=new Date();cutoff.setUTCFullYear(cutoff.getUTCFullYear()-18);
  const adultSelf=/^\d{4}-\d{2}-\d{2}$/.test(dob)&&Number.isFinite(Date.parse(dob))&&dob<=cutoff.toISOString().slice(0,10);
  return linkAllowsBillingView(link) && (link.relationship_type !== 'self'||adultSelf||link.independence_status==='active');
}
export function linkAllowsInsurance(link) {
  if(link?.independence_status==='active'&&link.relationship_type!=='self')return parseSupportJson(link.support_scopes).includes('insurance');
  return linkAllowsBilling(link);
}
async function requireFinancialScope(userId, clientId, agencyId, db, scope) {
  // Serialize payment/insurance authorizations with independence and revocation.
  const locking = db !== pool;
  if(locking)await db.execute('SELECT id FROM clients WHERE id=? FOR UPDATE',[positiveId(clientId)]);
  const [rows] = await db.execute(`SELECT cg.*, c.agency_id, c.date_of_birth,i.status AS independence_status,g.scopes_json AS support_scopes,d.client_id AS personal_client_id FROM client_guardians cg
    JOIN clients c ON c.id = cg.client_id
    LEFT JOIN client_portal_independence i ON i.client_id=c.id
    LEFT JOIN client_support_grants g ON g.client_id=c.id AND g.agency_id=? AND g.helper_user_id=cg.guardian_user_id AND g.revoked_at IS NULL
    LEFT JOIN dependent_portal_access d ON d.user_id=cg.guardian_user_id
    WHERE cg.guardian_user_id = ? AND cg.client_id = ? AND (c.agency_id = ? OR EXISTS
      (SELECT 1 FROM client_agency_assignments ca WHERE ca.client_id=c.id AND ca.agency_id=? AND ca.is_active=1))${locking?' FOR UPDATE':''}`,
  [positiveId(agencyId),positiveId(userId), positiveId(clientId), positiveId(agencyId), positiveId(agencyId)]);
  const row=rows[0];
  if(row?.personal_client_id&&Number(row.personal_client_id)!==Number(clientId))throw billingError(403,'This login only opens your own account.');
  if (!(scope==='insurance'?linkAllowsInsurance(row):linkAllowsBilling(row))) throw billingError(403, `${scope==='insurance'?'Insurance':'Billing'} access is not authorized for this client`);
  return {...rows[0],agency_id:positiveId(agencyId)};
}
export const requireBillingLink=(userId,clientId,agencyId,db=pool)=>requireFinancialScope(userId,clientId,agencyId,db,'billing');
export const requireInsuranceLink=(userId,clientId,agencyId,db=pool)=>requireFinancialScope(userId,clientId,agencyId,db,'insurance');
export async function requireResponsiblePayer(userId, clientId, agencyId, db = pool) {
  await requireBillingLink(userId, clientId, agencyId, db);
  const [rows] = await db.execute(`SELECT * FROM client_billing_payers WHERE guardian_user_id = ? AND client_id = ? AND agency_id = ? AND status = 'active'`, [userId, clientId, agencyId]);
  if (!rows[0]) throw billingError(403, 'Only an authorized responsible payer can access billing');
  return rows[0];
}
export async function auditBilling({ agencyId, userId, clientId = null, action, objectId = null }, db = pool) {
  await db.execute('INSERT INTO family_billing_audit (agency_id, actor_user_id, client_id, action, object_id) VALUES (?, ?, ?, ?, ?)', [agencyId, userId || null, clientId, action, objectId]);
}
export async function recordBillingConsent({ userId, agencyId, clientId = null, cardId = null, submissionId = null, purpose, consent, ip, userAgent }, db = pool) {
  if (consent?.accepted !== true || consent?.version !== BILLING_TERMS_VERSION || !String(consent?.signatureName || '').trim()) throw billingError(400, 'Read and sign the current billing authorization');
  const evidence = { terms: BILLING_TERMS, recurringLimitCents: consent.limitCents || null, frequency: purpose === 'recurring' ? 'per scheduled service or verified patient balance' : null, signatureName: String(consent.signatureName).trim().slice(0, 255), ip: String(ip || '').slice(0, 80), userAgent: String(userAgent || '').slice(0, 500), acceptedAt: new Date().toISOString() };
  const [r] = await db.execute(`INSERT INTO guardian_billing_consents (agency_id, guardian_user_id, client_id, payment_card_id, intake_submission_id, purpose, terms_version, terms_hash, evidence_encrypted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [agencyId, userId, clientId, cardId, submissionId, purpose, BILLING_TERMS_VERSION, crypto.createHash('sha256').update(BILLING_TERMS).digest('hex'), encryptFamilyBilling(evidence, `consent:${agencyId}:${userId}`)]);
  return r.insertId;
}

/** Shared statements grant read access, never liability or permission to charge. */
export async function requireStatementAccess(userId, clientId, agencyId, db = pool) {
  const link=await requireBillingLink(userId, clientId, agencyId, db);
  if(link.relationship_type==='self')return;
  const [rows] = await db.execute(`SELECT 1 FROM client_billing_payers WHERE agency_id=? AND client_id=? AND guardian_user_id=? AND status='active'
    UNION ALL SELECT 1 FROM guardian_portal_policies WHERE agency_id=? AND client_id=? AND shared_billing=1
    UNION ALL SELECT 1 FROM family_statement_shares WHERE agency_id=? AND client_id=? AND guardian_user_id=? AND active=1`,
    [agencyId,clientId,userId,agencyId,clientId,agencyId,clientId,userId]);
  if (!rows.length) throw billingError(403,'Statement access is not authorized for this client');
}
