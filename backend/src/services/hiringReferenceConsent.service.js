import pool from '../config/database.js';
import IntakeSubmission from '../models/IntakeSubmission.model.js';
import { applicationReferenceConsent, legacyApplicationConsentProjection } from '../utils/applicationReferenceConsent.js';
const parse = raw => { try { return typeof raw === 'string' ? JSON.parse(raw) : raw || {}; } catch { return {}; } };
const blocked = message => ({ allowed: false, source: null, message });

/** Read original signed evidence; never manufacture consent or rewrite its attribution. */
export async function resolveHiringReferenceConsent({ profile, agencyId, candidateUserId, referenceIndex = null }, { db = pool, loadSubmission = id => IntakeSubmission.findById(id) } = {}) {
  const consent = parse(profile?.references_consent_json);
  if (consent.referencesWaived || consent.revoked || consent.revokedAt) return blocked('Reference authorization was waived or withdrawn. Ask the applicant to complete a new authorization through the application workflow.');
  if (consent.digitalFormAtInterviewOrOffer === true || consent.digitalFormAtInterviewOrOffer === 1) return { allowed: true, source: 'profile', message: 'Applicant authorized digital reference forms. Requests are sent only when hiring staff choose Send.' };
  const [rows] = await db.execute(`SELECT s.id,s.submitted_at FROM intake_submissions s JOIN intake_links l ON l.id=s.intake_link_id
    WHERE s.guardian_user_id=? AND l.organization_id=? AND l.form_type='job_application'
      AND l.job_description_id=? AND s.status IN ('submitted','completed','approved')
    ORDER BY s.submitted_at DESC,s.id DESC LIMIT 1`, [candidateUserId, agencyId, profile?.job_description_id || null]);
  const row = rows[0];
  if (row && legacyApplicationConsentProjection(profile, row.submitted_at)) {
    const submission = await loadSubmission(row.id);
    const original = applicationReferenceConsent(submission?.intake_data);
    const data = parse(submission?.intake_data), fields = data.responses?.submission || data.submission || {};
    const originalReferences = data.referencesJson || fields.references || [];
    const currentReferences = parse(profile.references_json);
    const targets = Array.isArray(currentReferences) ? (referenceIndex === null ? currentReferences : [currentReferences[referenceIndex]]) : [];
    const sameContacts = targets.length > 0 && Array.isArray(originalReferences) && targets.every(contact =>
      contact?.email && originalReferences.some(signed => String(signed.email || '').trim().toLowerCase() === String(contact.email).trim().toLowerCase()));
    if (Number(submission?.guardian_user_id) === Number(candidateUserId) && original.digitalFormAtInterviewOrOffer
      && original.referenceContentWaiverAcknowledged && original.referenceReleaseSigned && !original.referencesWaived && sameContacts) {
      return { allowed: true, source: 'signed_application', submissionId: row.id, message: `Applicant authorized digital reference forms in signed application #${row.id}. Requests are sent only when hiring staff choose Send.` };
    }
  }
  return blocked('Digital reference authorization is not recorded. Have the applicant complete and sign the application’s Reference Release; moving their hiring stage does not grant consent.');
}
