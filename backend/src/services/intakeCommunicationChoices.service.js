import { createHash } from 'node:crypto';
import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import IntakeSubmission from '../models/IntakeSubmission.model.js';
import { normalizeSmsPhone } from '../utils/smsThreadIdentity.js';

export const ENROLLMENT_EMAIL_NOTICE_VERSION = '2026-10-28.1';
export const ENROLLMENT_CONTACT_NOTICE = 'Your enrollment confirmation and requested portal setup, sign-in and password recovery emails are separate from optional updates. These choices do not affect care. Texting choices are separate. Use the contact options below if automatic email is not safe for you.';

export const INTAKE_COMMUNICATION_VERSION = '2026-10-06.2';
export const SCHOOL_COMMUNICATION_NOTICE = 'For visits at school, no appointment confirmation is needed. If your child will be absent or plans change, let our team know. A reply is reviewed by staff and does not automatically cancel a visit or create a fee. Continue to report absences to the school as usual. Your billing office may differ from the school where services take place.';

export function intakeCommunicationDisclosure(agency) {
  const brandName = String(agency?.official_name || agency?.name || '').trim();
  return { version: INTAKE_COMMUNICATION_VERSION, agencyId: Number(agency?.id), brandName,
    emailNoticeVersion: ENROLLMENT_EMAIL_NOTICE_VERSION, essentialText: ENROLLMENT_CONTACT_NOTICE,
    emailText: `${brandName} offers optional account emails about appointments, school sessions when applicable, schedule changes, secure-message alerts, forms and signatures, enrollment follow-ups, billing and required insurance cards. Medicaid cards are not requested. Choose all optional account emails, scheduling only, or essential messages only. This choice does not include marketing, enroll another adult, or affect your care. Requested login, password recovery and essential security messages are separate.`,
    emailAllLabel: 'All optional account updates (no marketing)',
    text: `${brandName} offers optional text messages for appointment reminders, schedule changes, cancellations and links to sign in or join a scheduled session. Choose Yes or No below. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Choosing No does not affect care, enrollment or school services. This choice does not authorize marketing or enroll other contacts. Texts may appear on a shared phone or lock screen; use the secure app for private details.`,
    schoolText: SCHOOL_COMMUNICATION_NOTICE,
    signatureText: 'By typing my name and continuing, I electronically sign these choices. If I request texts, I control the listed phone and am the recipient or their authorized guardian. I can decline texts and still receive services.' };
}

export function ensureEnrollmentCommunicationStep(link, steps = []) {
  const list = Array.isArray(steps) ? steps : [];
  if (!Number(link?.create_client) || ['smart_school_roi', 'smart_disclosure', 'job_application'].includes(link?.form_type) || link?.job_description_id) return list;
  if (list.some(s => s.type === 'communications')) return list.map(s => s.type === 'communications'
    ? { ...s, showIf: null, audience: null, visibility: 'always', repeatPerClient: false, campaigns: { ...s.campaigns, internalWorkforce: false } } : s);
  // Empty legacy step lists mean “show all packet documents,” not “no documents.”
  let templateIds = link?.allowed_document_template_ids || [];
  if (typeof templateIds === 'string') templateIds = JSON.parse(templateIds);
  const packetSteps = list.length ? list : (Array.isArray(templateIds) ? templateIds : [])
    .map(Number).filter(id => id > 0).map(templateId => ({ id: `doc_${templateId}`, type: 'document', templateId }));
  return [...packetSteps, { id: 'enrollment_communications', type: 'communications', label: 'Communication choices',
    campaigns: { scheduling: true, providerTexting: false, programUpdates: false, internalWorkforce: false } }];
}

export function getIntakeCommunicationChoices(intakeData) {
  const data = typeof intakeData === 'string' ? JSON.parse(intakeData) : intakeData;
  return data?.responses?.submission?.communicationPreferences || data?.submission?.communicationPreferences || null;
}

