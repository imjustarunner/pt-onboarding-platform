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

/** Intake field keys that may carry a client's date of birth answer. */
export const DOB_INTAKE_KEYS = [
  'client_dob',
  'dob',
  'date_of_birth',
  'dateOfBirth',
  'client_date_of_birth',
  'birthdate',
  'birth_date'
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

function pickDobFromBag(bag) {
  if (!bag || typeof bag !== 'object' || Array.isArray(bag)) return null;
  for (const key of DOB_INTAKE_KEYS) {
    const v = bag[key];
    if (hasVal(v)) return String(v).trim();
  }
  return null;
}

/** Coerce a variety of date inputs to a YYYY-MM-DD string, or null. */
export function normalizeDobToYmd(raw) {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date) {
    if (!Number.isFinite(raw.getTime())) return null;
    const y = raw.getFullYear();
    const mo = String(raw.getMonth() + 1).padStart(2, '0');
    const d = String(raw.getDate()).padStart(2, '0');
    return `${y}-${mo}-${d}`;
  }
  const s = String(raw).trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const mdy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (mdy) {
    const mo = String(mdy[1]).padStart(2, '0');
    const d = String(mdy[2]).padStart(2, '0');
    return `${mdy[3]}-${mo}-${d}`;
  }
  const parsed = new Date(s);
  if (Number.isFinite(parsed.getTime())) {
    const y = parsed.getFullYear();
    if (y > 1900 && y < 2100) {
      const mo = String(parsed.getMonth() + 1).padStart(2, '0');
      const d = String(parsed.getDate()).padStart(2, '0');
      return `${y}-${mo}-${d}`;
    }
  }
  return null;
}

/** Whole years from a date-of-birth value (Date, ISO string, or MM/DD/YYYY). */
export function ageFromDateOfBirth(dob) {
  const ymd = normalizeDobToYmd(dob);
  if (!ymd) return null;
  const [y, mo, d] = ymd.split('-').map(Number);
  const birth = new Date(y, mo - 1, d);
  if (!Number.isFinite(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

function findDateLikeInObject(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  for (const [key, value] of Object.entries(obj)) {
    if (value == null || value === '') continue;
    if (typeof value === 'object') continue;
    const k = String(key).toLowerCase();
    if (/(date_?of_?birth|birth_?date|birthdate|^dob$|client_dob|client_date_of_birth|dateofbirth)/.test(k)) {
      const norm = normalizeDobToYmd(value);
      if (norm) return norm;
    }
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
 * Resolve date of birth from normalized intake_data, checking per-child
 * responses, clinical answers, demographicsInfo, and top-level keys.
 */
export function extractDobFromIntakeData({ intakeData, clientIndex = 0 }) {
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

  const raw = (
    pickDobFromBag(perClient)
    || pickDobFromBag(clinical)
    || pickDobFromBag(demo)
    || pickDobFromBag(submission)
    || findDateLikeInObject(perClient)
    || findDateLikeInObject(clinical)
    || findDateLikeInObject(demo)
    || findDateLikeInObject(submission)
  );
  return normalizeDobToYmd(raw);
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

/**
 * When clients.date_of_birth is empty, copy the latest intake answer into the
 * profile. Returns the DOB now on file (YYYY-MM-DD), or null.
 */
export async function syncClientDobFromIntakeIfMissing(clientId, dbPool = pool) {
  const cid = Number(clientId || 0);
  if (!cid) return null;

  let dobCol = true;
  try {
    const [dobRows] = await dbPool.execute(
      'SELECT date_of_birth FROM clients WHERE id = ? LIMIT 1',
      [cid]
    );
    const existing = dobRows?.[0]?.date_of_birth;
    if (existing) return normalizeDobToYmd(existing);
  } catch (e) {
    // Older DBs may not have the column yet — nothing to sync into.
    if (String(e?.message || '').includes('date_of_birth')) dobCol = false;
    else throw e;
  }
  if (!dobCol) return null;

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

    const dob = extractDobFromIntakeData({ intakeData: submissionData, clientIndex });
    if (!dob) continue;

    await dbPool.execute(
      `UPDATE clients SET date_of_birth = ? WHERE id = ? AND (date_of_birth IS NULL OR date_of_birth = '')`,
      [dob, cid]
    );
    return dob;
  }

  return null;
}
