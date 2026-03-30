/**
 * ChallengeWeeklyAssignment model
 * One person per task per team. Captain assigns or user volunteers.
 */
import pool from '../config/database.js';

const toInt = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

class ChallengeWeeklyAssignment {
  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT a.*, t.name AS task_name, t.description AS task_description, t.task_index,
              u.first_name AS provider_first_name, u.last_name AS provider_last_name,
              t2.team_name
       FROM challenge_weekly_assignments a
       INNER JOIN challenge_weekly_tasks t ON t.id = a.task_id
       INNER JOIN users u ON u.id = a.provider_user_id
       INNER JOIN challenge_teams t2 ON t2.id = a.team_id
       WHERE a.id = ? LIMIT 1`,
      [toInt(id)]
    );
    return rows?.[0] || null;
  }

  static async listByWeek(learningClassId, weekStartDate) {
    const classId = toInt(learningClassId);
    const week = String(weekStartDate || '').trim().slice(0, 10);
    if (!classId || !week) return [];
    const [rows] = await pool.execute(
      `SELECT a.*, t.name AS task_name, t.task_index, u.first_name AS provider_first_name, u.last_name AS provider_last_name,
              t2.team_name, t2.id AS team_id,
              (SELECT 1 FROM challenge_weekly_completions c WHERE c.assignment_id = a.id LIMIT 1) AS is_completed
       FROM challenge_weekly_assignments a
       INNER JOIN challenge_weekly_tasks t ON t.id = a.task_id AND t.learning_class_id = ? AND t.week_start_date = ?
       INNER JOIN users u ON u.id = a.provider_user_id
       INNER JOIN challenge_teams t2 ON t2.id = a.team_id
       ORDER BY t2.team_name, t.task_index`,
      [classId, week]
    );
    return (rows || []).map((r) => ({ ...r, is_completed: !!r.is_completed }));
  }

  static async assign({ taskId, teamId, providerUserId, assignedByUserId = null, volunteered = false }) {
    const tId = toInt(taskId);
    const teamIdNum = toInt(teamId);
    const pId = toInt(providerUserId);
    if (!tId || !teamIdNum || !pId) return null;
    await pool.execute(
      `INSERT INTO challenge_weekly_assignments (task_id, team_id, provider_user_id, assigned_by_user_id, volunteered)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE provider_user_id = VALUES(provider_user_id), assigned_by_user_id = VALUES(assigned_by_user_id), volunteered = VALUES(volunteered)`,
      [tId, teamIdNum, pId, assignedByUserId ? toInt(assignedByUserId) : null, volunteered ? 1 : 0]
    );
    const [existing] = await pool.execute(
      `SELECT id FROM challenge_weekly_assignments WHERE task_id = ? AND team_id = ? LIMIT 1`,
      [tId, teamIdNum]
    );
    return existing?.[0] ? this.findById(existing[0].id) : null;
  }

  static async markCompleted(assignmentId, { completedAt = null, notes = null, attachmentPath = null } = {}) {
    const aId = toInt(assignmentId);
    if (!aId) return null;
    const at = completedAt ? new Date(completedAt).toISOString().slice(0, 19).replace('T', ' ') : new Date().toISOString().slice(0, 19).replace('T', ' ');
    const [result] = await pool.execute(
      `INSERT INTO challenge_weekly_completions (assignment_id, completed_at, completion_notes, attachment_path)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE completed_at = VALUES(completed_at), completion_notes = VALUES(completion_notes), attachment_path = VALUES(attachment_path)`,
      [aId, at, notes ? String(notes).trim() : null, attachmentPath ? String(attachmentPath).trim() : null]
    );
    return result.insertId || true;
  }

  static async setCompletionStatus(assignmentId, { isCompleted, completedAt = null, notes = null, attachmentPath = null } = {}) {
    const aId = toInt(assignmentId);
    if (!aId) return false;
    if (isCompleted === false) {
      await pool.execute(`DELETE FROM challenge_weekly_completions WHERE assignment_id = ?`, [aId]);
      return true;
    }
    await this.markCompleted(aId, { completedAt, notes, attachmentPath });
    return true;
  }
}

export default ChallengeWeeklyAssignment;
