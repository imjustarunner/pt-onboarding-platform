import pool from '../config/database.js';

class UserTrainingFocusProgress {
  static async find(userId, trainingFocusId, agencyId) {
    const [rows] = await pool.execute(
      `SELECT * FROM user_training_focus_progress
       WHERE user_id = ? AND training_focus_id = ? AND agency_id = ?`,
      [userId, trainingFocusId, agencyId]
    );
    return rows[0] ? this._normalize(rows[0]) : null;
  }

  static async ensure(userId, trainingFocusId, agencyId) {
    const existing = await this.find(userId, trainingFocusId, agencyId);
    if (existing) return existing;
    await pool.execute(
      `INSERT INTO user_training_focus_progress (user_id, training_focus_id, agency_id, status)
       VALUES (?, ?, ?, 'not_started')`,
      [userId, trainingFocusId, agencyId]
    );
    return this.find(userId, trainingFocusId, agencyId);
  }

  static async updateCurrentStep(userId, trainingFocusId, agencyId, stepId) {
    await this.ensure(userId, trainingFocusId, agencyId);
    await pool.execute(
      `UPDATE user_training_focus_progress
       SET current_step_id = ?,
           status = CASE WHEN status = 'not_started' THEN 'in_progress' ELSE status END,
           started_at = COALESCE(started_at, CURRENT_TIMESTAMP)
       WHERE user_id = ? AND training_focus_id = ? AND agency_id = ?`,
      [stepId, userId, trainingFocusId, agencyId]
    );
    return this.find(userId, trainingFocusId, agencyId);
  }

  static async addTime(userId, trainingFocusId, agencyId, seconds) {
    const safe = Math.max(0, Math.floor(Number(seconds || 0)));
    if (!safe) return this.find(userId, trainingFocusId, agencyId);
    await this.ensure(userId, trainingFocusId, agencyId);
    await pool.execute(
      `UPDATE user_training_focus_progress
       SET total_time_spent_seconds = total_time_spent_seconds + ?
       WHERE user_id = ? AND training_focus_id = ? AND agency_id = ?`,
      [safe, userId, trainingFocusId, agencyId]
    );
    return this.find(userId, trainingFocusId, agencyId);
  }

  static async markCompleted(userId, trainingFocusId, agencyId, payrollClaimId = null) {
    await pool.execute(
      `UPDATE user_training_focus_progress
       SET status = 'completed',
           completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP),
           current_step_id = NULL,
           payroll_claim_id = COALESCE(?, payroll_claim_id)
       WHERE user_id = ? AND training_focus_id = ? AND agency_id = ?`,
      [payrollClaimId, userId, trainingFocusId, agencyId]
    );
    return this.find(userId, trainingFocusId, agencyId);
  }

  static async setPayrollClaimId(userId, trainingFocusId, agencyId, payrollClaimId) {
    await pool.execute(
      `UPDATE user_training_focus_progress
       SET payroll_claim_id = ?
       WHERE user_id = ? AND training_focus_id = ? AND agency_id = ?`,
      [payrollClaimId, userId, trainingFocusId, agencyId]
    );
    return this.find(userId, trainingFocusId, agencyId);
  }

  static _normalize(row) {
    return {
      userId: row.user_id,
      trainingFocusId: row.training_focus_id,
      agencyId: row.agency_id,
      status: row.status,
      currentStepId: row.current_step_id,
      totalTimeSpentSeconds: row.total_time_spent_seconds || 0,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      payrollClaimId: row.payroll_claim_id
    };
  }
}

class UserTrainingFocusStepProgress {
  static async find(userId, agencyId, stepId) {
    const [rows] = await pool.execute(
      `SELECT * FROM user_training_focus_step_progress
       WHERE user_id = ? AND agency_id = ? AND step_id = ?`,
      [userId, agencyId, stepId]
    );
    return rows[0] ? this._normalize(rows[0]) : null;
  }

  static async findByFocus(userId, agencyId, trainingFocusId) {
    const [rows] = await pool.execute(
      `SELECT usp.*
       FROM user_training_focus_step_progress usp
       INNER JOIN training_focus_steps tfs ON tfs.id = usp.step_id
       WHERE usp.user_id = ? AND usp.agency_id = ? AND tfs.training_focus_id = ?
       ORDER BY tfs.order_index ASC`,
      [userId, agencyId, trainingFocusId]
    );
    return rows.map((r) => this._normalize(r));
  }

  static async ensure(userId, agencyId, stepId) {
    const existing = await this.find(userId, agencyId, stepId);
    if (existing) return existing;
    await pool.execute(
      `INSERT INTO user_training_focus_step_progress (user_id, agency_id, step_id, status)
       VALUES (?, ?, ?, 'not_started')`,
      [userId, agencyId, stepId]
    );
    return this.find(userId, agencyId, stepId);
  }

  static async start(userId, agencyId, stepId) {
    await this.ensure(userId, agencyId, stepId);
    await pool.execute(
      `UPDATE user_training_focus_step_progress
       SET status = 'in_progress',
           started_at = COALESCE(started_at, CURRENT_TIMESTAMP)
       WHERE user_id = ? AND agency_id = ? AND step_id = ?`,
      [userId, agencyId, stepId]
    );
    return this.find(userId, agencyId, stepId);
  }

  static async complete(userId, agencyId, stepId) {
    await this.ensure(userId, agencyId, stepId);
    await pool.execute(
      `UPDATE user_training_focus_step_progress
       SET status = 'completed',
           completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP)
       WHERE user_id = ? AND agency_id = ? AND step_id = ?`,
      [userId, agencyId, stepId]
    );
    return this.find(userId, agencyId, stepId);
  }

  static async addTime(userId, agencyId, stepId, seconds) {
    const safe = Math.max(0, Math.floor(Number(seconds || 0)));
    if (!safe) return this.find(userId, agencyId, stepId);
    await this.ensure(userId, agencyId, stepId);
    await pool.execute(
      `UPDATE user_training_focus_step_progress
       SET time_spent_seconds = time_spent_seconds + ?
       WHERE user_id = ? AND agency_id = ? AND step_id = ?`,
      [safe, userId, agencyId, stepId]
    );
    return this.find(userId, agencyId, stepId);
  }

  static _normalize(row) {
    return {
      userId: row.user_id,
      agencyId: row.agency_id,
      stepId: row.step_id,
      status: row.status,
      timeSpentSeconds: row.time_spent_seconds || 0,
      startedAt: row.started_at,
      completedAt: row.completed_at
    };
  }
}

class TrainingFocusTimeLog {
  static async create({ userId, agencyId, trainingFocusId, stepId, sessionStart, sessionEnd, durationSeconds }) {
    const [result] = await pool.execute(
      `INSERT INTO training_focus_time_logs
       (user_id, agency_id, training_focus_id, step_id, session_start, session_end, duration_seconds)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        agencyId,
        trainingFocusId,
        stepId,
        sessionStart,
        sessionEnd,
        Math.max(0, Math.floor(Number(durationSeconds || 0)))
      ]
    );
    return result.insertId;
  }
}

export { UserTrainingFocusProgress, UserTrainingFocusStepProgress, TrainingFocusTimeLog };
