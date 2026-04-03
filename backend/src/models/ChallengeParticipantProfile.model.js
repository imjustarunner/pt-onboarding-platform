/**
 * ChallengeParticipantProfile model
 * Stores gender, date_of_birth, weight_lbs, and height_inches per challenge participant
 * for segmented leaderboards and recognition categories.
 */
import pool from '../config/database.js';

const toInt = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

const toDecimal = (v) => {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const parseDate = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null;
};

/**
 * Gender is stored as a free-form lowercase string.
 * Standard values: male, female, non_binary, prefer_not_to_say
 * Custom club-defined labels are also accepted (any non-empty string).
 */
const normalizeGender = (v) => {
  if (!v) return null;
  const s = String(v).trim().toLowerCase().replace(/\s+/g, '_');
  return s || null;
};

class ChallengeParticipantProfile {
  static async findByParticipant(learningClassId, providerUserId) {
    const classId = toInt(learningClassId);
    const userId = toInt(providerUserId);
    if (!classId || !userId) return null;
    const [rows] = await pool.execute(
      `SELECT * FROM challenge_participant_profiles WHERE learning_class_id = ? AND provider_user_id = ? LIMIT 1`,
      [classId, userId]
    );
    return rows?.[0] || null;
  }

  static async listByClass(learningClassId) {
    const classId = toInt(learningClassId);
    if (!classId) return [];
    const [rows] = await pool.execute(
      `SELECT p.*, u.first_name, u.last_name
       FROM challenge_participant_profiles p
       INNER JOIN users u ON u.id = p.provider_user_id
       WHERE p.learning_class_id = ?
       ORDER BY u.last_name, u.first_name`,
      [classId]
    );
    return rows || [];
  }

  static async upsert({ learningClassId, providerUserId, gender = null, dateOfBirth = null, weightLbs = undefined, heightInches = undefined }) {
    const classId = toInt(learningClassId);
    const userId = toInt(providerUserId);
    if (!classId || !userId) return null;
    const g = normalizeGender(gender);
    const dob = parseDate(dateOfBirth);
    const wt = weightLbs !== undefined ? toDecimal(weightLbs) : undefined;
    const ht = heightInches !== undefined ? toDecimal(heightInches) : undefined;

    // Build dynamic SET clause so we only update fields that were provided
    const setCols = ['gender = ?', 'date_of_birth = ?'];
    const insertCols = ['learning_class_id', 'provider_user_id', 'gender', 'date_of_birth'];
    const insertVals = [classId, userId, g, dob];
    const updateParts = ['gender = VALUES(gender)', 'date_of_birth = VALUES(date_of_birth)'];

    if (wt !== undefined) {
      insertCols.push('weight_lbs');
      insertVals.push(wt);
      updateParts.push('weight_lbs = VALUES(weight_lbs)');
    }
    if (ht !== undefined) {
      insertCols.push('height_inches');
      insertVals.push(ht);
      updateParts.push('height_inches = VALUES(height_inches)');
    }

    const sql = `INSERT INTO challenge_participant_profiles (${insertCols.join(', ')})
       VALUES (${insertCols.map(() => '?').join(', ')})
       ON DUPLICATE KEY UPDATE ${updateParts.join(', ')}, updated_at = CURRENT_TIMESTAMP`;

    await pool.execute(sql, insertVals);
    return this.findByParticipant(classId, userId);
  }

  /** Get age as of a reference date (default: today) */
  static getAge(dateOfBirth, referenceDate = null) {
    const dob = parseDate(dateOfBirth);
    if (!dob) return null;
    const ref = referenceDate ? new Date(referenceDate) : new Date();
    const birth = new Date(dob);
    let age = ref.getFullYear() - birth.getFullYear();
    const m = ref.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && ref.getDate() < birth.getDate())) age--;
    return age >= 0 ? age : null;
  }

  /** Check if participant qualifies for Master's Division (age >= threshold) */
  static isMasters(dateOfBirth, ageThreshold, referenceDate = null) {
    const age = this.getAge(dateOfBirth, referenceDate);
    const threshold = toInt(ageThreshold) ?? 53;
    return age != null && age >= threshold;
  }
}

export default ChallengeParticipantProfile;
