import pool from '../config/database.js';
import { normalizeGradeForSave } from './clientGrade.js';
import { normalizeIntakeDataShape } from './kioskWaiverDisplay.util.js';
import { decryptIntakeSubmissionRows } from '../services/intakeResponsesEncryption.service.js';

/** Intake field keys that may carry a client's grade answer. */
export const GRADE_INTAKE_KEYS = [
  'client_grade',
  'grade',
  'current_grade',
  'clients_current_grade',
  'school_grade',
  'clientGrade'
];

const hasVal = (v) => v !== null && v !== undefined && String(v).trim() !== '';

function pickGradeFromBag(bag) {
  if (!bag || typeof bag !== 'object' || Array.isArray(bag)) return null;
  for (const key of GRADE_INTAKE_KEYS) {
    const v = bag[key];
    if (hasVal(v)) return String(v).trim();
  }
  return null;
}

function getClientsArray(intakeData) {
  const nested = intakeData?.responses?.clients;
  if (Array.isArray(nested) && nested.length) return nested;
  const flat = intakeData?.clients;
  if (Array.isArray(flat) && flat.length) return flat;
  return [];
}

function parseIntakeData(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Resolve grade from normalized intake_data, checking per-child responses,
 * clinical answers, demographicsInfo, and top-level submission question keys.
 */
export function extractGradeFromIntakeData({ intakeData, clientIndex = 0 }) {
  if (!intakeData || typeof intakeData !== 'object') return null;
  const normalized = normalizeIntakeDataShape(intakeData);
  const submission = normalized?.responses?.submission || {};
  const perClient = getClientsArray(normalized)[clientIndex] || null;
  const clinical = submission?.clinicalResponses && typeof submission.clinicalResponses === 'object'
    ? submission.clinicalResponses
    : {};
  const demo = submission?.demographicsInfo && typeof submission.demographicsInfo === 'object'
    ? submission.demographicsInfo
    : {};

  return (
    pickGradeFromBag(perClient)
    || pickGradeFromBag(clinical)
    || pickGradeFromBag(demo)
    || pickGradeFromBag(submission)
  );
}

/**
 * When clients.grade is empty, copy the latest intake answer into the profile.
 * Returns the grade now on file (existing or newly synced), or null.
 */
export async function syncClientGradeFromIntakeIfMissing(clientId, dbPool = pool) {
  const cid = Number(clientId || 0);
  if (!cid) return null;

  const [gradeRows] = await dbPool.execute(
    'SELECT grade FROM clients WHERE id = ? LIMIT 1',
    [cid]
  );
  const existing = String(gradeRows?.[0]?.grade || '').trim();
  if (existing) return existing;

  let submRows = [];
  try {
    const [rows] = await dbPool.execute(
      `SELECT DISTINCT s.id, s.intake_data,
              s.payload_encrypted, s.payload_iv_b64, s.payload_auth_tag_b64, s.payload_key_id
       FROM intake_submissions s
       LEFT JOIN intake_submission_clients isc ON isc.intake_submission_id = s.id
       WHERE (s.client_id = ? OR isc.client_id = ?)
         AND (s.intake_data IS NOT NULL OR s.payload_encrypted IS NOT NULL)
       ORDER BY COALESCE(s.submitted_at, s.updated_at, s.created_at) DESC, s.id DESC
       LIMIT 5`,
      [cid, cid]
    );
    submRows = rows || [];
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') return null;
    throw e;
  }
  if (!submRows.length) return null;

  decryptIntakeSubmissionRows(submRows);

  for (const row of submRows) {
    const submissionData = parseIntakeData(row.intake_data);
    if (!submissionData) continue;

    let clientIdsForSubmission = [];
    try {
      const [iscRows] = await dbPool.execute(
        'SELECT client_id FROM intake_submission_clients WHERE intake_submission_id = ? ORDER BY id ASC',
        [row.id]
      );
      clientIdsForSubmission = (iscRows || []).map((r) => r?.client_id);
    } catch {
      // intake_submission_clients may not exist on older DBs
    }

    const idx = clientIdsForSubmission.findIndex((id) => Number(id) === cid);
    const clientIndex = idx >= 0 ? idx : 0;

    const rawGrade = extractGradeFromIntakeData({ intakeData: submissionData, clientIndex });
    if (!rawGrade) continue;

    const normalized = normalizeGradeForSave(rawGrade);
    if (!normalized) continue;

    await dbPool.execute(
      `UPDATE clients SET grade = ? WHERE id = ? AND (grade IS NULL OR TRIM(grade) = '')`,
      [normalized, cid]
    );
    return normalized;
  }

  return null;
}
