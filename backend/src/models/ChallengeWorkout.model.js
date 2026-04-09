/**
 * ChallengeWorkout model
 * Workout submissions for the Summit Stats Team Challenge.
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
  static _qualifiedClause(alias = 'w') {
    return `(${alias}.is_disqualified IS NULL OR ${alias}.is_disqualified = 0)`
      + ` AND (${alias}.proof_status IS NULL OR ${alias}.proof_status IN ('not_required', 'approved'))`;
  }
  static _weeklyRange(weekStart, weekCutoffTime = '00:00', weekTimeZone = null) {
    const week = String(weekStart || '').slice(0, 10);
    if (!week) return null;
    return getWeekDateTimeRange(week, weekCutoffTime || '00:00', weekTimeZone);
  }
  static async findById(id) {
    const workoutId = toInt(id);
    if (!workoutId) return null;
    const [rows] = await pool.execute(
      `SELECT w.*, u.first_name, u.last_name, u.profile_photo_path
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
    // Inline LIMIT/OFFSET: mysql2 prepared statements reject numeric ? for LIMIT/OFFSET (ER_WRONG_ARGUMENTS)
    const lim = Math.min(Math.max(toInt(limit) || 50, 1), 500);
    const off = Math.max(toInt(offset) || 0, 0);
    const [rows] = await pool.execute(
      `SELECT w.*, u.first_name, u.last_name, u.profile_photo_path, t.team_name, wt.name AS weekly_task_name
       FROM challenge_workouts w
       INNER JOIN users u ON u.id = w.user_id
       LEFT JOIN challenge_teams t ON t.id = w.team_id
       LEFT JOIN challenge_weekly_tasks wt ON wt.id = w.weekly_task_id
       WHERE w.learning_class_id = ?
       ORDER BY w.completed_at DESC, w.created_at DESC
       LIMIT ${lim} OFFSET ${off}`,
      [classId]
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
    isTreadmill = false,
    isRace = false,
    raceDistanceMiles = null,
    raceChipTimeSeconds = null,
    raceOverallPlace = null,
    terrain = null,
    distanceValue = null,
    reportedDistanceValue = null,
    verifiedDistanceValue = null,
    durationMinutes = null,
    durationSeconds = null,
    caloriesBurned = null,
    elevationGainMeters = null,
    averageHeartrate = null,
    points = 0,
    workoutNotes = null,
    screenshotFilePath = null,
    mapSummaryPolyline = null,
    completedAt = null,
    stravaActivityId = null,
    weeklyTaskId = null,
    proofStatus = 'not_required',
    proofReviewNote = null,
    proofReviewedByUserId = null,
    proofReviewedAt = null,
    maxHeartrate = null,
    splitsJson = null
  }) {
    const classId = toInt(learningClassId);
    const uId = toInt(userId);
    const activity = String(activityType || '').trim();
    if (!classId || !uId || !activity) return null;
    const durSec = durationSeconds != null ? Math.min(59, Math.max(0, toInt(durationSeconds) || 0)) : null;
    const [result] = await pool.execute(
      `INSERT INTO challenge_workouts
       (learning_class_id, team_id, user_id, activity_type, is_treadmill, is_race, race_distance_miles, race_chip_time_seconds, race_overall_place, terrain, distance_value, reported_distance_value, verified_distance_value, duration_minutes, duration_seconds, calories_burned, elevation_gain_meters, average_heartrate, max_heartrate, splits_json, points, workout_notes, screenshot_file_path, map_summary_polyline, completed_at, strava_activity_id, weekly_task_id, proof_status, proof_review_note, proof_reviewed_by_user_id, proof_reviewed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        classId,
        teamId ? toInt(teamId) : null,
        uId,
        activity,
        isTreadmill ? 1 : 0,
        isRace ? 1 : 0,
        raceDistanceMiles != null ? Number(raceDistanceMiles) : null,
        raceChipTimeSeconds != null ? toInt(raceChipTimeSeconds) : null,
        raceOverallPlace != null ? toInt(raceOverallPlace) : null,
        terrain ? String(terrain).trim() : null,
        distanceValue != null ? Number(distanceValue) : null,
        reportedDistanceValue != null ? Number(reportedDistanceValue) : null,
        verifiedDistanceValue != null ? Number(verifiedDistanceValue) : null,
        durationMinutes != null ? toInt(durationMinutes) : null,
        durSec,
        caloriesBurned != null ? toInt(caloriesBurned) : null,
        elevationGainMeters != null ? Number(elevationGainMeters) : null,
        averageHeartrate != null ? Number(averageHeartrate) : null,
        maxHeartrate != null ? Math.round(Number(maxHeartrate)) : null,
        splitsJson ? JSON.stringify(splitsJson) : null,
        Math.round((Number(points) || 0) * 100) / 100,
        workoutNotes ? String(workoutNotes).trim() : null,
        screenshotFilePath ? String(screenshotFilePath).trim() : null,
        mapSummaryPolyline ? String(mapSummaryPolyline) : null,
        completedAt || null,
        stravaActivityId ? toInt(stravaActivityId) : null,
        weeklyTaskId ? toInt(weeklyTaskId) : null,
        String(proofStatus || 'not_required'),
        proofReviewNote ? String(proofReviewNote).slice(0, 255) : null,
        proofReviewedByUserId ? toInt(proofReviewedByUserId) : null,
        proofReviewedAt || null
      ]
    );
    return this.findById(result.insertId);
  }

  static async updateProofReview(workoutId, patch = {}) {
    const id = toInt(workoutId);
    if (!id) return null;
    const parts = [];
    const values = [];
    if (patch.proofStatus !== undefined) { parts.push('proof_status = ?'); values.push(String(patch.proofStatus)); }
    if (patch.verifiedDistanceValue !== undefined) { parts.push('verified_distance_value = ?'); values.push(patch.verifiedDistanceValue != null ? Number(patch.verifiedDistanceValue) : null); }
    if (patch.distanceValue !== undefined) { parts.push('distance_value = ?'); values.push(patch.distanceValue != null ? Number(patch.distanceValue) : null); }
    if (patch.points !== undefined) { parts.push('points = ?'); values.push(patch.points != null ? Number(patch.points) : null); }
    if (patch.proofReviewNote !== undefined) { parts.push('proof_review_note = ?'); values.push(patch.proofReviewNote ? String(patch.proofReviewNote).slice(0, 255) : null); }
    if (patch.proofReviewedByUserId !== undefined) { parts.push('proof_reviewed_by_user_id = ?'); values.push(patch.proofReviewedByUserId ? toInt(patch.proofReviewedByUserId) : null); }
    if (patch.proofReviewedAt !== undefined) { parts.push('proof_reviewed_at = ?'); values.push(patch.proofReviewedAt || null); }
    if (patch.managerEdited !== undefined) { parts.push('manager_edited = ?'); values.push(patch.managerEdited ? 1 : 0); }
    if (!parts.length) return this.findById(id);
    values.push(id);
    await pool.execute(`UPDATE challenge_workouts SET ${parts.join(', ')} WHERE id = ?`, values);
    return this.findById(id);
  }

  static async updateDisqualification(workoutId, patch = {}) {
    const id = toInt(workoutId);
    if (!id) return null;
    const disq = patch.isDisqualified === true;
    await pool.execute(
      `UPDATE challenge_workouts
       SET is_disqualified = ?,
           disqualification_reason = ?,
           disqualified_by_user_id = ?,
           disqualified_at = ?
       WHERE id = ?`,
      [
        disq ? 1 : 0,
        disq ? (patch.reason ? String(patch.reason).slice(0, 255) : null) : null,
        disq ? (patch.byUserId ? toInt(patch.byUserId) : null) : null,
        disq ? (patch.at || null) : null,
        id
      ]
    );
    return this.findById(id);
  }

  static async getLeaderboardIndividual(learningClassId, { limit = 50 } = {}) {
    const classId = toInt(learningClassId);
    if (!classId) return [];
    const lim = Math.min(Math.max(toInt(limit) || 50, 1), 500);
    const [rows] = await pool.execute(
      `SELECT w.user_id, u.first_name, u.last_name, u.profile_photo_path, SUM(w.points) AS total_points
       FROM challenge_workouts w
       INNER JOIN users u ON u.id = w.user_id
       WHERE w.learning_class_id = ? AND ${this._qualifiedClause('w')}
       GROUP BY w.user_id, u.first_name, u.last_name, u.profile_photo_path
       ORDER BY total_points DESC
       LIMIT ${lim}`,
      [classId]
    );
    return rows || [];
  }

  static async getLeaderboardTeam(learningClassId, { limit = 50 } = {}) {
    const classId = toInt(learningClassId);
    if (!classId) return [];
    const lim = Math.min(Math.max(toInt(limit) || 50, 1), 500);
    const [rows] = await pool.execute(
      `SELECT w.team_id, t.team_name, SUM(w.points) AS total_points
       FROM challenge_workouts w
       INNER JOIN challenge_teams t ON t.id = w.team_id
       WHERE w.learning_class_id = ? AND w.team_id IS NOT NULL AND ${this._qualifiedClause('w')}
       GROUP BY w.team_id, t.team_name
       ORDER BY total_points DESC
       LIMIT ${lim}`,
      [classId]
    );
    return rows || [];
  }

  static async getWeeklyLeaderboard(learningClassId, weekStart, { limit = 50, weekCutoffTime = '00:00', weekTimeZone = null } = {}) {
    const classId = toInt(learningClassId);
    if (!classId) return [];
    const range = this._weeklyRange(weekStart, weekCutoffTime, weekTimeZone);
    if (!range) return [];
    const lim = Math.min(Math.max(toInt(limit) || 50, 1), 500);
    const [rows] = await pool.execute(
      `SELECT w.user_id, u.first_name, u.last_name, u.profile_photo_path, w.team_id, t.team_name, SUM(w.points) AS total_points
       FROM challenge_workouts w
       INNER JOIN users u ON u.id = w.user_id
       LEFT JOIN challenge_teams t ON t.id = w.team_id
       WHERE w.learning_class_id = ? AND ${this._qualifiedClause('w')}
         AND w.completed_at >= ? AND w.completed_at < ?
       GROUP BY w.user_id, u.first_name, u.last_name, u.profile_photo_path, w.team_id, t.team_name
       ORDER BY total_points DESC
       LIMIT ${lim}`,
      [classId, range.start, range.end]
    );
    return rows || [];
  }

  static async getWeeklyTeamLeaderboard(learningClassId, weekStart, { limit = 50, weekCutoffTime = '00:00', weekTimeZone = null } = {}) {
    const classId = toInt(learningClassId);
    if (!classId) return [];
    const range = this._weeklyRange(weekStart, weekCutoffTime, weekTimeZone);
    if (!range) return [];
    const lim = Math.min(Math.max(toInt(limit) || 50, 1), 500);
    const [rows] = await pool.execute(
      `SELECT w.team_id, t.team_name, SUM(w.points) AS total_points
       FROM challenge_workouts w
       INNER JOIN challenge_teams t ON t.id = w.team_id
       WHERE w.learning_class_id = ? AND w.team_id IS NOT NULL AND ${this._qualifiedClause('w')}
         AND w.completed_at >= ? AND w.completed_at < ?
       GROUP BY w.team_id, t.team_name
       ORDER BY total_points DESC
       LIMIT ${lim}`,
      [classId, range.start, range.end]
    );
    return rows || [];
  }

  static async getWeeklyTopPerTeam(learningClassId, weekStart, { weekCutoffTime = '00:00', weekTimeZone = null } = {}) {
    const classId = toInt(learningClassId);
    if (!classId) return [];
    const range = this._weeklyRange(weekStart, weekCutoffTime, weekTimeZone);
    if (!range) return [];
    const [rows] = await pool.execute(
      `SELECT w.user_id, u.first_name, u.last_name, u.profile_photo_path, w.team_id, t.team_name, SUM(w.points) AS total_points
       FROM challenge_workouts w
       INNER JOIN users u ON u.id = w.user_id
       INNER JOIN challenge_teams t ON t.id = w.team_id
       WHERE w.learning_class_id = ? AND ${this._qualifiedClause('w')}
         AND w.completed_at >= ? AND w.completed_at < ?
       GROUP BY w.team_id, w.user_id, u.first_name, u.last_name, u.profile_photo_path, t.team_name
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

  static async getWeeklyPointsForUser(learningClassId, userId, weekStartDate, { weekCutoffTime = '00:00', weekTimeZone = null } = {}) {
    const classId = toInt(learningClassId);
    const uId = toInt(userId);
    if (!classId || !uId) return 0;
    const range = this._weeklyRange(weekStartDate, weekCutoffTime, weekTimeZone);
    if (!range) return 0;
    const [rows] = await pool.execute(
      `SELECT COALESCE(SUM(w.points), 0) AS total FROM challenge_workouts w
       WHERE w.learning_class_id = ? AND w.user_id = ? AND ${this._qualifiedClause('w')}
         AND w.completed_at >= ? AND w.completed_at < ?`,
      [classId, uId, range.start, range.end]
    );
    return Number(rows?.[0]?.total || 0);
  }

  /** Weekly leaderboard filtered by gender. Returns top 1 per gender by points. */
  static async getWeeklyLeaderByGender(learningClassId, weekStart, { gender, weekCutoffTime = '00:00', weekTimeZone = null } = {}) {
    const classId = toInt(learningClassId);
    if (!classId) return null;
    const range = this._weeklyRange(weekStart, weekCutoffTime, weekTimeZone);
    if (!range) return null;
    const [rows] = await pool.execute(
      `SELECT w.user_id, u.first_name, u.last_name, w.team_id, t.team_name, SUM(w.points) AS total_points, p.gender
       FROM challenge_workouts w
       INNER JOIN users u ON u.id = w.user_id
       LEFT JOIN challenge_teams t ON t.id = w.team_id
       LEFT JOIN challenge_participant_profiles p ON p.learning_class_id = w.learning_class_id AND p.provider_user_id = w.user_id
       WHERE w.learning_class_id = ? AND ${this._qualifiedClause('w')} AND w.completed_at >= ? AND w.completed_at < ?
         AND p.gender = ?
       GROUP BY w.user_id, u.first_name, u.last_name, w.team_id, t.team_name, p.gender
       ORDER BY total_points DESC
       LIMIT 1`,
      [classId, range.start, range.end, String(gender || '').toLowerCase()]
    );
    return rows?.[0] || null;
  }

  /** Weekly leader among Master's (age >= threshold). Filter by gender if provided. */
  static async getWeeklyMastersLeader(learningClassId, weekStart, { gender = null, ageThreshold = 53, referenceDate = null, weekCutoffTime = '00:00', weekTimeZone = null } = {}) {
    const classId = toInt(learningClassId);
    if (!classId) return null;
    const range = this._weeklyRange(weekStart, weekCutoffTime, weekTimeZone);
    if (!range) return null;
    const refDate = referenceDate || String(weekStart).slice(0, 10);
    const threshold = toInt(ageThreshold) ?? 53;
    let sql = `SELECT w.user_id, u.first_name, u.last_name, w.team_id, t.team_name, SUM(w.points) AS total_points, p.gender, p.date_of_birth
       FROM challenge_workouts w
       INNER JOIN users u ON u.id = w.user_id
       LEFT JOIN challenge_teams t ON t.id = w.team_id
       INNER JOIN challenge_participant_profiles p ON p.learning_class_id = w.learning_class_id AND p.provider_user_id = w.user_id
       WHERE w.learning_class_id = ? AND ${this._qualifiedClause('w')} AND w.completed_at >= ? AND w.completed_at < ?
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

  static async getWeeklyPointsForTeam(learningClassId, teamId, weekStartDate, { weekCutoffTime = '00:00', weekTimeZone = null } = {}) {
    const classId = toInt(learningClassId);
    const tId = toInt(teamId);
    if (!classId || !tId) return 0;
    const range = this._weeklyRange(weekStartDate, weekCutoffTime, weekTimeZone);
    if (!range) return 0;
    const [rows] = await pool.execute(
      `SELECT COALESCE(SUM(w.points), 0) AS total FROM challenge_workouts w
       WHERE w.learning_class_id = ? AND w.team_id = ? AND ${this._qualifiedClause('w')}
         AND w.completed_at >= ? AND w.completed_at < ?`,
      [classId, tId, range.start, range.end]
    );
    return Number(rows?.[0]?.total || 0);
  }

  /**
   * Generic recognition winner computation.
   *
   * @param {number} learningClassId
   * @param {object} cat  - rich category object from recognition_categories_json
   * @param {string} weekStart - YYYY-MM-DD
   * @param {object} classRow - full DB row for the class (needs starts_at, ends_at, week_cutoff_time, week_time_zone)
   * @returns {Array<{categoryId, label, period, metric, winner}>} – one entry per gender variant (or one if no variants)
   */
  static async computeRecognitionWinner(learningClassId, cat, weekStart, classRow = {}) {
    const classId = toInt(learningClassId);
    if (!classId || !cat?.active) return [];

    const weekCutoffTime = classRow.week_cutoff_time || classRow.weekCutoffTime || '00:00';
    const weekTimeZone = classRow.week_time_zone || classRow.weekTimeZone || null;
    const period = cat.period || 'weekly';
    const metric = cat.metric || 'points';
    const aggregation = cat.aggregation || 'most';

    // Determine time range
    let rangeStart, rangeEnd;
    if (period === 'weekly') {
      const range = this._weeklyRange(weekStart, weekCutoffTime, weekTimeZone);
      if (!range) return [];
      rangeStart = range.start;
      rangeEnd = range.end;
    } else if (period === 'monthly') {
      const d = new Date(weekStart);
      const y = d.getFullYear();
      const mo = d.getMonth();
      rangeStart = new Date(y, mo, 1).toISOString().slice(0, 19).replace('T', ' ');
      rangeEnd = new Date(y, mo + 1, 1).toISOString().slice(0, 19).replace('T', ' ');
    } else {
      // season
      const sa = classRow.starts_at || classRow.startsAt;
      const ea = classRow.ends_at || classRow.endsAt;
      rangeStart = sa ? new Date(sa).toISOString().slice(0, 19).replace('T', ' ') : '2000-01-01 00:00:00';
      rangeEnd = ea ? new Date(ea).toISOString().slice(0, 19).replace('T', ' ') : new Date().toISOString().slice(0, 19).replace('T', ' ');
    }

    // Metric expression — varies by aggregation mode
    // best_day uses a nested subquery (built below), so metricExpr is only
    // used for the other aggregation modes.
    // Kudos-received metric: uses challenge_workout_kudos, not challenge_workouts.
    // Handled by a dedicated branch below.
    if (metric === 'kudos_received') {
      const params = [classId];
      let dateFilter = '';
      if (period === 'weekly') {
        dateFilter = ' AND k.week_start_date = ?';
        params.push(weekStart);
      } else if (period !== 'season') {
        // monthly — approximate via given_at
        const d = new Date(weekStart);
        const y = d.getFullYear();
        const mo = d.getMonth();
        const monthStart = new Date(y, mo, 1).toISOString().slice(0, 10);
        const monthEnd = new Date(y, mo + 1, 1).toISOString().slice(0, 10);
        dateFilter = ' AND DATE(k.given_at) >= ? AND DATE(k.given_at) < ?';
        params.push(monthStart, monthEnd);
      }
      const [rows] = await pool.execute(
        `SELECT k.receiver_user_id AS user_id,
                u.first_name, u.last_name, u.profile_photo_path,
                t.team_name,
                COUNT(*) AS metric_value
         FROM challenge_workout_kudos k
         INNER JOIN users u ON u.id = k.receiver_user_id
         LEFT JOIN challenge_team_members tm ON tm.provider_user_id = k.receiver_user_id
         LEFT JOIN challenge_teams t ON t.id = tm.team_id AND t.learning_class_id = k.learning_class_id
         WHERE k.learning_class_id = ?${dateFilter}
         GROUP BY k.receiver_user_id, u.first_name, u.last_name, u.profile_photo_path, t.team_name
         ORDER BY metric_value DESC
         LIMIT 1`,
        params
      );
      const row = rows?.[0] || null;
      return [{
        categoryId: cat.id,
        label: cat.label,
        icon: cat.icon || null,
        period,
        metric,
        aggregation: 'most',
        referenceTarget: null,
        winner: row ? {
          user_id: row.user_id,
          first_name: row.first_name,
          last_name: row.last_name,
          profile_photo_path: row.profile_photo_path || null,
          team_name: row.team_name,
          value: Number(row.metric_value)
        } : null
      }];
    }

    const metricColMap = {
      points:           'w.points',
      distance_miles:   'w.distance_value',
      duration_minutes: 'w.duration_minutes',
      activities_count: null  // special: COUNT
    };
    const metricCol = metricColMap[metric] ?? 'w.points';

    function buildMetricExpr(agg) {
      if (metric === 'activities_count') return 'COUNT(w.id)';
      switch (agg) {
        case 'average':     return `AVG(${metricCol})`;
        case 'best_single': return `MAX(${metricCol})`;
        case 'milestone':   return `SUM(${metricCol})`; // period total vs threshold
        default:            return `SUM(${metricCol})`;  // most, least
      }
    }
    const metricExpr = buildMetricExpr(aggregation === 'milestone' ? 'milestone' : aggregation);

    // Determine which gender labels to iterate over
    const genderVariants = Array.isArray(cat.genderVariants) && cat.genderVariants.length > 0
      ? cat.genderVariants
      : (cat.genderFilter ? [cat.genderFilter] : [null]);

    const results = [];

    // Resolve the group filter for 'award' type from classRow config entries if available
    const allCats = Array.isArray(classRow._allCategories) ? classRow._allCategories : [];
    const cfgMasters     = allCats.find(c => c.type === 'cfg_masters');
    const cfgHeavyweight = allCats.find(c => c.type === 'cfg_heavyweight');

    for (const genderLabel of genderVariants) {
      const params = [classId, rangeStart, rangeEnd];
      let joinClause = `LEFT JOIN challenge_participant_profiles p ON p.learning_class_id = w.learning_class_id AND p.provider_user_id = w.user_id`;
      let whereExtra = '';

      // ── Resolve eligibility filter by type or groupFilter ───────
      const resolvedType = cat.type === 'award' ? 'award' : cat.type;

      if (resolvedType === 'standard') {
        if (genderLabel) {
          joinClause = `INNER JOIN challenge_participant_profiles p ON p.learning_class_id = w.learning_class_id AND p.provider_user_id = w.user_id`;
          whereExtra += ` AND p.gender = ?`;
          params.push(String(genderLabel).toLowerCase());
        }
      } else if (resolvedType === 'masters') {
        const threshold = cat.ageThreshold ?? 53;
        const refDate = String(weekStart).slice(0, 10);
        joinClause = `INNER JOIN challenge_participant_profiles p ON p.learning_class_id = w.learning_class_id AND p.provider_user_id = w.user_id`;
        whereExtra += ` AND p.date_of_birth IS NOT NULL AND TIMESTAMPDIFF(YEAR, p.date_of_birth, ?) >= ?`;
        params.push(refDate, threshold);
        if (genderLabel) {
          whereExtra += ` AND p.gender = ?`;
          params.push(String(genderLabel).toLowerCase());
        }
      } else if (resolvedType === 'heavyweight') {
        const weightThreshold = cat.weightThresholdLbs ?? 200;
        joinClause = `INNER JOIN challenge_participant_profiles p ON p.learning_class_id = w.learning_class_id AND p.provider_user_id = w.user_id`;
        if (cat.weightOperator === 'lte') {
          whereExtra += ` AND p.weight_lbs IS NOT NULL AND p.weight_lbs <= ?`;
        } else {
          whereExtra += ` AND p.weight_lbs IS NOT NULL AND p.weight_lbs >= ?`;
        }
        params.push(weightThreshold);
        if (genderLabel) {
          whereExtra += ` AND p.gender = ?`;
          params.push(String(genderLabel).toLowerCase());
        }
      } else if (resolvedType === 'award') {
        // New flexible award type: apply groupFilter + optional criteria
        const gf = String(cat.groupFilter || '');
        if (gf === 'masters') {
          const threshold = cfgMasters?.ageThreshold ?? cat.ageThreshold ?? 53;
          const refDate = String(weekStart).slice(0, 10);
          joinClause = `INNER JOIN challenge_participant_profiles p ON p.learning_class_id = w.learning_class_id AND p.provider_user_id = w.user_id`;
          whereExtra += ` AND p.date_of_birth IS NOT NULL AND TIMESTAMPDIFF(YEAR, p.date_of_birth, ?) >= ?`;
          params.push(refDate, threshold);
        } else if (gf === 'heavyweight_male' || gf === 'heavyweight_female') {
          const isMale = gf === 'heavyweight_male';
          const weight = isMale ? (cfgHeavyweight?.maleWeight ?? 200) : (cfgHeavyweight?.femaleWeight ?? 165);
          const gender = isMale ? 'male' : 'female';
          joinClause = `INNER JOIN challenge_participant_profiles p ON p.learning_class_id = w.learning_class_id AND p.provider_user_id = w.user_id`;
          whereExtra += ` AND p.weight_lbs IS NOT NULL AND p.weight_lbs >= ? AND p.gender = ?`;
          params.push(weight, gender);
        } else if (gf === 'gender_male' || gf === 'gender_female') {
          // Gender-based eligible group
          const gender = gf === 'gender_male' ? 'male' : 'female';
          joinClause = `INNER JOIN challenge_participant_profiles p ON p.learning_class_id = w.learning_class_id AND p.provider_user_id = w.user_id`;
          whereExtra += ` AND p.gender = ?`;
          params.push(gender);
        } else if (gf.startsWith('group_')) {
          // Custom eligibility group — look up its criteria
          const group = allCats.find(c => c.id === gf && c.type === 'group');
          if (group && Array.isArray(group.criteria) && group.criteria.length > 0) {
            joinClause = `INNER JOIN challenge_participant_profiles p ON p.learning_class_id = w.learning_class_id AND p.provider_user_id = w.user_id`;
            for (const crit of group.criteria) {
              const op = crit.operator === 'lte' ? '<=' : '>=';
              const val = Number(crit.value);
              if (!Number.isFinite(val)) continue;
              if (crit.field === 'age') {
                whereExtra += ` AND p.date_of_birth IS NOT NULL AND TIMESTAMPDIFF(YEAR, p.date_of_birth, ?) ${op} ?`;
                params.push(String(weekStart).slice(0, 10), val);
              } else if (crit.field === 'weight_lbs') {
                whereExtra += ` AND p.weight_lbs IS NOT NULL AND p.weight_lbs ${op} ?`;
                params.push(val);
              } else if (crit.field === 'height_inches') {
                whereExtra += ` AND p.height_inches IS NOT NULL AND p.height_inches ${op} ?`;
                params.push(val);
              } else if (String(crit.field).startsWith('custom_')) {
                const fid = toInt(crit.field.replace(/^custom_/, ''));
                if (!fid) continue;
                const alias = `cfv_${fid}`;
                joinClause += ` LEFT JOIN challenge_custom_field_values ${alias} ON ${alias}.user_id = w.user_id AND ${alias}.field_definition_id = ${fid} AND (${alias}.learning_class_id = w.learning_class_id OR ${alias}.learning_class_id IS NULL)`;
                whereExtra += ` AND ${alias}.value_number IS NOT NULL AND ${alias}.value_number ${op} ?`;
                params.push(val);
              }
            }
          }
        }
        // Gender variant filter for awards
        if (genderLabel) {
          if (!joinClause.includes('INNER JOIN challenge_participant_profiles')) {
            joinClause = `INNER JOIN challenge_participant_profiles p ON p.learning_class_id = w.learning_class_id AND p.provider_user_id = w.user_id`;
          }
          whereExtra += ` AND p.gender = ?`;
          params.push(String(genderLabel).toLowerCase());
        }
      } else if (resolvedType === 'custom') {
        // Legacy custom with criteria
        if (Array.isArray(cat.criteria) && cat.criteria.length > 0) {
          joinClause = `INNER JOIN challenge_participant_profiles p ON p.learning_class_id = w.learning_class_id AND p.provider_user_id = w.user_id`;
          let needsProfile = false;
          for (const crit of cat.criteria) {
            const op = crit.operator === 'lte' ? '<=' : '>=';
            const val = Number(crit.value);
            if (!Number.isFinite(val)) continue;
            if (crit.field === 'age') {
              needsProfile = true;
              whereExtra += ` AND p.date_of_birth IS NOT NULL AND TIMESTAMPDIFF(YEAR, p.date_of_birth, ?) ${op} ?`;
              params.push(String(weekStart).slice(0, 10), val);
            } else if (crit.field === 'weight_lbs') {
              needsProfile = true;
              whereExtra += ` AND p.weight_lbs IS NOT NULL AND p.weight_lbs ${op} ?`;
              params.push(val);
            } else if (crit.field === 'height_inches') {
              needsProfile = true;
              whereExtra += ` AND p.height_inches IS NOT NULL AND p.height_inches ${op} ?`;
              params.push(val);
            } else if (String(crit.field).startsWith('custom_')) {
              const fieldDefId = toInt(crit.field.replace(/^custom_/, ''));
              if (!fieldDefId) continue;
              const alias = `cfv_${fieldDefId}`;
              joinClause += ` LEFT JOIN challenge_custom_field_values ${alias} ON ${alias}.user_id = w.user_id AND ${alias}.field_definition_id = ${fieldDefId} AND (${alias}.learning_class_id = w.learning_class_id OR ${alias}.learning_class_id IS NULL)`;
              whereExtra += ` AND ${alias}.value_number IS NOT NULL AND ${alias}.value_number ${op} ?`;
              params.push(val);
            }
          }
          if (!needsProfile) {
            joinClause = `LEFT JOIN challenge_participant_profiles p ON p.learning_class_id = w.learning_class_id AND p.provider_user_id = w.user_id`;
          }
        }
        if (genderLabel) {
          whereExtra += ` AND p.gender = ?`;
          params.push(String(genderLabel).toLowerCase());
        }
      }

      // ── Activity type filter (applies to all award types) ────────
      const activityTypeFilter = String(cat.activityType || '').trim();
      if (activityTypeFilter && activityTypeFilter !== '__add__') {
        whereExtra += ` AND w.activity_type = ?`;
        params.push(activityTypeFilter);
      }

      const displayLabel = genderLabel && genderVariants.length > 1
        ? `${cat.label} (${genderLabel.charAt(0).toUpperCase() + genderLabel.slice(1)})`
        : cat.label;

      const referenceTargetOut =
        aggregation === 'milestone'
          ? null
          : (() => {
              const raw = cat.referenceTarget;
              if (raw == null || raw === '') return null;
              const n = Number(raw);
              return Number.isFinite(n) && n >= 0 ? n : null;
            })();

      // For best_day we need a two-level GROUP BY:
      // 1) sum per user+day, 2) take the max day per user.
      let sql;
      const milestoneThreshold = Number(cat.milestoneThreshold);
      if (aggregation === 'best_day') {
        const dayMetric = metric === 'activities_count' ? 'COUNT(w.id)' : `SUM(${metricCol})`;
        sql = `
          SELECT d.user_id, d.first_name, d.last_name, d.profile_photo_path, d.team_id, d.team_name,
                 MAX(d.day_total) AS metric_value
          FROM (
            SELECT w.user_id, u.first_name, u.last_name, u.profile_photo_path, w.team_id, t.team_name,
                   DATE(w.completed_at) AS activity_day,
                   ${dayMetric} AS day_total
            FROM challenge_workouts w
            INNER JOIN users u ON u.id = w.user_id
            LEFT JOIN challenge_teams t ON t.id = w.team_id
            ${joinClause}
            WHERE w.learning_class_id = ? AND ${this._qualifiedClause('w')} AND w.completed_at >= ? AND w.completed_at < ?
              ${whereExtra}
            GROUP BY w.user_id, u.first_name, u.last_name, u.profile_photo_path, w.team_id, t.team_name, DATE(w.completed_at)
          ) d
          GROUP BY d.user_id, d.first_name, d.last_name, d.profile_photo_path, d.team_id, d.team_name
          ORDER BY metric_value DESC
          LIMIT 1`;
      } else if (aggregation === 'milestone') {
        if (!Number.isFinite(milestoneThreshold) || milestoneThreshold <= 0) {
          results.push({
            categoryId: cat.id,
            label: displayLabel,
            icon: cat.icon || null,
            period,
            metric,
            aggregation,
            milestoneThreshold: null,
            referenceTarget: null,
            winner: null,
            winners: []
          });
          continue;
        }
        sql = `SELECT w.user_id, u.first_name, u.last_name, u.profile_photo_path, w.team_id, t.team_name, ${metricExpr} AS metric_value
         FROM challenge_workouts w
         INNER JOIN users u ON u.id = w.user_id
         LEFT JOIN challenge_teams t ON t.id = w.team_id
         ${joinClause}
         WHERE w.learning_class_id = ? AND ${this._qualifiedClause('w')} AND w.completed_at >= ? AND w.completed_at < ?
           ${whereExtra}
         GROUP BY w.user_id, u.first_name, u.last_name, u.profile_photo_path, w.team_id, t.team_name
         HAVING metric_value >= ?
         ORDER BY metric_value DESC`;
        params.push(milestoneThreshold);
      } else {
        sql = `SELECT w.user_id, u.first_name, u.last_name, u.profile_photo_path, w.team_id, t.team_name, ${metricExpr} AS metric_value
         FROM challenge_workouts w
         INNER JOIN users u ON u.id = w.user_id
         LEFT JOIN challenge_teams t ON t.id = w.team_id
         ${joinClause}
         WHERE w.learning_class_id = ? AND ${this._qualifiedClause('w')} AND w.completed_at >= ? AND w.completed_at < ?
           ${whereExtra}
         GROUP BY w.user_id, u.first_name, u.last_name, u.profile_photo_path, w.team_id, t.team_name
         ORDER BY metric_value ${aggregation === 'least' ? 'ASC' : 'DESC'}
         LIMIT 1`;
      }

      try {
        const [rows] = await pool.execute(sql, params);
        if (aggregation === 'milestone') {
          const winners = (rows || []).map((row) => ({
            user_id: row.user_id,
            first_name: row.first_name,
            last_name: row.last_name,
            profile_photo_path: row.profile_photo_path || null,
            team_name: row.team_name,
            value: Number(row.metric_value)
          }));
          results.push({
            categoryId: cat.id,
            label: displayLabel,
            icon: cat.icon || null,
            period,
            metric,
            aggregation,
            milestoneThreshold,
            referenceTarget: null,
            winner: null,
            winners
          });
        } else {
          const row = rows?.[0] || null;
          results.push({
            categoryId: cat.id,
            label: displayLabel,
            icon: cat.icon || null,
            period,
            metric,
            referenceTarget: referenceTargetOut,
            winner: row
              ? {
                  user_id: row.user_id,
                  first_name: row.first_name,
                  last_name: row.last_name,
                  profile_photo_path: row.profile_photo_path || null,
                  team_name: row.team_name,
                  value: Number(row.metric_value)
                }
              : null
          });
        }
      } catch (err) {
        // Don't crash the whole scoreboard if one category fails
        results.push({ categoryId: cat.id, label: displayLabel, period, metric, referenceTarget: referenceTargetOut, winner: null, error: err.message });
      }
    }

    return results;
  }
}

export default ChallengeWorkout;
