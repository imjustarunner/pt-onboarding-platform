import pool from '../config/database.js';

class UserSeparationInfo {
  static async findByUser(userId) {
    const [rows] = await pool.execute(
      'SELECT * FROM user_separation_info WHERE user_id = ?',
      [userId]
    );
    return rows[0] || null;
  }

  static async upsert(userId, data, updatedByUserId) {
    const {
      lastDayWorked,
      separationType,
      resignationReceivedDate,
      rehireEligible,
      exitInterviewCompleted,
      offboardingNotes,
    } = data;

    await pool.execute(
      `INSERT INTO user_separation_info
         (user_id, last_day_worked, separation_type, resignation_received_date,
          rehire_eligible, exit_interview_completed, offboarding_notes, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         last_day_worked              = COALESCE(VALUES(last_day_worked), last_day_worked),
         separation_type              = COALESCE(VALUES(separation_type), separation_type),
         resignation_received_date    = COALESCE(VALUES(resignation_received_date), resignation_received_date),
         rehire_eligible              = COALESCE(VALUES(rehire_eligible), rehire_eligible),
         exit_interview_completed     = VALUES(exit_interview_completed),
         offboarding_notes            = VALUES(offboarding_notes),
         updated_by_user_id           = VALUES(updated_by_user_id)`,
      [
        userId,
        lastDayWorked || null,
        separationType || null,
        resignationReceivedDate || null,
        rehireEligible != null ? (rehireEligible ? 1 : 0) : null,
        exitInterviewCompleted ? 1 : 0,
        offboardingNotes || null,
        updatedByUserId || null,
      ]
    );

    return this.findByUser(userId);
  }
}

export default UserSeparationInfo;
