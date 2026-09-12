import crypto from 'node:crypto';
import pool from '../config/database.js';
import { encryptFamilyBilling } from './familyBillingEncryption.service.js';

export const BILLING_TERMS_VERSION = 'family-billing-2026-09-11-v1';
export const BILLING_TERMS = 'I accept financial responsibility for the clients I select. I authorize this organization to keep my payment method with Stripe and to charge my selected card for the amounts I approve. If I separately enable recurring billing for a client, I authorize charges for that client’s scheduled services and patient balances at the rates and payment schedule disclosed by the organization. Payment activity is recorded in Billing. This authorization does not permit charges for another client or use of another guardian’s card. I can revoke recurring authorization in Billing before a future charge; revocation does not cancel amounts already owed. Insurance coverage and patient responsibility must be verified before insurance-related balances are charged.';

export function billingError(status, message) { return Object.assign(new Error(message), { status, statusCode: status }); }
export function positiveId(value) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) throw billingError(400, 'A valid identifier is required');
  return n;
}
export function linkAllowsBilling(link) {
  let p;
  try { p = typeof link?.permissions_json === 'string' ? JSON.parse(link.permissions_json) : (link?.permissions_json || {}); } catch { return false; }
  return !!link && Number(link.access_enabled) === 1 && link.relationship_type !== 'self'
    && !p.noView && !p.noViewOtherGuardian;
}
export async function requireBillingLink(userId, clientId, agencyId, db = pool) {
  const [rows] = await db.execute(`SELECT cg.*, c.agency_id FROM client_guardians cg
    JOIN clients c ON c.id = cg.client_id WHERE cg.guardian_user_id = ? AND cg.client_id = ? AND c.agency_id = ?`,
  [positiveId(userId), positiveId(clientId), positiveId(agencyId)]);
  if (!linkAllowsBilling(rows[0])) throw billingError(403, 'Billing access is not authorized for this client');
  return rows[0];
}
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
