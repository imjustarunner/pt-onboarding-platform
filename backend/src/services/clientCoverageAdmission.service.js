import pool from '../config/database.js';
import { readClientInsurance } from './clientInsurance.service.js';
import { coverageFingerprint } from './coverageVerification.service.js';
import { getMedicalBillingFlags } from './medicalBillingFlags.service.js';

const medicalTypes = new Set(['clinical', 'mental_health', 'school']);
const ymd = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);

export function evaluateCoverageAdmission({ client, agency, insurance, review, latestCheckId = 0, hasNewEvidence = false, now = new Date() }) {
  if (!getMedicalBillingFlags(agency).medicalBillingEnabled || !medicalTypes.has(String(client?.client_type || 'clinical').toLowerCase())) return { ready: true, required: false, reason: null };
  const policy = insurance?.primary;
  const selfPay = /^(self[ -]?pay|cash|private pay)$/i.test(String(policy?.insurerName || client?.primary_insurer_name || client?.insurance_type_label || '').trim());
  if (selfPay && !insurance?.secondary) return { ready: true, required: false, reason: null, selfPay: true };
  let reason = null;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  if (!policy?.insurerName) reason = 'Record insurance or an explicit self-pay choice before assigning a provider or posting to the Client Exchange.';
  else if (!review || review.status !== 'verified') reason = 'Billing must verify primary and any secondary insurance before provider assignment or Client Exchange posting.';
  else if (review.insurance_fingerprint !== coverageFingerprint(insurance)) reason = 'Insurance or patient identity changed. Verify the current coverage before assignment or Exchange posting.';
  else if (hasNewEvidence || Number(latestCheckId) > Number(review.through_check_id || 0)) reason = 'New eligibility results need billing review before assignment or Exchange posting.';
  else if (!Number.isFinite(Date.parse(review.created_at)) || +now - Date.parse(review.created_at) > 7 * 86400000 || Date.parse(review.created_at) > +now) reason = 'Insurance verification is older than 7 days or undated. Billing must recheck before assignment or Exchange posting.';
  else if (['primary', 'secondary'].some(slot => insurance?.[slot] && ((insurance[slot].effectiveDate && ymd(insurance[slot].effectiveDate) > today) || (insurance[slot].terminationDate && ymd(insurance[slot].terminationDate) < today)))) reason = 'A recorded policy is not effective today. Resolve coverage before assignment or Exchange posting.';
  return { ready: !reason, required: true, reason, reviewId: review?.id || null, verifiedAt: review?.created_at || null };
}

export async function clientCoverageAdmission(clientId, { db = pool, client = null, now = new Date() } = {}) {
  // The stored organization is authoritative even when a caller supplies a
  // partial client row. Older school imports may still say basic_nonclinical.
  const [[row]] = await db.execute(`SELECT c.id,c.agency_id,c.client_type,c.provider_id,c.primary_insurer_name,i.label AS insurance_type_label,a.organization_type
    FROM clients c LEFT JOIN insurance_types i ON i.id=c.insurance_type_id LEFT JOIN agencies a ON a.id=c.organization_id WHERE c.id=?`, [clientId]);
  client = row;
  if (!client) throw Object.assign(new Error('Client not found'), { status: 404 });
  if (String(client.organization_type).toLowerCase() === 'school') client.client_type = 'school';
  const [[agency]] = await db.execute('SELECT id,feature_flags FROM agencies WHERE id=?', [client.agency_id]);
  if (!getMedicalBillingFlags(agency).medicalBillingEnabled || !medicalTypes.has(String(client.client_type || 'clinical').toLowerCase())) return { ready: true, required: false, clientId: Number(clientId), agencyId: Number(client.agency_id) };
  const insurance = await readClientInsurance(clientId, client.agency_id, db);
  const [[review]] = await db.execute(`SELECT r.*,EXISTS(SELECT 1 FROM client_coverage_checks c WHERE c.agency_id=r.agency_id AND c.client_id=r.client_id AND (c.id>r.through_check_id OR c.completed_at>r.created_at)) AS has_new_evidence FROM client_coverage_reviews r WHERE r.agency_id=? AND r.client_id=? ORDER BY r.id DESC LIMIT 1`, [client.agency_id, clientId]);
  return { ...evaluateCoverageAdmission({ client, agency, insurance, review, hasNewEvidence: !!Number(review?.has_new_evidence), now }), clientId: Number(clientId), agencyId: Number(client.agency_id) };
}

