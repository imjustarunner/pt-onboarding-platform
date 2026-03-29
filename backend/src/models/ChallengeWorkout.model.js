/**
 * ChallengeWorkout model
 * Workout submissions for Summit Stats Challenges.
 * Participants log activities (running, cycling, etc.) that contribute points to their teams.
 */
import pool from '../config/database.js';
import { getWeekDateTimeRange } from '../utils/challengeWeekUtils.js';

const toInt = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

const parseJsonMaybe = (raw) => {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

class ChallengeWorkout {
  static _weeklyRange(weekStart, weekCutoffTime = '00:00') {
    const week = String(weekStart || '').slice(0, 10);
    if (!week) return null;
    return getWeekDateTimeRange(week, weekCutoffTime || '00:00');
  }
  static async findById(id) {
    const workoutId = toInt(id);
    if (!workoutId) return null;
    const [rows] = await pool.execute(
      `SELECT w.*, u.first_name, u.last_name
       FROM challenge_workouts w
       INNER JOIN users u ON u.id = w.user_id
       WHERE w.id = ?
       LIMIT 1`,
      [workoutId]
    );
    return rows?.[0] || null;
  }

  static async listByChallenge(learningClassId, { limit = 50, offset = 0 } = {}) {
    const classId = toInt(learningClassId);
    if (!classId) return [];
    const [rows] = await pool.execute(
      `SELECT w.*, u.first_name, u.last_name, t.team_name, wt.name AS weekly_task_name
       FROM challenge_workouts w
       INNER JOIN users u ON u.id = w.user_id
       LEFT JOIN challenge_teams t ON t.id = w.team_id
       LEFT JOIN challenge_weekly_tasks wt ON wt.id = w.weekly_task_id
       WHERE w.learning_class_id = ?
       ORDER BY w.completed_at DESC, w.created_at DESC
       LIMIT ? OFFSET ?`,
      [classId, limit, offset]
    );
    return rows || [];
  }

  static async listByUser(userId, learningClassId = null) {
    const uId = toInt(userId);
    if (!uId) return [];
    let sql = `SELECT w.*, t.team_name FROM challenge_workouts w
       LEFT JOIN challenge_teams t ON t.id = w.team_id
       WHERE w.user_id = ?`;
    const params = [uId];
    if (learningClassId) {
      sql += ` AND w.learning_class_id = ?`;
      params.push(toInt(learningClassId));
    }
    sql += ` ORDER BY w.completed_at DESC, w.created_at DESC`;
    const [rows] = await pool.execute(sql, params);
    return rows || [];
  }

  static async create({
    learningClassId,
    teamId = null,
    userId,
    activityType,
    distanceValue = null,
    durationMinutes = null,
    caloriesBurned = null,
    points = 0,
    workoutNotes = null,
    screenshotFilePath = null,
    completedAt = null,
    stravaActivityId = null,
    weeklyTaskId = null
  }) {
    const classId = toInt(learningClassId);
    const uId = toInt(userId);
    const activity = String(activityType || '').trim();
    if (!classId || !uId || !activity) return null;
    const [result] = await pool.execute(
      `INSERT INTO challenge_workouts
       (learning_class_id, team_id, user_id, activity_type, distance_value, duration_minutes, calories_burned, points, workout_notes, screenshot_file_path, completed_at, strava_activity_id, weekly_task_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        classId,
        teamId ? toInt(teamId) : null,
        uId,
        activity,
        distanceValue != null ? Number(distanceValue) : null,
        durationMinutes != null ? toInt(durationMinutes) : null,
        caloriesBurned != null ? toInt(caloriesBurned) : null,
        toInt(points) || 0,
        workoutNotes ? String(workoutNotes).trim() : null,
        screenshotFilePath ? String(screenshotFilePath).trim() : null,
        completedAt || null,
        stravaActivityId ? toInt(stravaActivityId) : null,
        weeklyTaskId ? toInt(weeklyTaskId) : null
      ]
    );
    return this.findById(result.insertId);
  }

  static async getLeaderboardIndividual(learningClassId, { limit = 50 } = {}) {
    const classId = toInt(learningClassId);
    if (!classId) return [];
    const [rows] = await pool.execute(
      `SELECT w.user_id, u.first_name, u.last_name, SUM(w.points) AS total_points
       FROM challenge_workouts w
       INNER JOIN users u ON u.id = w.user_id
       WHERE w.learning_class_id = ?
       GROUP BY w.user_id, u.first_name, u.last_name
       ORDER BY total_points DESC
       LIMIT ?`,
      [classId, limit]
    );
    return rows || [];
  }

  static async getLeaderboardTeam(learningClassId, { limit = 50 } = {}) {
    const classId = toInt(learningClassId);
    if (!classId) return [];
    const [rows] = await pool.execute(
      `SELECT w.team_id, t.team_name, SUM(w.points) AS total_points
       FROM challenge_workouts w
       INNER JOIN challenge_teams t ON t.id = w.team_id
       WHERE w.learning_class_id = ? AND w.team_id IS NOT NULL
       GROUP BY w.team_id, t.team_name
       ORDER BY total_points DESC
       LIMIT ?`,
      [classId, limit]
    );
    return rows || [];
  }

  static async getWeeklyLeaderboard(learningClassId, weekStart, { limit = 50, weekCutoffTime = '00:00' } = {}) {
    const classId = toInt(learningClassId);
    if (!classId) return [];
    const range = this._weeklyRange(weekStart, weekCutoffTime);
    if (!range) return [];
    const [rows] = await pool.execute(
      `SELECT w.user_id, u.first_name, u.last_name, w.team_id, t.team_name, SUM(w.points) AS total_points
       FROM challenge_workouts w
       INNER JOIN users u ON u.id = w.user_id
       LEFT JOIN challenge_teams t ON t.id = w.team_id
       WHERE w.learning_class_id = ?
         AND w.completed_at >= ? AND w.completed_at < ?
       GROUP BY w.user_id, u.first_name, u.last_name, w.team_id, t.team_name
       ORDER BY total_points DESC
       LIMIT ?`,
      [classId, range.start, range.end, limit]
    );
    return rows || [];
  }

  static async getWeeklyTeamLeaderboard(learningClassId, weekStart, { limit = 50, weekCutoffTime = '00:00' } = {}) {
    const classId = toInt(learningClassId);
    if (!classId) return [];
    const range = this._weeklyRange(weekStart, weekCutoffTime);
    if (!range) return [];
    const [rows] = await pool.execute(
      `SELECT w.team_id, t.team_name, SUM(w.points) AS total_points
       FROM challenge_workouts w
       INNER JOIN challenge_teams t ON t.id = w.team_id
       WHERE w.learning_class_id = ? AND w.team_id IS NOT NULL
         AND w.completed_at >= ? AND w.completed_at < ?
       GROUP BY w.team_id, t.team_name
       ORDER BY total_points DESC
       LIMIT ?`,
      [classId, range.start, range.end, limit]
    );
    return rows || [];
  }

  static async getWeeklyTopPerTeam(learningClassId, weekStart, { weekCutoffTime = '00:00' } = {}) {
    const classId = toInt(learningClassId);
    if (!classId) return [];
    const range = this._weeklyRange(weekStart, weekCutoffTime);
    if (!range) return [];
    const [rows] = await pool.execute(
      `SELECT w.user_id, u.first_name, u.last_name, w.team_id, t.team_name, SUM(w.points) AS total_points
       FROM challenge_workouts w
       INNER JOIN users u ON u.id = w.user_id
       INNER JOIN challenge_teams t ON t.id = w.team_id
       WHERE w.learning_class_id = ?
         AND w.completed_at >= ? AND w.completed_at < ?
       GROUP BY w.team_id, w.user_id, u.first_name, u.last_name, t.team_name
       ORDER BY w.team_id, total_points DESC`,
      [classId, range.start, range.end]
    );
    const byTeam = {};
    for (const r of rows || []) {
      const tid = r.team_id;
      if (!byTeam[tid]) byTeam[tid] = r;
    }
    return Object.values(byTeam);
  }

  static async getWeeklyPointsForUser(learningClassId, userId, weekStartDate, { weekCutoffTime = '00:00' } = {}) {
    const classId = toInt(learningClassId);
    const uId = toInt(userId);
    if (!classId || !uId) return 0;
    const range = this._weeklyRange(weekStartDate, weekCutoffTime);
    if (!range) return 0;
    const [rows] = await pool.execute(
      `SELECT COALESCE(SUM(w.points), 0) AS total FROM challenge_workouts w
       WHERE w.learning_class_id = ? AND w.user_id = ?
         AND w.completed_at >= ? AND w.completed_at < ?`,
      [classId, uId, range.start, range.end]
    );
    return Number(rows?.[0]?.total || 0);
  }

  /** Weekly leaderboard filtered by gender. Returns top 1 per gender by points. */
  static async getWeeklyLeaderByGender(learningClassId, weekStart, { gender, weekCutoffTime = '00:00' } = {}) {
    const classId = toInt(learningClassId);
    if (!classId) return null;
    const range = this._weeklyRange(weekStart, weekCutoffTime);
    if (!range) return null;
    const [rows] = await pool.execute(
      `SELECT w.user_id, u.first_name, u.last_name, w.team_id, t.team_name, SUM(w.points) AS total_points, p.gender
       FROM challenge_workouts w
       INNER JOIN users u ON u.id = w.user_id
       LEFT JOIN challenge_teams t ON t.id = w.team_id
       LEFT JOIN challenge_participant_profiles p ON p.learning_class_id = w.learning_class_id AND p.provider_user_id = w.user_id
       WHERE w.learning_class_id = ? AND w.completed_at >= ? AND w.completed_at < ?
         AND p.gender = ?
       GROUP BY w.user_id, u.first_name, u.last_name, w.team_id, t.team_name, p.gender
       ORDER BY total_points DESC
       LIMIT 1`,
      [classId, range.start, range.end, String(gender || '').toLowerCase()]
    );
    return rows?.[0] || null;
  }

  /** Weekly leader among Master's (age >= threshold). Filter by gender if provided. */
  static async getWeeklyMastersLeader(learningClassId, weekStart, { gender = null, ageThreshold = 53, referenceDate = null, weekCutoffTime = '00:00' } = {}) {
    const classId = toInt(learningClassId);
    if (!classId) return null;
    const range = this._weeklyRange(weekStart, weekCutoffTime);
    if (!range) return null;
    const refDate = referenceDate || String(weekStart).slice(0, 10);
    const threshold = toInt(ageThreshold) ?? 53;
    let sql = `SELECT w.user_id, u.first_name, u.last_name, w.team_id, t.team_name, SUM(w.points) AS total_points, p.gender, p.date_of_birth
       FROM challenge_workouts w
       INNER JOIN users u ON u.id = w.user_id
       LEFT JOIN challenge_teams t ON t.id = w.team_id
       INNER JOIN challenge_participant_profiles p ON p.learning_class_id = w.learning_class_id AND p.provider_user_id = w.user_id
       WHERE w.learning_class_id = ? AND w.completed_at >= ? AND w.completed_at < ?
         AND p.date_of_birth IS NOT NULL
         AND TIMESTAMPDIFF(YEAR, p.date_of_birth, ?) >= ?`;
    const params = [classId, range.start, range.end, refDate, threshold];
    if (gender) {
      sql += ` AND p.gender = ?`;
      params.push(String(gender).toLowerCase());
    }
    sql += ` GROUP BY w.user_id, u.first_name, u.last_name, w.team_id, t.team_name, p.gender, p.date_of_birth
       ORDER BY total_points DESC
       LIMIT 1`;
    const [rows] = await pool.execute(sql, params);
    return rows?.[0] || null;
  }

  static async getWeeklyPointsForTeam(learningClassId, teamId, weekStartDate, { weekCutoffTime = '00:00' } = {}) {
    const classId = toInt(learningClassId);
    const tId = toInt(teamId);
    if (!classId || !tId) return 0;
    const range = this._weeklyRange(weekStartDate, weekCutoffTime);
    if (!range) return 0;
    const [rows] = await pool.execute(
      `SELECT COALESCE(SUM(w.points), 0) AS total FROM challenge_workouts w
       WHERE w.learning_class_id = ? AND w.team_id = ?
         AND w.completed_at >= ? AND w.completed_at < ?`,
      [classId, tId, range.start, range.end]
    );
    return Number(rows?.[0]?.total || 0);
  }
}

export default ChallengeWorkout;
