/**
 * ChallengeWeeklyTask model
 * 3 tasks per week per challenge. Program Manager creates.
 * Each task has a mode: full_team | volunteer_or_elect | captain_assigns
 */
import pool from '../config/database.js';

const toInt = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

const VALID_MODES = new Set(['full_team', 'volunteer_or_elect', 'captain_assigns']);

const normalizeMode = (v) => {
  const s = String(v || '').trim().toLowerCase();
  return VALID_MODES.has(s) ? s : 'volunteer_or_elect';
};

class ChallengeWeeklyTask {
  static async findById(id) {
    const taskId = toInt(id);
    if (!taskId) return null;
    const [rows] = await pool.execute(
      `SELECT * FROM challenge_weekly_tasks WHERE id = ? LIMIT 1`,
      [taskId]
    );
    return rows?.[0] || null;
  }

  static async listByWeek(learningClassId, weekStartDate) {
    const classId = toInt(learningClassId);
    const week = String(weekStartDate || '').trim().slice(0, 10);
    if (!classId || !week) return [];
    // Include season-long tasks (no week_start_date) alongside the current week's tasks
    const [rows] = await pool.execute(
      `SELECT * FROM challenge_weekly_tasks
       WHERE learning_class_id = ?
         AND (week_start_date = ? OR is_season_long = 1)
       ORDER BY is_season_long ASC, task_index ASC`,
      [classId, week]
    );
    return rows || [];
  }

  static async create({
    learningClassId,
    weekStartDate = null,
    taskIndex,
    name,
    description = null,
    proofPolicy = 'none',
    mode = 'volunteer_or_elect',
    confidenceScore = null,
    confidenceNotes = null,
    criteriaJson = null,
    isSeasonLong = false
  }) {
    const classId = toInt(learningClassId);
    const week = weekStartDate ? String(weekStartDate).trim().slice(0, 10) : null;
    const idx = toInt(taskIndex) || 1;
    const taskName = String(name || '').trim();
    if (!classId || !taskName) return null;
    const criteriaStr = criteriaJson
      ? (typeof criteriaJson === 'string' ? criteriaJson : JSON.stringify(criteriaJson))
      : null;
    const [result] = await pool.execute(
      `INSERT INTO challenge_weekly_tasks
       (learning_class_id, week_start_date, task_index, mode, name, description, proof_policy, confidence_score, confidence_notes, criteria_json, is_season_long)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        classId,
        week,
        idx,
        normalizeMode(mode),
        taskName,
        description ? String(description).trim() : null,
        String(proofPolicy || 'none').slice(0, 32),
        confidenceScore != null ? Number(confidenceScore) : null,
        confidenceNotes ? String(confidenceNotes).slice(0, 255) : null,
        criteriaStr,
        isSeasonLong ? 1 : 0
      ]
    );
    return this.findById(result.insertId);
  }

  static async createBatch(learningClassId, weekStartDate, tasks) {
    const created = [];
    for (let i = 0; i < (tasks || []).length && i < 3; i++) {
      const t = tasks[i];
      const task = await this.create({
        learningClassId,
        weekStartDate,
        taskIndex: i + 1,
        name: t?.name || t?.title || `Challenge ${i + 1}`,
        description: t?.description || null,
        mode: t?.mode || 'volunteer_or_elect',
        proofPolicy: t?.proofPolicy || t?.proof_policy || 'none',
        confidenceScore: t?.confidenceScore ?? t?.confidence_score ?? null,
        confidenceNotes: t?.confidenceNotes ?? t?.confidence_notes ?? null,
        criteriaJson: t?.criteriaJson ?? t?.criteria_json ?? null,
        isSeasonLong: t?.isSeasonLong || t?.is_season_long || false
      });
      if (task) created.push(task);
    }
    return created;
  }

  static async deleteByWeek(learningClassId, weekStartDate) {
    const classId = toInt(learningClassId);
    const week = String(weekStartDate || '').trim().slice(0, 10);
    if (!classId || !week) return false;
    const [result] = await pool.execute(
      `DELETE FROM challenge_weekly_tasks WHERE learning_class_id = ? AND week_start_date = ?`,
      [classId, week]
    );
    return Number(result?.affectedRows || 0) > 0;
  }
}

export default ChallengeWeeklyTask;
