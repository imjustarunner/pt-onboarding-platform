/**
 * Promote durable job-application answers into hiring_profiles + user_info_values.
 */
import pool from '../config/database.js';

function asString(v) {
  if (v == null) return null;
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return null;
}

function pick(obj, keys) {
  if (!obj || typeof obj !== 'object') return null;
  for (const k of keys) {
    const v = obj[k];
    const s = asString(v);
    if (s) return s;
  }
  return null;
}

/**
 * Flatten common job-application shapes into profile field updates.
 */
export function extractJobApplicationProfileFields(intakeData = {}) {
  const root = intakeData && typeof intakeData === 'object' ? intakeData : {};
  const responses = root.responses && typeof root.responses === 'object' ? root.responses : root;
  const submission = responses.submission && typeof responses.submission === 'object'
    ? responses.submission
    : (root.submission && typeof root.submission === 'object' ? root.submission : {});
  const guardian = responses.guardian || root.guardian || {};
  const applicant = responses.applicant || root.applicant || submission || {};

  const firstName = pick(applicant, ['first_name', 'firstName', 'legal_first_name'])
    || pick(guardian, ['first_name', 'firstName']);
  const lastName = pick(applicant, ['last_name', 'lastName', 'legal_last_name'])
    || pick(guardian, ['last_name', 'lastName']);
  const phone = pick(applicant, ['phone', 'phone_number', 'personal_phone', 'mobile'])
    || pick(guardian, ['phone', 'phone_number']);
  const address = pick(applicant, ['address', 'home_street_address', 'street'])
    || pick(submission, ['address', 'home_street_address']);
  const city = pick(applicant, ['city', 'home_city']) || pick(submission, ['city', 'home_city']);
  const state = pick(applicant, ['state', 'home_state']) || pick(submission, ['state', 'home_state']);
  const postal = pick(applicant, ['zip', 'postal_code', 'home_postal_code'])
    || pick(submission, ['zip', 'postal_code', 'home_postal_code']);
  const coverLetter = pick(root, ['cover_letter', 'coverLetter'])
    || pick(submission, ['cover_letter', 'coverLetter', 'why_join']);
  const preferredName = pick(applicant, ['preferred_name', 'preferredName', 'nickname']);

  const fieldMap = {};
  if (firstName) fieldMap.legal_first_name = firstName;
  if (lastName) fieldMap.legal_last_name = lastName;
  if (preferredName) fieldMap.preferred_name = preferredName;
  if (phone) fieldMap.personal_phone = phone;
  if (address) fieldMap.home_street_address = address;
  if (city) fieldMap.home_city = city;
  if (state) fieldMap.home_state = state;
  if (postal) fieldMap.home_postal_code = postal;
  if (coverLetter) fieldMap.cover_letter = coverLetter;

  return { fieldMap, coverLetter, firstName, lastName, phone };
}

async function upsertUserInfoValue(userId, agencyId, fieldKey, value) {
  const key = String(fieldKey || '').trim();
  const val = asString(value);
  if (!key || val == null) return;
  try {
    await pool.execute(
      `INSERT INTO user_info_values (user_id, agency_id, field_key, value_text, updated_at)
       VALUES (?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE value_text = VALUES(value_text), updated_at = NOW()`,
      [userId, agencyId || null, key, val]
    );
  } catch {
    try {
      await pool.execute(
        `INSERT INTO user_info_values (user_id, field_key, value_text)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE value_text = VALUES(value_text)`,
        [userId, key, val]
      );
    } catch {
      /* schema variants */
    }
  }
}

/**
 * Write extracted fields onto the candidate account for portal / Account Info display.
 */
export async function importJobApplicationIntoUserAccount({
  userId,
  agencyId = null,
  intakeData = {},
  coverLetter = null
} = {}) {
  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0) return { ok: false, reason: 'invalid_user' };

  const extracted = extractJobApplicationProfileFields(intakeData);
  if (coverLetter && !extracted.coverLetter) extracted.coverLetter = asString(coverLetter);
  if (extracted.coverLetter) extracted.fieldMap.cover_letter = extracted.coverLetter;

  // Persist cover letter on hiring_profiles when column exists
  if (extracted.coverLetter) {
    try {
      await pool.execute(
        `UPDATE hiring_profiles SET cover_letter = COALESCE(?, cover_letter) WHERE candidate_user_id = ?`,
        [extracted.coverLetter, id]
      );
    } catch { /* ignore */ }
  }

  // Best-effort user column updates
  const userSets = [];
  const userParams = [];
  if (extracted.phone) {
    userSets.push("phone_number = COALESCE(NULLIF(phone_number, ''), ?)");
    userParams.push(extracted.phone);
    userSets.push("personal_phone = COALESCE(NULLIF(personal_phone, ''), ?)");
    userParams.push(extracted.phone);
  }
  if (extracted.firstName) {
    userSets.push("first_name = COALESCE(NULLIF(first_name, ''), ?)");
    userParams.push(extracted.firstName);
  }
  if (extracted.lastName) {
    userSets.push("last_name = COALESCE(NULLIF(last_name, ''), ?)");
    userParams.push(extracted.lastName);
  }
  if (userSets.length) {
    try {
      userParams.push(id);
      await pool.execute(`UPDATE users SET ${userSets.join(', ')} WHERE id = ?`, userParams);
    } catch { /* ignore */ }
  }

  for (const [key, value] of Object.entries(extracted.fieldMap || {})) {
    if (key === 'cover_letter') continue;
    await upsertUserInfoValue(id, agencyId, key, value);
  }

  return {
    ok: true,
    fieldsWritten: Object.keys(extracted.fieldMap || {}),
    coverLetter: extracted.coverLetter || null
  };
}

export default {
  extractJobApplicationProfileFields,
  importJobApplicationIntoUserAccount
};
