import crypto from 'node:crypto';
import pool from '../../config/database.js';
import { readClientInsurance } from '../clientInsurance.service.js';
import { billingError, auditBilling } from '../familyBillingPolicy.service.js';
import { encryptFamilyBilling } from '../familyBillingEncryption.service.js';
import { hasMedicaidCoverage } from '../../utils/insurancePaymentPolicy.js';
import { transaction, requireClient } from './policy.js';

// Coverage only: demographic corrections must not reset financial verification.
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
export const insuranceFingerprint = insurance => crypto.createHash('sha256')
  .update(JSON.stringify(canonical({ primary: insurance?.primary || null, secondary: insurance?.secondary || null }))).digest('hex');

export async function getReadiness(agencyId, clientId, db = pool) {
  const [rows] = await db.execute('SELECT * FROM client_billing_readiness WHERE agency_id=? AND client_id=?', [agencyId, clientId]);
  return rows[0] || { coverage_mode: 'unknown', setup_status: 'incomplete', collection_policy: 'manual' };
}
export function assertReady(profile, insurance) {
  if (profile.setup_status !== 'ready' || profile.coverage_mode === 'unknown') throw billingError(409, 'Billing setup is incomplete; no patient balance is due');
  if (profile.insurance_fingerprint !== insuranceFingerprint(insurance)) throw billingError(409, 'Coverage changed; billing must verify responsibility again');
}
export async function saveReadiness({ agencyId, clientId, coverageMode, setupStatus, collectionPolicy = 'manual', reason, actorUserId }) {
  if (!['unknown','insured','self_pay'].includes(coverageMode) || !['incomplete','ready','paused'].includes(setupStatus) || !['manual','verified_copay','after_era'].includes(collectionPolicy) || !String(reason || '').trim()) throw billingError(400, 'Choose billing readiness and document coverage verification or agreed self-pay terms');
  return transaction(async db => {
    await requireClient(agencyId, clientId, db);
    await db.execute('SELECT id FROM clients WHERE id=? AND agency_id=? FOR UPDATE', [clientId, agencyId]);
    const insurance = await readClientInsurance(clientId, agencyId, db), old = await getReadiness(agencyId, clientId, db);
    const covered = !!(insurance?.primary?.memberId || insurance?.secondary?.memberId);
    if (setupStatus === 'ready') {
      if (coverageMode === 'unknown' || (coverageMode === 'insured' && !covered)) throw billingError(409, 'Enter and verify insurance, or explicitly document agreed self-pay terms');
      if (coverageMode === 'self_pay' && (covered || hasMedicaidCoverage(insurance))) throw billingError(409, 'Coverage is recorded; resolve coordination of benefits before treating this client as self-pay');
      if (collectionPolicy !== 'manual' && (coverageMode !== 'insured' || hasMedicaidCoverage(insurance))) throw billingError(409, 'Automatic copay collection requires verified commercial coverage without Medicaid protection');
      if (collectionPolicy === 'verified_copay' && insurance?.secondary) throw billingError(409, 'Secondary coverage requires review of final payer responsibility; choose after ERA or manual collection');
      const [payers] = await db.execute("SELECT guardian_user_id FROM client_billing_payers WHERE agency_id=? AND client_id=? AND status='active'", [agencyId,clientId]);
      if (!payers.length && !hasMedicaidCoverage(insurance)) throw billingError(409, 'Assign a responsible payer before completing patient billing setup');
    }
    const fingerprint = insuranceFingerprint(insurance);
    // Enabling/resuming/changing coverage never sweeps historical balances.
    const unchanged = old.setup_status === 'ready' && old.collection_policy === collectionPolicy && old.insurance_fingerprint === fingerprint;
    const automaticFrom = setupStatus === 'ready' && collectionPolicy !== 'manual' ? (unchanged && old.automatic_from ? old.automatic_from : new Date()) : null;
    await db.execute(`INSERT INTO client_billing_readiness (agency_id,client_id,coverage_mode,setup_status,collection_policy,insurance_fingerprint,automatic_from,evidence_encrypted,updated_by_user_id) VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE coverage_mode=VALUES(coverage_mode),setup_status=VALUES(setup_status),collection_policy=VALUES(collection_policy),insurance_fingerprint=VALUES(insurance_fingerprint),automatic_from=VALUES(automatic_from),evidence_encrypted=VALUES(evidence_encrypted),updated_by_user_id=VALUES(updated_by_user_id)`, [agencyId,clientId,coverageMode,setupStatus,collectionPolicy,fingerprint,automaticFrom,encryptFamilyBilling({reason:String(reason).trim().slice(0,2000),at:new Date().toISOString()},`billing-readiness:${agencyId}:${clientId}`),actorUserId]);
    await auditBilling({agencyId,clientId,userId:actorUserId,action:'billing_readiness_updated'},db);
    return {coverageMode,setupStatus,collectionPolicy,automaticFrom};
  });
}