// Persist this inside the existing encrypted, hashed intake envelope. A Yes is
// evidence for review, not permission to bypass the campaign/STOP gate.
export async function validateAndStampIntakeCommunications({ link, agencyId, intakeData, submittedAt }) {
  const cp = getIntakeCommunicationChoices(intakeData);
  const required = ensureEnrollmentCommunicationStep(link, link.intake_steps).some(s => s.type === 'communications');
  if (!required && !cp) return;
  const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
  if (!cp || !['all', 'scheduling_only', 'no'].includes(cp.emailPreference) || !['scheduling_only', 'no'].includes(cp.smsPreference)) {
    fail('Please choose Yes or No for text messages and an email preference. All choices may be No.');
  }
  const disclosure = intakeCommunicationDisclosure(await Agency.findById(agencyId));
  // Client enrollment must never accept a forged workforce subscription.
  cp.internalWorkforceOptIn = null;
  if (cp.version !== disclosure.version || cp.disclosure !== disclosure.text || cp.schoolDisclosure !== disclosure.schoolText) {
    fail('Communication information has changed. Refresh and review your communication choices before signing.');
  }
  if (!String(cp.signerName || '').trim() || cp.signatureAccepted !== true) fail('Please sign your communication choices. You may decline all texts.');
  // Existing open forms retain their original meaning; SMS evidence keeps its version.
  const legacyEmailText = disclosure.emailText.replace('Choose all optional account emails, scheduling only, or essential messages only.', 'Choose all account emails, scheduling only, or No.');
  if (cp.emailNoticeVersion != null) {
    if (cp.emailNoticeVersion !== ENROLLMENT_EMAIL_NOTICE_VERSION || cp.essentialDisclosure !== disclosure.essentialText || cp.emailDisclosure !== disclosure.emailText)
      fail('Email communication information has changed. Refresh and review your choices.');
    for (const key of ['noRoutineCalls', 'noAutomaticEmail']) {
      if (typeof cp[key] !== 'boolean') fail('Please review your contact options.');
    }
    if (cp.alternativeContactInstructions != null && (typeof cp.alternativeContactInstructions !== 'string' || cp.alternativeContactInstructions.length > 500))
      fail('Keep alternate contact instructions to 500 characters.');
    cp.alternativeContactInstructions = String(cp.alternativeContactInstructions || '').trim();
  } else {
    if (cp.emailDisclosure != null && ![legacyEmailText, disclosure.emailText].includes(cp.emailDisclosure))
      fail('Email communication information has changed. Refresh and review your choices.');
    // A legacy page cannot opt someone into the new essential confirmation policy.
    delete cp.essentialDisclosure; delete cp.noRoutineCalls; delete cp.noAutomaticEmail; delete cp.alternativeContactInstructions;
  }
  if (cp.providerTextingOptIn != null && !['yes','no'].includes(cp.providerTextingOptIn)) fail('Choose Yes or No for care-team texting.');
  if ((cp.smsPreference === 'scheduling_only' || cp.providerTextingOptIn === 'yes') && !normalizeSmsPhone(cp.recipientPhone)) fail('Enter the phone you control to request texts, or choose No.');
  if (!cp.termsUrl || !cp.privacyUrl) fail('The communication terms and privacy policy must be available before signing.');
  cp.agencyId = Number(agencyId);
  cp.brandName = disclosure.brandName;
  cp.recipientPhone = normalizeSmsPhone(cp.recipientPhone) || null;
  cp.signerName = String(cp.signerName).trim().slice(0, 200);
  cp.disclosureHash = createHash('sha256').update(JSON.stringify(disclosure)).digest('hex');
  cp.signedAt = submittedAt.toISOString();
  cp.activationStatus = cp.smsPreference === 'no' ? 'declined' : 'awaiting_recipient_and_campaign_review';
  cp.emailActivationStatus = cp.emailPreference === 'no' ? 'declined' : 'selected_subject_to_agency_controls';
  cp.providerTextingActivationStatus = cp.providerTextingOptIn === 'yes' ? 'awaiting_recipient_and_campaign_review' : 'declined';
}

