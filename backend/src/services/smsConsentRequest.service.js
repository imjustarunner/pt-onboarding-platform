import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import pool from '../config/database.js';
import { encryptChatText, decryptChatText, isChatEncryptionConfigured } from './chatEncryption.service.js';
import { getSmsSender } from './smsCompliance.service.js';
import { enrollSmsRecipient } from './smsEnrollment.service.js';
import { buildSmsConsentDisclosure } from '../utils/smsConsentDisclosure.js';
import { normalizeSmsPhone } from '../utils/smsThreadIdentity.js';
import { smsPolicyError, validateSmsRegistration } from '../utils/smsCompliancePolicy.js';

const hash = (text) => createHash('sha256').update(text).digest('hex');
const parse = (value) => typeof value === 'string' ? JSON.parse(value) : value;
const invalid = () => Object.assign(new Error('Consent request is unavailable or expired'), { status: 404 });

export async function createSmsConsentRequest({ agencyId, numberId, phone, signerRole, actorUserId, enrollmentCategory = null }) {
  if (!['client', 'guardian', 'staff'].includes(signerRole) || !normalizeSmsPhone(phone)) throw smsPolicyError('sms_signer_required', 'A valid recipient phone and signer role are required');
  if (!isChatEncryptionConfigured()) throw new Error('Encryption must be configured before collecting SMS signatures');
  const [numbers] = await pool.execute('SELECT phone_number FROM twilio_numbers WHERE id = ? AND agency_id = ?', [numberId, agencyId]);
  if (!numbers[0]) throw invalid();
  const sender = await getSmsSender(numbers[0].phone_number);
  if (validateSmsRegistration(sender.registration).length) throw smsPolicyError('sms_campaign_not_ready', 'Configure the verified program before requesting recipient signatures');
  const disclosure = buildSmsConsentDisclosure(sender.registration, { signerRole, enrollmentCategory });
  if (!disclosure.purposes.length) throw smsPolicyError('sms_signer_program_mismatch', 'This program has no message purposes for the selected signer');
  const token = randomBytes(32).toString('hex');
  const serialized = JSON.stringify(disclosure);
  const [result] = await pool.execute(
    `INSERT INTO sms_consent_requests (agency_id, number_id, phone, signer_role, token_hash,
     disclosure_json, disclosure_hash, created_by_user_id, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 14 DAY))`,
    [agencyId, numberId, normalizeSmsPhone(phone), signerRole, hash(token), serialized, hash(serialized), actorUserId]
  );
  // Fragments are not sent in HTTP requests or Referer headers.
  return { id: result.insertId, path: `/sms-consent/sign#${token}` };
}

async function requestForToken(token) {
  if (!/^[a-f0-9]{64}$/.test(String(token || ''))) throw invalid();
  const [rows] = await pool.execute(
    'SELECT * FROM sms_consent_requests WHERE token_hash = ? AND expires_at > UTC_TIMESTAMP() LIMIT 1', [hash(token)]
  );
  if (!rows[0]) throw invalid();
  return rows[0];
}

export async function viewSmsConsentRequest(token) {
  const row = await requestForToken(token);
  return { disclosure: parse(row.disclosure_json), disclosureHash: row.disclosure_hash,
    phoneLastFour: row.phone.slice(-4), signerRole: row.signer_role, signed: !!row.signed_at };
}

export function validateSmsSignature({ disclosure, disclosureHash, expectedHash, choices, signerName, authorityAccepted, electronicSignatureAccepted, phone, expectedPhone }) {
  const problems = [];
  if (disclosureHash !== expectedHash) problems.push('The disclosure changed. Reload the form before signing.');
  if (typeof signerName !== 'string' || !signerName.trim() || signerName.trim().length > 200) problems.push('Enter your full name to sign.');
  if (authorityAccepted !== true || electronicSignatureAccepted !== true) problems.push('Confirm your authority and electronic signature.');
  const actual = Buffer.from(normalizeSmsPhone(phone) || '');
  const expected = Buffer.from(expectedPhone || '');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) problems.push('Enter the phone number this consent request was issued for.');
  const purposes = disclosure.purposes.map((p) => p.purpose);
  if (!choices || Object.keys(choices).some((p) => !purposes.includes(p))
      || purposes.some((p) => !['yes', 'no'].includes(choices[p]))) problems.push('Choose Yes or No for every listed purpose. All choices may be No.');
  return problems;
}

