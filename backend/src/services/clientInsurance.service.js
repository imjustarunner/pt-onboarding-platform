import pool from '../config/database.js';
import { encryptFamilyBilling, decryptFamilyBilling } from './familyBillingEncryption.service.js';
import { billingError } from './familyBillingPolicy.service.js';
import { hasMedicaidCoverage, policyIsMedicaid } from '../utils/insurancePaymentPolicy.js';

export const POLICY_TEXT_FIELDS = ['insurerName', 'payerId', 'memberId', 'groupNumber', 'patientSuffix', 'subscriberName', 'subscriberFirstName', 'subscriberLastName', 'subscriberDob', 'subscriberSex', 'relationshipToSubscriber', 'subscriberAddressLine1', 'subscriberAddressLine2', 'subscriberCity', 'subscriberState', 'subscriberPostalCode', 'planType', 'effectiveDate', 'terminationDate', 'claimsPhone'];
export function normalizePolicy(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw billingError(400, 'Insurance policy must be an object');
  const out = {};
  for (const key of POLICY_TEXT_FIELDS) {
    const field = value[key];
    if (field != null && !['string','number'].includes(typeof field)) throw billingError(400, 'Insurance fields must contain text');
    out[key] = String(field ?? '').trim();
    if (out[key].length > 255) throw billingError(400, 'An insurance field exceeds the maximum length');
  }
  if (out.subscriberFirstName && out.subscriberLastName) out.subscriberName = `${out.subscriberFirstName} ${out.subscriberLastName}`;
  out.isMedicaid = policyIsMedicaid(value);
  if (out.relationshipToSubscriber && !['self','child','spouse','other'].includes(out.relationshipToSubscriber)) throw billingError(400, 'Invalid subscriber relationship');
  for (const key of ['subscriberDob', 'effectiveDate', 'terminationDate']) if (out[key] && (!/^\d{4}-\d{2}-\d{2}$/.test(out[key]) || !Number.isFinite(Date.parse(out[key])) || new Date(out[key]).toISOString().slice(0,10) !== out[key])) throw billingError(400, 'Use a valid YYYY-MM-DD insurance date');
  return out;
}
export function claimInsuranceIssues(primary = {}) {
  return [['insurerName','Insurance carrier'], ['payerId','Claim.MD payer ID'], ['memberId','Member ID'], ['subscriberFirstName','Subscriber legal first name'], ['subscriberLastName','Subscriber legal last name'], ['subscriberDob','Subscriber date of birth'], ['relationshipToSubscriber','Relationship to subscriber'], ['subscriberAddressLine1','Subscriber address'], ['subscriberCity','Subscriber city'], ['subscriberState','Subscriber state'], ['subscriberPostalCode','Subscriber postal code']].filter(([key]) => !String(primary[key] || '').trim()).map(([, label]) => `${label} is missing`);
}
export function insuranceForIntakeClient(info, clientIndex, clientCount) {
  if (!info || (info.isSelfPay && !hasMedicaidCoverage(info))) return null;
  const assignment = Array.isArray(info.clientCoverages) ? info.clientCoverages.find(c => Number(c.clientIndex) === clientIndex && c.confirmed === true) : null;
  const medicaid = info.medicaidByClient?.find(c => Number(c.clientIndex) === clientIndex && String(c.memberId || '').trim());
  // A single-child legacy form is unambiguous. Multi-child forms require an
  // explicit selection or that child's own Medicaid member ID.
  if (!assignment && !medicaid && clientCount > 1) return null;
  if (!medicaid && clientCount > 1 && info.coverageScope !== 'account_holder' && (info.clientCoverages || []).filter(row => row.confirmed === true && !row.primary).length > 1) throw billingError(400, 'Confirm a separate policy per client or an account-holder policy covering selected dependents');
  if ((policyIsMedicaid(info.primary) || info.primaryIsMedicaid) && clientCount > 1 && !medicaid && !assignment?.primary?.memberId) return null;
  const primaryMedicaid = medicaid && info.medicaidPlanPosition !== 'secondary';
  const primary = normalizePolicy({ ...(assignment?.primary || info.primary), ...(primaryMedicaid ? { memberId: medicaid.memberId, relationshipToSubscriber: 'self', isMedicaid:true } : {}) });
  let secondary = assignment?.primary ? (assignment.secondary ? normalizePolicy(assignment.secondary) : null) : info.secondary ? normalizePolicy(info.secondary) : null;
  if (medicaid && info.medicaidPlanPosition === 'secondary' && secondary) secondary=normalizePolicy({...secondary,memberId:medicaid.memberId,relationshipToSubscriber:'self',isMedicaid:true});
  if (clientCount > 1 && secondary?.isMedicaid && !(medicaid && info.medicaidPlanPosition === 'secondary') && !assignment?.secondary?.memberId) return null;
  return { primary, secondary, primaryCardFrontUrl: assignment?.primary ? (assignment.primary_front_url || null) : (info.primary_front_url || null), primaryCardBackUrl: assignment?.primary ? (assignment.primary_back_url || null) : (info.primary_back_url || null), secondaryCardFrontUrl: assignment?.primary ? (assignment.secondary_front_url || null) : (info.secondary_front_url || null), secondaryCardBackUrl: assignment?.primary ? (assignment.secondary_back_url || null) : (info.secondary_back_url || null), coverageScope: !assignment?.primary && info.coverageScope === 'account_holder' ? 'account_holder' : 'client', confirmed: !!assignment || clientCount === 1 || !!medicaid };
}
export async function writeClientInsurance({ clientId, agencyId, primary, secondary = null, profileId = null, confirmedBy = null, patient = null, verifiedForClaims = false, acceptAssignment = null }, db = pool) {
  const previous = await readClientInsurance(clientId, agencyId, db);
  const patientFields = ['firstName','lastName','dateOfBirth','sex','addressLine1','addressLine2','city','state','postalCode'];
  const patientValue = patient && typeof patient === 'object' ? Object.fromEntries(patientFields.map(key => [key, String(patient[key] || '').trim().slice(0,255)])) : (previous?.patient || {});
  const value = { acceptAssignment, patient: patientValue, verifiedForClaims: verifiedForClaims === true, primary: normalizePolicy(primary), secondary: secondary ? normalizePolicy(secondary) : null, profileId, confirmedBy, updatedAt: new Date().toISOString() };
  const encrypted = encryptFamilyBilling(value, `client-insurance:${agencyId}:${clientId}`);
  const [result] = await db.execute(`UPDATE clients SET billing_insurance_payload = ?, primary_insurer_name = ?, insurance_member_id = NULL, insurance_group_number = NULL, insurance_subscriber_name = NULL WHERE id = ? AND agency_id = ?`, [encrypted, value.primary.insurerName || null, clientId, agencyId]);
  if (!result.affectedRows) throw billingError(404, 'Client not found in agency');
  return value;
}
export async function readClientInsurance(clientId, agencyId, db = pool) {
  const [rows] = await db.execute('SELECT billing_insurance_payload FROM clients WHERE id = ? AND agency_id = ?', [clientId, agencyId]);
  return rows[0] ? decryptFamilyBilling(rows[0].billing_insurance_payload, `client-insurance:${agencyId}:${clientId}`) : null;
}

/** Keep a second payer's submission available for review without replacing the
 * client's existing primary coverage or coordination-of-benefits decision. */
export async function applySubmittedClientInsurance(input, connection = null) {
  if (!connection) {
    const db=await pool.getConnection();
    try {await db.beginTransaction();const applied=await applySubmittedClientInsurance(input,db);await db.commit();return applied;}
    catch(e){await db.rollback();throw e;}finally{db.release();}
  }
  await connection.execute('SELECT id FROM clients WHERE id = ? AND agency_id = ? FOR UPDATE',[input.clientId,input.agencyId]);
  const previous=await readClientInsurance(input.clientId,input.agencyId,connection);
  if(previous && (!input.profileId || Number(previous.profileId)!==Number(input.profileId))) return false;
  await writeClientInsurance(input,connection);return true;
}
