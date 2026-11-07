import { decryptIntakeSubmissionRows } from './intakeResponsesEncryption.service.js';
import { normalizeIntakeDataShape } from './completedIntakeRecord.service.js';

export function normalizeEnrollmentSubject(value) {
  const subject = String(value || '').trim().toLowerCase();
  if (['self', 'myself'].includes(subject)) return 'self';
  if (['dependent', 'child'].includes(subject)) return 'dependent';
  if (['representative', 'adult_representative'].includes(subject)) return 'representative';
  return ['couple', 'family', 'legal', 'on_behalf'].includes(subject) ? subject : null;
}

function submissionSubject(row) {
  let data = row.intake_data;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch { return null; }
  }
  data = normalizeIntakeDataShape(data || {});
  const answer = data.responses?.submission || {};
  const explicit = normalizeEnrollmentSubject(answer.serviceSubject || answer.whoFor || data.serviceSubject || data.whoFor);
  if (explicit) return explicit;
  if (data.intakeForSelf === true) return 'self';
  // A legacy on-behalf answer does not establish whether the client is a child
  // or an adult represented by another person.
  return data.intakeForSelf === false ? 'on_behalf' : null;
}

/** Return only the enrollment subject, never a family's intake answers. */
export async function loadClientEnrollmentSubjects({ db, agencyId, clientIds }) {
  const ids = [...new Set((clientIds || []).map(Number).filter(id => Number.isSafeInteger(id) && id > 0))];
  const subjects = new Map();
  if (!Number.isSafeInteger(Number(agencyId)) || Number(agencyId) <= 0 || !ids.length) return subjects;
  const slots = ids.map(() => '?').join(',');
  const [rows] = await db.execute(
    `SELECT associated.client_id AS subject_client_id, s.id, s.intake_data,
            s.payload_encrypted, s.payload_iv_b64, s.payload_auth_tag_b64, s.payload_key_id
       FROM intake_submissions s
       INNER JOIN (
         SELECT id AS submission_id, client_id FROM intake_submissions WHERE client_id IN (${slots})
         UNION
         SELECT intake_submission_id AS submission_id, client_id FROM intake_submission_clients WHERE client_id IN (${slots})
       ) associated ON associated.submission_id = s.id
       INNER JOIN clients c ON c.id = associated.client_id AND c.agency_id = ?
       WHERE s.status = 'submitted'
       ORDER BY s.submitted_at DESC, s.id DESC`,
    [...ids, ...ids, Number(agencyId)]
  );
  decryptIntakeSubmissionRows(rows || []);
  const allowed = new Set(ids);
  for (const row of rows || []) {
    const clientId = Number(row.subject_client_id);
    if (!allowed.has(clientId) || subjects.has(clientId)) continue;
    const subject = submissionSubject(row);
    if (subject) subjects.set(clientId, subject);
  }
  return subjects;
}