export async function latestIntakeCommunicationChoices(clientId, agencyId, guardianUserId = null, recipientEmail = null) {
  const [rows] = await pool.execute(
    `SELECT DISTINCT s.id FROM intake_submissions s
     LEFT JOIN intake_submission_clients ic ON ic.intake_submission_id = s.id
     JOIN intake_links l ON l.id = s.intake_link_id
     WHERE (ic.client_id = ? OR s.client_id = ?) AND s.status = 'submitted'
       AND (? IS NULL OR s.guardian_user_id = ?)
       AND ((l.scope_type = 'agency' AND l.organization_id = ?)
         OR EXISTS (SELECT 1 FROM organization_affiliations oa WHERE oa.organization_id = l.organization_id AND oa.agency_id = ? AND oa.is_active = TRUE)
         OR EXISTS (SELECT 1 FROM agency_schools sc WHERE sc.school_organization_id = l.organization_id AND sc.agency_id = ? AND sc.is_active = TRUE))
     ORDER BY s.id DESC LIMIT 20`, [clientId, clientId, guardianUserId, guardianUserId, agencyId, agencyId, agencyId]);
  for (const row of rows) {
    const submission = await IntakeSubmission.findById(row.id);
    if (recipientEmail && String(submission?.signer_email || '').trim().toLowerCase() !== String(recipientEmail).trim().toLowerCase()) continue;
    const cp = getIntakeCommunicationChoices(submission?.intake_data);
    if (cp && (!cp.agencyId || Number(cp.agencyId) === Number(agencyId))) return { ...cp, submissionId: row.id, submittedAt: submission.submitted_at, guardianUserId: submission.guardian_user_id || null, recipientEmail: submission.signer_email || null };
  }
  return null;
}

export function classifyIntakeReminderChoice(cp) {
  if (cp?.smsPreference === 'no') return 'declined';
  if (cp?.smsPreference !== 'scheduling_only') return 'no_recorded_choice';
  return cp.version === INTAKE_COMMUNICATION_VERSION && cp.signatureAccepted === true && cp.signedAt && cp.recipientPhone
    ? 'signed_choice_for_review' : 'legacy_yes_needs_evidence_review';
}

export async function intakeReminderConsentAudit(agencyId, afterClientId = 0) {
  const [clients] = await pool.execute(`SELECT DISTINCT c.id FROM clients c
    LEFT JOIN client_agency_assignments ca ON ca.client_id = c.id AND ca.is_active = TRUE
    WHERE (c.agency_id = ? OR ca.agency_id = ?) AND c.id > ? ORDER BY c.id LIMIT 101`,
  [agencyId, agencyId, afterClientId]);
  const entries = [];
  const counts = { declined: 0, no_recorded_choice: 0, signed_choice_for_review: 0, legacy_yes_needs_evidence_review: 0 };
  for (const client of clients.slice(0, 100)) {
    const cp = await latestIntakeCommunicationChoices(client.id, agencyId);
    const classification = classifyIntakeReminderChoice(cp);
    counts[classification] += 1;
    entries.push({ clientId: client.id, submissionId: cp?.submissionId || null, classification,
      phoneLastFour: cp?.recipientPhone?.slice(-4) || null, signedAt: cp?.signedAt || null });
  }
  return { counts, entries, nextAfterClientId: clients.length > 100 ? entries.at(-1).clientId : null,
    note: 'These are intake choices for this page of clients, not an SMS delivery authorization count. Campaign consent, recipient identity, STOP, preferences and linked-number readiness are checked separately.' };
}

export async function intakeReminderConsentEvidence(agencyId, clientId) {
  const [clients] = await pool.execute(`SELECT c.id FROM clients c
    LEFT JOIN client_agency_assignments ca ON ca.client_id = c.id AND ca.is_active = TRUE
    WHERE c.id = ? AND (c.agency_id = ? OR ca.agency_id = ?) LIMIT 1`, [clientId, agencyId, agencyId]);
  if (!clients.length) throw Object.assign(new Error('Client not found'), { status: 404 });
  const cp = await latestIntakeCommunicationChoices(clientId, agencyId);
  if (classifyIntakeReminderChoice(cp) !== 'signed_choice_for_review') {
    throw Object.assign(new Error('Issue a current consent signing link; this intake does not contain current signed recipient evidence.'), { status: 409 });
  }
  return { phone: cp.recipientPhone, signerName: cp.signerName, purpose: 'reminders', status: 'opted_in',
    evidence: { source: 'web_form', reference: `intake_submission:${cp.submissionId}`, signatureReference: `intake_submission:${cp.submissionId}:communication_choices`,
      collectedAt: cp.signedAt, disclosure: `${cp.disclosure}\n${cp.schoolDisclosure}\nTerms: ${cp.termsUrl}\nPrivacy: ${cp.privacyUrl}`,
      disclosureHash: cp.disclosureHash, signerVerified: false } };
}