export async function signSmsConsentRequest({ token, input, ip, userAgent }) {
  const row = await requestForToken(token);
  if (row.signed_at) return { signed: true, alreadySigned: true };
  if (!isChatEncryptionConfigured()) throw new Error('Encryption is unavailable; no signature was saved');
  const disclosure = parse(row.disclosure_json);
  const problems = validateSmsSignature({ ...input, disclosure, expectedHash: row.disclosure_hash, expectedPhone: row.phone });
  if (problems.length) throw Object.assign(new Error(problems.join(' ')), { status: 400 });
  const signed = { signerName: input.signerName.trim(), signerRole: row.signer_role, phone: row.phone,
    choices: input.choices, authorityAccepted: true, electronicSignatureAccepted: true,
    disclosure, disclosureHash: row.disclosure_hash, signedAt: new Date().toISOString(), ip, userAgent };
  const encrypted = encryptChatText(JSON.stringify(signed));
  const [result] = await pool.execute(
    'UPDATE sms_consent_requests SET signed_payload_json = ?, signed_at = UTC_TIMESTAMP() WHERE id = ? AND signed_at IS NULL',
    [JSON.stringify(encrypted), row.id]
  );
  // Signature review and activation are deliberate separate steps. Until review,
  // no recurring messages can leave the permission gate.
  return { signed: true, alreadySigned: result.affectedRows === 0, awaitingReview: true };
}