export async function assertClientCoverageAdmission(clientId, options = {}) {
  const result = await clientCoverageAdmission(clientId, options);
  if (!result.ready) throw Object.assign(new Error(result.reason), { status: 409, code: 'INSURANCE_VERIFICATION_REQUIRED', details: { clientId: result.clientId, agencyId: result.agencyId, verificationRequired: true } });
  return result;
}

// Reconfirm insurance for a new care-team assignment. Keeping an already active
// provider or moving that provider's weekday must not unassign existing care.
export async function assertNewProviderCoverageAdmission(clientId, providerUserId, { db = pool } = {}) {
  if (!Number(providerUserId)) return { ready: true, required: false };
  const [[client]] = await db.execute(`SELECT c.id,c.agency_id,c.client_type,c.provider_id,i.label AS insurance_type_label,a.organization_type
    FROM clients c LEFT JOIN insurance_types i ON i.id=c.insurance_type_id LEFT JOIN agencies a ON a.id=c.organization_id WHERE c.id=?`, [clientId]);
  if (!client) throw Object.assign(new Error('Client not found'), { status: 404 });
  if (Number(client.provider_id) === Number(providerUserId)) return { ready: true, required: false, existingAssignment: true };
  try {
    const [[assignment]] = await db.execute('SELECT id FROM client_provider_assignments WHERE client_id=? AND provider_user_id=? AND is_active=1 LIMIT 1', [clientId, providerUserId]);
    if (assignment) return { ready: true, required: false, existingAssignment: true };
  } catch (error) { if (error?.code !== 'ER_NO_SUCH_TABLE') throw error; }
  if (String(client.organization_type).toLowerCase() === 'school') client.client_type = 'school';
  return assertClientCoverageAdmission(clientId, { db, client });
}

// A new insured chart cannot already have a persisted verification review.
// Staff can create it unassigned, verify coverage, then assign its provider.
export async function assertNewClientProviderCoverage(client, { db = pool } = {}) {
  if (!Number(client.provider_id)) return;
  const [[agency]] = await db.execute('SELECT id,feature_flags FROM agencies WHERE id=?', [client.agency_id]);
  let clientType = client.client_type || 'basic_nonclinical';
  if (client.organization_id) {
    const [[organization]] = await db.execute('SELECT organization_type FROM agencies WHERE id=?', [client.organization_id]);
    if (String(organization?.organization_type).toLowerCase() === 'school') clientType = 'school';
  }
  let insuranceLabel = null;
  if (client.insurance_type_id) {
    const [[type]] = await db.execute('SELECT label FROM insurance_types WHERE id=? AND agency_id=?', [client.insurance_type_id, client.agency_id]);
    insuranceLabel = type?.label || null;
  }
  const result = evaluateCoverageAdmission({ client: { ...client, client_type: clientType, insurance_type_label: insuranceLabel }, agency, insurance: null, review: null });
  if (!result.ready) throw Object.assign(new Error('Create this client without a provider, verify coverage in Billing, then assign their provider.'), { status: 409, code: 'INSURANCE_VERIFICATION_REQUIRED', details: { agencyId: Number(client.agency_id), verificationRequired: true } });
}

// Public enrollment keeps its submitted chart and provider preference even when
// billing still needs to verify coverage. The booking request owns the preference.
export async function assignPublicIntakeProviderWhenVerified(clientId, providerUserId, { db = pool } = {}) {
  try { await assertNewProviderCoverageAdmission(clientId, providerUserId, { db }); }
  catch (error) { if (error?.code === 'INSURANCE_VERIFICATION_REQUIRED') return { assigned: false, assignmentDeferred: true, verificationRequired: true }; throw error; }
  await db.execute('UPDATE clients SET provider_id=? WHERE id=?', [providerUserId, clientId]);
  return { assigned: true, assignmentDeferred: false, verificationRequired: false };
}
