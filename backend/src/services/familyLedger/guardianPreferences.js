import pool from '../../config/database.js';
import { requireBillingLink, billingError, auditBilling } from '../familyBillingPolicy.service.js';
import { encryptFamilyBilling, decryptFamilyBilling } from '../familyBillingEncryption.service.js';
export function normalizePaymentPreference(input) {
  if (!['all','part','alternate','discuss'].includes(input.arrangement)) throw billingError(400,'Choose how you propose to share payments.');
  const percent = input.arrangement === 'part' && input.percent != null && input.percent !== '' ? Number(input.percent) : null;
  if (input.arrangement === 'part' && percent != null && (!Number.isFinite(percent) || percent <= 0 || percent >= 100)) throw billingError(400,'Enter your proposed share between 0 and 100 percent.');
  const notes = String(input.notes || '').trim();
  if (notes.length > 2000) throw billingError(400,'Keep payment notes under 2,000 characters.');
  return { arrangement: input.arrangement, percent, notes, status: 'proposed' };
}
export async function saveGuardianPaymentPreference({agencyId,clientId,userId,...input}) {
  await requireBillingLink(userId,clientId,agencyId);
  const preference = normalizePaymentPreference(input);
  await pool.execute('INSERT INTO guardian_payment_preferences (agency_id,client_id,guardian_user_id,preference_encrypted) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE preference_encrypted=VALUES(preference_encrypted)',[agencyId,clientId,userId,encryptFamilyBilling(preference,`payment-preference:${agencyId}:${clientId}:${userId}`)]);
  await auditBilling({agencyId,clientId,userId,action:'payment_arrangement_proposed'});
  return {preference};
}
export async function guardianPaymentPreference({agencyId,clientId,userId}) {
  await requireBillingLink(userId,clientId,agencyId);
  const [[row]]=await pool.execute('SELECT preference_encrypted FROM guardian_payment_preferences WHERE agency_id=? AND client_id=? AND guardian_user_id=?',[agencyId,clientId,userId]);
  return row?decryptFamilyBilling(row.preference_encrypted,`payment-preference:${agencyId}:${clientId}:${userId}`):null;
}

export async function listGuardianPaymentPreferences(agencyId) {
 const [rows]=await pool.execute(`SELECT p.*,CONCAT_WS(' ',u.first_name,u.last_name) AS payerName,c.full_name AS clientName FROM guardian_payment_preferences p JOIN users u ON u.id=p.guardian_user_id JOIN clients c ON c.id=p.client_id AND c.agency_id=p.agency_id WHERE p.agency_id=? ORDER BY p.updated_at DESC LIMIT 200`,[agencyId]);
 return rows.map(row=>({clientId:row.client_id,guardianUserId:row.guardian_user_id,payerName:row.payerName,clientName:row.clientName,updatedAt:row.updated_at,...decryptFamilyBilling(row.preference_encrypted,`payment-preference:${agencyId}:${row.client_id}:${row.guardian_user_id}`)}));
}
