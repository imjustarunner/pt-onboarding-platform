import { createHash } from 'node:crypto';
import pool from '../config/database.js';
import { decryptChatText } from './chatEncryption.service.js';
import { normalizeSmsPhone } from '../utils/smsThreadIdentity.js';
import { phoneFingerprint, staffCommunicationKey, STAFF_COMMUNICATION_CHOICES, staffDeliveryKinds } from '../utils/staffCommunicationChoices.js';
import { smsPolicyError, validateSmsRegistration } from '../utils/smsCompliancePolicy.js';

const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = message => smsPolicyError('sms_saved_signature_invalid', message);

// Preserve the exact original signature and disclosure. This is a review-queue
// bridge, not a new signature, automatic enrollment, or a replacement disclosure.
export function verifySavedStaffSignature({ state, agencyId, phone, registration }) {
  if (!state?.envelope || !state.reference?.startsWith('staff_communications:')) throw fail('Signed communication choices are required.');
  const signed = JSON.parse(decryptChatText(state.envelope));
  const normalized = normalizeSmsPhone(phone);
  if (!normalized || normalizeSmsPhone(signed.phone) !== normalized || state.phoneHash !== phoneFingerprint(normalized)
      || Number(signed.agencyId) !== Number(agencyId) || signed.acknowledged !== true || signed.usageAcknowledged !== true
      || !signed.signerName?.trim() || !signed.reviewedAt || Number.isNaN(Date.parse(signed.reviewedAt))
      || signed.reviewedAt !== state.reviewedAt || signed.disclosureHash !== state.disclosureHash
      || hash(JSON.stringify(signed.disclosure)) !== signed.disclosureHash
      || STAFF_COMMUNICATION_CHOICES.some(({key}) => typeof signed.choices?.[key] !== 'boolean' || signed.choices[key] !== state.choices?.[key])) {
    throw fail('The saved signature must match the current staff member, phone, and choices.');
  }
  const program = signed.disclosure.programs?.find(p => p.campaignId === registration.campaignId);
  if (!program || program.brandName !== registration.brandName
      || program.termsUrl !== registration.termsUrl || program.privacyUrl !== registration.privacyUrl
      || validateSmsRegistration(registration).length) throw fail('The signed campaign must match the current registered program.');
  const choices = {};
  for (const purpose of program.purposes || []) {
    if (!['workforce', 'polling'].includes(purpose) || !registration.purposes.includes(purpose)) continue;
    choices[purpose] = (purpose === 'polling' ? signed.choices.polling : staffDeliveryKinds(signed.choices).length > 0) ? 'yes' : 'no';
  }
  return { signed, choices, phone: normalized };
}

export async function queueStaffSmsEnrollment({ userId, agencyId, state, phone, programs, database = pool }) {
  const requests = [];
  for (const program of programs) {
    const registration = program.registration || parse(program.registration_json);
    if (validateSmsRegistration(registration).length) continue;
    const verified = verifySavedStaffSignature({ state, agencyId, phone, registration });
    if (!Object.values(verified.choices).includes('yes')) continue;
    const disclosure = { enrollmentCategory: 'staff_communications', userId: Number(userId),
      sourceReference: state.reference, campaignId: registration.campaignId,
      originalDisclosure: verified.signed.disclosure };
    // Deterministic key makes retries/backfills idempotent; it is never a public signing token.
    const key = hash(`staff-enrollment:${agencyId}:${userId}:${registration.campaignId}:${state.reference}`);
    await database.execute(`INSERT INTO sms_consent_requests
      (agency_id,number_id,phone,signer_role,token_hash,disclosure_json,disclosure_hash,signed_payload_json,signed_at,created_by_user_id,expires_at)
      VALUES (?,?,?,'staff',?,?,?,?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 14 DAY))
      ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`,
      [agencyId, program.id, verified.phone, key, JSON.stringify(disclosure), state.disclosureHash,
        JSON.stringify(state.envelope), new Date(verified.signed.reviewedAt), userId]);
    const [[request]] = await database.execute('SELECT id FROM sms_consent_requests WHERE token_hash=?', [key]);
    requests.push(request.id);
  }
  return requests;
}

export async function currentStaffEnrollmentEvidence(row, registration, database = pool) {
  const disclosure = parse(row.disclosure_json);
  const [[staff]] = await database.execute(`SELECT p.notification_categories,u.personal_phone,u.work_phone,u.phone_number
    FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=?
    JOIN user_preferences p ON p.user_id=u.id WHERE u.id=?`, [row.agency_id, disclosure.userId]);
  const state = parse(staff?.notification_categories)?.[staffCommunicationKey(row.agency_id)];
  if (!state || state.reference !== disclosure.sourceReference || disclosure.campaignId !== registration.campaignId) {
    throw smsPolicyError('sms_consent_superseded', 'Review this staff member’s latest signed communication choices.');
  }
  const evidence = verifySavedStaffSignature({state, agencyId:row.agency_id,
    phone:staff.personal_phone || staff.work_phone || staff.phone_number, registration});
  if (normalizeSmsPhone(row.phone) !== normalizeSmsPhone(evidence.phone)) throw fail('The enrollment phone does not match the signed phone.');
  const original = JSON.parse(decryptChatText(parse(row.signed_payload_json)));
  if (row.disclosure_hash !== state.disclosureHash || JSON.stringify(original) !== JSON.stringify(evidence.signed)) throw fail('The review request does not match the original signature.');
  return { ...evidence.signed, signedAt: evidence.signed.reviewedAt, choices: evidence.choices,
    staffCommunicationReference: state.reference, disclosure: { ...evidence.signed.disclosure, enrollmentCategory:'staff_communications' } };
}