export async function reviewSmsConsentRequest({ agencyId, requestId, actorUserId, signerVerified, sendConfirmation }) {
  if (signerVerified !== true) throw smsPolicyError('sms_review_required', 'Verify the signed evidence and signer authority before activating these choices');
  const [rows] = await pool.execute('SELECT * FROM sms_consent_requests WHERE id = ? AND agency_id = ?', [requestId, agencyId]);
  const row = rows[0];
  if (!row?.signed_at || !row.signed_payload_json) throw smsPolicyError('sms_signature_missing', 'The recipient must sign before activation');
  const signed = JSON.parse(decryptChatText(parse(row.signed_payload_json)));
  const [numbers] = await pool.execute('SELECT phone_number FROM twilio_numbers WHERE id = ? AND agency_id = ?', [row.number_id, agencyId]);
  if (!numbers[0]) throw invalid();
  const sender = await getSmsSender(numbers[0].phone_number);
  const currentDisclosure = JSON.stringify(buildSmsConsentDisclosure(sender.registration, { signerRole: row.signer_role, enrollmentCategory: signed.disclosure.enrollmentCategory }));
  if (hash(currentDisclosure) !== row.disclosure_hash) throw smsPolicyError('sms_disclosure_changed', 'The program disclosure changed; issue a fresh consent request');
  const [newer] = await pool.execute(
    `SELECT id FROM sms_consent_requests WHERE agency_id = ? AND number_id = ? AND phone = ?
     AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(disclosure_json,'$.enrollmentCategory')),'staff') = ?
     AND signed_at IS NOT NULL AND (signed_at > ? OR (signed_at = ? AND id > ?)) LIMIT 1`,
    [agencyId, row.number_id, row.phone, signed.disclosure.enrollmentCategory || 'staff', row.signed_at, row.signed_at, row.id]
  );
  if (newer.length) throw smsPolicyError('sms_consent_superseded', 'Review the recipient’s newer signed choices instead');
  const reviewToken = randomBytes(32).toString('hex');
  const [claim] = await pool.execute('UPDATE sms_consent_requests SET review_token = ? WHERE id = ? AND review_token IS NULL', [reviewToken, row.id]);
  if (claim.affectedRows !== 1) throw smsPolicyError('sms_review_in_progress', 'This consent request is already being reviewed');
  try {
    const [claimedRows] = await pool.execute('SELECT activation_json FROM sms_consent_requests WHERE id = ?', [row.id]);
    const results = parse(claimedRows[0]?.activation_json) || {};
    if (signed.disclosure.enrollmentCategory === 'hiring') {
      // An isolated grant: reviewing hiring consent cannot overwrite staff/poll permissions.
      if (results.workforce?.activated) return {reviewed:true,results};
      const [preferences]=await pool.execute(`SELECT user_id FROM hire_communication_preferences
        WHERE agency_id=? AND consent_request_id=? AND phone=? AND channel='email_sms'`,[agencyId,row.id,row.phone]);
      if(!preferences.length)throw smsPolicyError('sms_consent_superseded','The applicant changed their hiring notification choices.');
      results.workforce={activated:true,choice:signed.choices.workforce,reviewedBy:actorUserId,reviewedAt:new Date().toISOString()};
      await pool.execute('UPDATE sms_consent_requests SET activation_json=? WHERE id=?',[JSON.stringify(results),row.id]);
      try {
        if(signed.choices.workforce==='yes')await sendConfirmation({to:row.phone,from:sender.phone_number,purpose:'workforce',agencyId,
          staffNotificationKind:'hiring',hiringUserId:preferences[0].user_id,body:'You subscribed to hiring and onboarding updates. Email will continue. Message frequency varies; message and data rates may apply. Reply HELP for help, STOP to opt out.'});
      } catch(error) {
        results.workforce.activated=false;
        await pool.execute('UPDATE sms_consent_requests SET activation_json=? WHERE id=?',[JSON.stringify(results),row.id]);
        throw error;
      }
      if(signed.choices.workforce==='yes'){
        const {queueHiringNotification}=await import('./hiringNotification.service.js');
        for(const preference of preferences){
          const [[person]]=await pool.execute('SELECT status FROM users WHERE id=?',[preference.user_id]);
          if(['PENDING_SETUP','PREHIRE_OPEN','PREHIRE_REVIEW','ONBOARDING'].includes(person?.status))
            await queueHiringNotification({userId:preference.user_id,agencyId,key:`enrollment:${row.id}`,type:person.status==='ONBOARDING'?'onboarding_started':'prehire_invite',emailAlreadyHandled:true});
        }
      }
      return {reviewed:true,results};
    }
    for (const [purpose, choice] of Object.entries(signed.choices)) {
      if (results[purpose]?.activated) continue;
      await enrollSmsRecipient({ from: sender.phone_number, phone: row.phone, purpose,
        status: choice === 'yes' ? 'opted_in' : 'opted_out', actorUserId, sendConfirmation,
        evidence: { source: 'web_form', reference: `sms_consent_request:${row.id}`, disclosure: signed.disclosure.text,
          collectedAt: signed.signedAt, disclosureHash: row.disclosure_hash, signatureReference: `sms_consent_request:${row.id}`, signerVerified: true,
          separateMarketingConsent: purpose === 'marketing' && choice === 'yes' } });
      results[purpose] = { activated: true, choice, reviewedBy: actorUserId, reviewedAt: new Date().toISOString() };
      await pool.execute('UPDATE sms_consent_requests SET activation_json = ? WHERE id = ?', [JSON.stringify(results), row.id]);
    }
    return { reviewed: true, results };
  } finally {
    await pool.execute('UPDATE sms_consent_requests SET review_token = NULL WHERE id = ? AND review_token = ?', [row.id, reviewToken]);
  }
}

export async function listSmsConsentRequests(agencyId) {
  const [rows] = await pool.execute(
    `SELECT id, number_id, RIGHT(phone, 4) AS phone_last_four, signer_role, signed_at, expires_at,
     activation_json, JSON_UNQUOTE(JSON_EXTRACT(disclosure_json,'$.enrollmentCategory')) AS enrollment_category, created_at FROM sms_consent_requests WHERE agency_id = ? ORDER BY id DESC LIMIT 200`, [agencyId]
  );
  return rows;
}

export async function getSignedSmsEvidence({ agencyId, requestId }) {
  const [rows] = await pool.execute('SELECT signed_payload_json FROM sms_consent_requests WHERE id = ? AND agency_id = ?', [requestId, agencyId]);
  if (!rows[0]?.signed_payload_json) throw invalid();
  return JSON.parse(decryptChatText(parse(rows[0].signed_payload_json)));
}
