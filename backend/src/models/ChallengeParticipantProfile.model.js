/**
 * ChallengeParticipantProfile model
 * Stores gender and date_of_birth per challenge participant for segmented leaderboards.
 */
import pool from '../config/database.js';

const toInt = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

const parseDate = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null;
};

const VALID_GENDERS = new Set(['male', 'female', 'non_binary', 'prefer_not_to_say']);

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

  static async upsert({ learningClassId, providerUserId, gender = null, dateOfBirth = null }) {
    const classId = toInt(learningClassId);
    const userId = toInt(providerUserId);
    if (!classId || !userId) return null;
    const g = gender ? String(gender).toLowerCase().trim() : null;
    if (g && !VALID_GENDERS.has(g)) return null;
    const dob = parseDate(dateOfBirth);
    await pool.execute(
      `INSERT INTO challenge_participant_profiles (learning_class_id, provider_user_id, gender, date_of_birth)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE gender = VALUES(gender), date_of_birth = VALUES(date_of_birth), updated_at = CURRENT_TIMESTAMP`,
      [classId, userId, g, dob]
    );
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
