/**
 * Summit Stats Challenge controller
 * Teams, workouts, leaderboards, activity feed.
 * Challenges are learning_program_classes; UI displays as "Challenges".
 */
import pool from '../config/database.js';
import ChallengeTeam from '../models/ChallengeTeam.model.js';
import ChallengeWorkout from '../models/ChallengeWorkout.model.js';
import ChallengeWeeklyTask from '../models/ChallengeWeeklyTask.model.js';
import ChallengeWeeklyAssignment from '../models/ChallengeWeeklyAssignment.model.js';
import ChallengeCaptainApplication from '../models/ChallengeCaptainApplication.model.js';
import ChallengeMessage from '../models/ChallengeMessage.model.js';
import ChallengeWorkoutComment from '../models/ChallengeWorkoutComment.model.js';
import ChallengeWorkoutMedia from '../models/ChallengeWorkoutMedia.model.js';
import { queueClubRecordBreakCandidates } from './summitStats.controller.js';
import { canManageTeam } from '../utils/challengePermissions.js';
import { canAccessChallenge } from '../utils/challengeAccess.js';
import { ensureChallengeParticipationAgreementAccepted } from '../utils/challengeParticipationAgreement.js';
import { getWeekStartDate, getWeekDateTimeRange } from '../utils/challengeWeekUtils.js';
import { enqueueWorkoutVision } from '../services/challengeWorkoutVision.service.js';
import { challengeMessageBridge } from '../services/challengeMessageBridge.service.js';
import { canUserManageChallengeClass } from '../utils/sscClubAccess.js';

const asInt = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

const parseJsonObject = (raw, fallback = {}) => {
  if (!raw) return fallback;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      // ignore
    }
  }
  return fallback;
};

const canManageChallengeRole = (role) => {
  const r = String(role || '').toLowerCase();
  return r === 'super_admin' || r === 'admin' || r === 'support' || r === 'staff' || r === 'clinical_practice_assistant' || r === 'provider_plus';
};

const canManageChallenge = async ({ user, classId }) => {
  if (!classId) return canManageChallengeRole(user?.role);
  if (await canUserManageChallengeClass({ user, learningClassId: classId })) return true;
  return canManageChallengeRole(user?.role);
};

const isCaptainForClass = async ({ classId, userId }) => {
  const [rows] = await pool.execute(
    `SELECT 1
     FROM challenge_teams
     WHERE learning_class_id = ? AND team_manager_user_id = ?
     LIMIT 1`,
    [classId, userId]
  );
  if (rows?.length) return true;
  const [appRows] = await pool.execute(
    `SELECT 1
     FROM challenge_captain_applications
     WHERE learning_class_id = ? AND user_id = ? AND status = 'approved'
     LIMIT 1`,
    [classId, userId]
  );
  return !!appRows?.length;
};

const getWorkoutModerationMode = (settings) => {
  const mode = String(settings?.workoutModeration?.mode || '').trim().toLowerCase();
  if (mode === 'all' || mode === 'treadmill_only' || mode === 'none') return mode;
  return 'treadmill_only';
};

const isNicknameSuffixUpdateAllowed = (currentTeamName, requestedTeamName) => {
  const current = String(currentTeamName || '').trim();
  const requested = String(requestedTeamName || '').trim();
  if (!current || !requested) return false;
  if (requested.length <= current.length) return false;
  if (!requested.toLowerCase().startsWith(current.toLowerCase())) return false;
  const suffix = requested.slice(current.length);
  if (!suffix || !suffix.trim()) return false;
  return /^\s+[\w\-'.&]+(?:\s+[\w\-'.&]+)*$/.test(suffix);
};

export const listTeams = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    const teams = await ChallengeTeam.listByChallenge(classId);
    return res.json({ teams });
  } catch (e) {
    next(e);
  }
};

export const createTeam = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const teamName = String(req.body.teamName || '').trim();
    if (!classId || !teamName) return res.status(400).json({ error: { message: 'classId and teamName required' } });
    if (!(await canManageChallenge({ user: req.user, classId }))) return res.status(403).json({ error: { message: 'Manage access required' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    const team = await ChallengeTeam.create({
      learningClassId: classId,
      teamName,
      teamManagerUserId: req.body.teamManagerUserId ? asInt(req.body.teamManagerUserId) : null
    });
    return res.status(201).json({ team });
  } catch (e) {
    next(e);
  }
};

export const updateTeam = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const teamId = asInt(req.params.teamId);
    if (!classId || !teamId) return res.status(400).json({ error: { message: 'Invalid classId/teamId' } });
    const team = await ChallengeTeam.findById(teamId);
    if (!team || Number(team.learning_class_id) !== Number(classId)) return res.status(404).json({ error: { message: 'Team not found' } });
    const canManage = (await canManageChallenge({ user: req.user, classId })) || canManageTeam(req.user, team);
    if (!canManage) return res.status(403).json({ error: { message: 'Access denied' } });
    if (req.body.teamName !== undefined && !(await canManageChallenge({ user: req.user, classId }))) {
      const [classRows] = await pool.execute(
        `SELECT season_settings_json
         FROM learning_program_classes
         WHERE id = ?
         LIMIT 1`,
        [classId]
      );
      const settings = parseJsonObject(classRows?.[0]?.season_settings_json || {});
      const allowCaptainRename = settings?.teams?.allowCaptainRenameTeam !== false;
      const allowNicknameSuffixWhenLocked = settings?.teams?.allowCaptainNicknameSuffixWhenLocked === true;
      if (!allowCaptainRename) {
        const requestedName = String(req.body.teamName || '').trim();
        const currentName = String(team.team_name || '').trim();
        if (!allowNicknameSuffixWhenLocked) {
          return res.status(403).json({ error: { message: 'Captains cannot rename teams for this season' } });
        }
        if (!isNicknameSuffixUpdateAllowed(currentName, requestedName)) {
          return res.status(400).json({
            error: {
              message: 'Nickname mode only allows appending a suffix to the existing team name (example: "Charlie Chimeras")'
            }
          });
        }
      }
    }
    const patch = {};
    if (req.body.teamName !== undefined) patch.teamName = String(req.body.teamName || '').trim();
    if (req.body.teamManagerUserId !== undefined) patch.teamManagerUserId = req.body.teamManagerUserId ? asInt(req.body.teamManagerUserId) : null;
    const updated = await ChallengeTeam.update(teamId, patch);
    return res.json({ team: updated });
  } catch (e) {
    next(e);
  }
};

export const deleteTeam = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const teamId = asInt(req.params.teamId);
    if (!classId || !teamId) return res.status(400).json({ error: { message: 'Invalid classId/teamId' } });
    const team = await ChallengeTeam.findById(teamId);
    if (!team || Number(team.learning_class_id) !== Number(classId)) return res.status(404).json({ error: { message: 'Team not found' } });
    if (!(await canManageChallenge({ user: req.user, classId }))) return res.status(403).json({ error: { message: 'Manage access required' } });
    await ChallengeTeam.delete(teamId);
    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const listTeamMembers = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const teamId = asInt(req.params.teamId);
    if (!classId || !teamId) return res.status(400).json({ error: { message: 'Invalid classId/teamId' } });
    const team = await ChallengeTeam.findById(teamId);
    if (!team || Number(team.learning_class_id) !== Number(classId)) return res.status(404).json({ error: { message: 'Team not found' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    const members = await ChallengeTeam.listMembers(teamId);
    return res.json({ members });
  } catch (e) {
    next(e);
  }
};

export const upsertTeamMembers = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const teamId = asInt(req.params.teamId);
    if (!classId || !teamId) return res.status(400).json({ error: { message: 'Invalid classId/teamId' } });
    const team = await ChallengeTeam.findById(teamId);
    if (!team || Number(team.learning_class_id) !== Number(classId)) return res.status(404).json({ error: { message: 'Team not found' } });
    const canManage = (await canManageChallenge({ user: req.user, classId })) || canManageTeam(req.user, team);
    if (!canManage) return res.status(403).json({ error: { message: 'Access denied' } });
    const members = Array.isArray(req.body?.members) ? req.body.members : [];
    for (const m of members) {
      const providerUserId = asInt(m?.providerUserId);
      if (!providerUserId) continue;
      const action = String(m?.action || 'add').toLowerCase();
      if (action === 'remove') {
        await ChallengeTeam.removeMember({ teamId, providerUserId });
      } else {
        await ChallengeTeam.addMember({ teamId, providerUserId });
      }
    }
    const teamMembers = await ChallengeTeam.listMembers(teamId);
    return res.json({ teamId, members: teamMembers });
  } catch (e) {
    next(e);
  }
};

export const getLeaderboard = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    const individual = await ChallengeWorkout.getLeaderboardIndividual(classId);
    const team = await ChallengeWorkout.getLeaderboardTeam(classId);
    const weekStart = req.query.weekStart || null;
    let weekly = [];
    if (weekStart) {
      weekly = await ChallengeWorkout.getWeeklyLeaderboard(classId, weekStart);
    }
    return res.json({ individual, team, weekly });
  } catch (e) {
    next(e);
  }
};

export const buildRecordMetricMap = async ({ classId, organizationId, selectedMetricKeys = [] }) => {
  const scopeWhere = {
    season: {
      sql: 'w.learning_class_id = ?',
      params: [classId]
    },
    club_all_time: organizationId
      ? {
        sql: 'c.organization_id = ?',
        params: [organizationId]
      }
      : null
  };
  const metricDefs = [
    {
      key: 'longest_run',
      label: 'Longest Run',
      where: `LOWER(w.activity_type) LIKE '%run%' AND COALESCE(w.distance_value, 0) > 0`,
      order: 'w.distance_value DESC, w.completed_at ASC',
      valueText: (r) => `${Number(r.distance_value || 0).toFixed(2)} mi`
    },
    {
      key: 'fastest_mile',
      label: 'Best Mile Pace (Run)',
      where: `LOWER(w.activity_type) LIKE '%run%' AND COALESCE(w.distance_value, 0) >= 1 AND COALESCE(w.duration_minutes, 0) > 0`,
      order: '(w.duration_minutes / NULLIF(w.distance_value, 0)) ASC, w.completed_at ASC',
      valueText: (r) => {
        const pace = Number(r.duration_minutes || 0) / Number(r.distance_value || 1);
        const min = Math.floor(pace);
        const sec = Math.round((pace - min) * 60);
        return `${String(min)}:${String(sec).padStart(2, '0')} /mi`;
      }
    },
    {
      key: 'longest_ruck',
      label: 'Longest Ruck',
      where: `LOWER(w.activity_type) LIKE '%ruck%' AND COALESCE(w.distance_value, 0) > 0`,
      order: 'w.distance_value DESC, w.completed_at ASC',
      valueText: (r) => `${Number(r.distance_value || 0).toFixed(2)} mi`
    },
    {
      key: 'highest_points_workout',
      label: 'Highest Points (Single Workout)',
      where: 'COALESCE(w.points, 0) > 0',
      order: 'w.points DESC, w.completed_at ASC',
      valueText: (r) => `${Number(r.points || 0)} pts`
    },
    {
      key: 'longest_trail_run',
      label: 'Longest Trail Run',
      where: `(LOWER(w.activity_type) LIKE '%trail%' OR LOWER(w.workout_notes) LIKE '%trail%') AND COALESCE(w.distance_value, 0) > 0`,
      order: 'w.distance_value DESC, w.completed_at ASC',
      valueText: (r) => `${Number(r.distance_value || 0).toFixed(2)} mi`
    },
    {
      key: 'fastest_5k',
      label: 'Fastest 5K (Est.)',
      where: `LOWER(w.activity_type) LIKE '%run%' AND COALESCE(w.distance_value, 0) >= 3.1 AND COALESCE(w.duration_minutes, 0) > 0`,
      order: '(w.duration_minutes / NULLIF(w.distance_value, 0)) ASC, w.completed_at ASC',
      valueText: (r) => {
        const pace = Number(r.duration_minutes || 0) / Number(r.distance_value || 1);
        const estimate = pace * 3.10686;
        const min = Math.floor(estimate);
        const sec = Math.round((estimate - min) * 60);
        return `${String(min)}:${String(sec).padStart(2, '0')} (est.)`;
      }
    },
    {
      key: 'fastest_half_marathon',
      label: 'Fastest Half Marathon',
      where: `LOWER(w.activity_type) LIKE '%run%' AND COALESCE(w.distance_value, 0) >= 13.1 AND COALESCE(w.duration_minutes, 0) > 0`,
      order: 'w.duration_minutes ASC, w.completed_at ASC',
      valueText: (r) => {
        const total = Number(r.duration_minutes || 0);
        const h = Math.floor(total / 60);
        const m = Math.floor(total % 60);
        const s = Math.round((total - Math.floor(total)) * 60);
        return h > 0
          ? `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
          : `${m}m ${String(s).padStart(2, '0')}s`;
      }
    },
    {
      key: 'fastest_marathon',
      label: 'Fastest Marathon',
      where: `LOWER(w.activity_type) LIKE '%run%' AND COALESCE(w.distance_value, 0) >= 26.2 AND COALESCE(w.duration_minutes, 0) > 0`,
      order: 'w.duration_minutes ASC, w.completed_at ASC',
      valueText: (r) => {
        const total = Number(r.duration_minutes || 0);
        const h = Math.floor(total / 60);
        const m = Math.floor(total % 60);
        const s = Math.round((total - Math.floor(total)) * 60);
        return h > 0
          ? `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
          : `${m}m ${String(s).padStart(2, '0')}s`;
      }
    },
    {
      key: 'longest_walk',
      label: 'Longest Walk',
      where: `LOWER(w.activity_type) LIKE '%walk%' AND COALESCE(w.distance_value, 0) > 0`,
      order: 'w.distance_value DESC, w.completed_at ASC',
      valueText: (r) => `${Number(r.distance_value || 0).toFixed(2)} mi`
    },
    {
      key: 'longest_duration_workout',
      label: 'Longest Workout Duration',
      where: 'COALESCE(w.duration_minutes, 0) > 0',
      order: 'w.duration_minutes DESC, w.completed_at ASC',
      valueText: (r) => `${Number(r.duration_minutes || 0)} min`
    },
    {
      key: 'highest_calories_workout',
      label: 'Highest Calories (Single Workout)',
      where: 'COALESCE(w.calories_burned, 0) > 0',
      order: 'w.calories_burned DESC, w.completed_at ASC',
      valueText: (r) => `${Number(r.calories_burned || 0)} cal`
    }
  ];
  const metricByKey = new Map(metricDefs.map((m) => [m.key, m]));
  const chosen = Array.isArray(selectedMetricKeys) && selectedMetricKeys.length
    ? selectedMetricKeys.map((k) => metricByKey.get(String(k || '').trim())).filter(Boolean)
    : metricDefs.slice(0, 4);

  const fetchBest = async (scopeKey, metric) => {
    const scope = scopeWhere[scopeKey];
    if (!scope) return null;
    const [rows] = await pool.execute(
      `SELECT
         w.id AS workout_id,
         w.user_id,
         w.team_id,
         w.activity_type,
         w.distance_value,
         w.duration_minutes,
         w.points,
         w.completed_at,
         u.first_name,
         u.last_name,
         t.team_name,
         c.class_name
       FROM challenge_workouts w
       INNER JOIN users u ON u.id = w.user_id
       INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
       LEFT JOIN challenge_teams t ON t.id = w.team_id
       WHERE ${scope.sql}
         AND (w.is_disqualified IS NULL OR w.is_disqualified = 0)
         AND ${metric.where}
       ORDER BY ${metric.order}
       LIMIT 1`,
      scope.params
    );
    const row = rows?.[0];
    if (!row) return null;
    return {
      metricKey: metric.key,
      label: metric.label,
      holderUserId: Number(row.user_id),
      holderName: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
      teamName: row.team_name || null,
      seasonName: row.class_name || null,
      valueText: metric.valueText(row),
      workoutId: Number(row.workout_id),
      completedAt: row.completed_at
    };
  };

  const season = [];
  const clubAllTime = [];
  for (const metric of chosen) {
    const s = await fetchBest('season', metric);
    if (s) season.push(s);
    const a = await fetchBest('club_all_time', metric);
    if (a) clubAllTime.push(a);
  }
  return { season, clubAllTime };
};

export const getRecordBoards = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    const organizationId = Number(access.class?.organization_id || 0) || null;
    const seasonSettings = parseJsonObject(access.class?.season_settings_json || {});
    const selectedMetricKeys = Array.isArray(seasonSettings?.records?.metrics)
      ? seasonSettings.records.metrics.map((k) => String(k || '').trim()).filter(Boolean)
      : [];
    const boards = await buildRecordMetricMap({ classId, organizationId, selectedMetricKeys });
    return res.json({
      seasonRecords: boards.season,
      clubAllTimeRecords: boards.clubAllTime,
      selectedMetricKeys
    });
  } catch (e) {
    next(e);
  }
};

const formatRaceTime = (totalMinutes) => {
  const total = Number(totalMinutes || 0);
  if (!total) return '—';
  const h = Math.floor(total / 60);
  const m = Math.floor(total % 60);
  const s = Math.round((total - Math.floor(total)) * 60);
  return h > 0
    ? `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
    : `${m}m ${String(s).padStart(2, '0')}s`;
};

export const buildRaceDivisions = async ({ classId, organizationId }) => {
  const scopeWhere = {
    season: { sql: 'w.learning_class_id = ?', params: [classId] },
    club_all_time: organizationId
      ? { sql: 'c.organization_id = ?', params: [organizationId] }
      : null
  };

  const fetchDivision = async (scopeKey, distanceThreshold) => {
    const scope = scopeWhere[scopeKey];
    if (!scope) return [];
    const [rows] = await pool.execute(
      `SELECT
         u.id AS user_id,
         u.first_name,
         u.last_name,
         MIN(w.duration_minutes) AS best_time_minutes,
         MAX(w.distance_value)   AS best_distance,
         MIN(w.completed_at)     AS first_completed_at,
         COUNT(*)                AS completion_count
       FROM challenge_workouts w
       INNER JOIN users u ON u.id = w.user_id
       INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
       WHERE ${scope.sql}
         AND LOWER(w.activity_type) LIKE '%run%'
         AND COALESCE(w.distance_value, 0) >= ?
         AND (w.is_disqualified IS NULL OR w.is_disqualified = 0)
       GROUP BY u.id, u.first_name, u.last_name
       ORDER BY MIN(w.duration_minutes) ASC`,
      [...scope.params, distanceThreshold]
    );
    return (rows || []).map((r) => ({
      userId: Number(r.user_id),
      name: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
      bestTimeMinutes: Number(r.best_time_minutes || 0),
      bestTimeText: formatRaceTime(Number(r.best_time_minutes || 0)),
      bestDistance: Number(r.best_distance || 0),
      completionCount: Number(r.completion_count || 0),
      firstCompletedAt: r.first_completed_at
    }));
  };

  return {
    halfMarathon: {
      threshold: 13.1,
      season: await fetchDivision('season', 13.1),
      allTime: await fetchDivision('club_all_time', 13.1)
    },
    marathon: {
      threshold: 26.2,
      season: await fetchDivision('season', 26.2),
      allTime: await fetchDivision('club_all_time', 26.2)
    }
  };
};

export const getRaceDivisions = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    const organizationId = Number(access.class?.organization_id || 0) || null;
    const divisions = await buildRaceDivisions({ classId, organizationId });
    return res.json(divisions);
  } catch (e) {
    next(e);
  }
};

export const getActivityFeed = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    const limit = Math.min(100, asInt(req.query.limit) || 50);
    const offset = asInt(req.query.offset) || 0;
    const workouts = await ChallengeWorkout.listByChallenge(classId, { limit, offset });
    const workoutIds = (workouts || []).map((w) => Number(w.id)).filter(Boolean);
    const mediaRows = await ChallengeWorkoutMedia.listByWorkoutIds(workoutIds);
    const commentsByWorkout = new Map();
    if (workoutIds.length) {
      const placeholders = workoutIds.map(() => '?').join(', ');
      const [commentCounts] = await pool.execute(
        `SELECT workout_id, COUNT(*) AS comment_count
         FROM challenge_workout_comments
         WHERE workout_id IN (${placeholders})
         GROUP BY workout_id`,
        workoutIds
      );
      for (const c of commentCounts || []) commentsByWorkout.set(Number(c.workout_id), Number(c.comment_count || 0));
    }
    const mediaByWorkout = new Map();
    for (const m of mediaRows || []) {
      const wid = Number(m.workout_id);
      if (!mediaByWorkout.has(wid)) mediaByWorkout.set(wid, []);
      mediaByWorkout.get(wid).push(m);
    }
    const enriched = (workouts || []).map((w) => ({
      ...w,
      comment_count: commentsByWorkout.get(Number(w.id)) || 0,
      media: mediaByWorkout.get(Number(w.id)) || []
    }));
    return res.json({ workouts: enriched });
  } catch (e) {
    next(e);
  }
};

export const getMyParticipationSummary = async (req, res, next) => {
  try {
    const userId = Number(req.user?.id || 0);
    const organizationId = asInt(req.query.organizationId);
    if (!userId) return res.status(401).json({ error: { message: 'Unauthorized' } });
    const orgFilter = organizationId ? ' AND c.organization_id = ?' : '';
    const statsParams = organizationId ? [userId, userId, organizationId] : [userId, userId];
    const [stats] = await pool.execute(
      `SELECT
         COUNT(DISTINCT w.id) AS workout_count,
         COALESCE(SUM(w.points), 0) AS total_points
       FROM challenge_workouts w
       INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
       INNER JOIN learning_class_provider_memberships m ON m.learning_class_id = w.learning_class_id AND m.provider_user_id = ?
       WHERE w.user_id = ? AND m.membership_status IN ('active','completed')
         AND (w.is_disqualified IS NULL OR w.is_disqualified = 0)${orgFilter}`,
      statsParams
    );
    const teamsParams = organizationId ? [userId, organizationId] : [userId];
    const [teams] = await pool.execute(
      `SELECT c.id AS challenge_id, c.class_name, t.id AS team_id, t.team_name
       FROM challenge_team_members m
       INNER JOIN challenge_teams t ON t.id = m.team_id
       INNER JOIN learning_program_classes c ON c.id = t.learning_class_id
       WHERE m.provider_user_id = ?${orgFilter}
       ORDER BY COALESCE(c.starts_at, '9999-12-31') DESC, t.team_name`,
      teamsParams
    );
    const recentParams = organizationId ? [userId, userId, organizationId] : [userId, userId];
    const [recent] = await pool.execute(
      `SELECT w.id, w.learning_class_id, w.activity_type, w.points, w.completed_at, c.class_name, t.team_name
       FROM challenge_workouts w
       INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
       INNER JOIN learning_class_provider_memberships pm ON pm.learning_class_id = c.id AND pm.provider_user_id = ?
       LEFT JOIN challenge_teams t ON t.id = w.team_id
       WHERE w.user_id = ? AND pm.membership_status IN ('active','completed')
         AND (w.is_disqualified IS NULL OR w.is_disqualified = 0)${orgFilter}
       ORDER BY w.completed_at DESC, w.created_at DESC
       LIMIT 10`,
      recentParams
    );
    return res.json({
      workoutCount: Number(stats?.[0]?.workout_count || 0),
      totalPoints: Number(stats?.[0]?.total_points || 0),
      teams: (teams || []).map((r) => ({
        challengeId: r.challenge_id,
        challengeName: r.class_name,
        teamId: r.team_id,
        teamName: r.team_name
      })),
      recentWorkouts: (recent || []).map((r) => ({
        id: r.id,
        learningClassId: r.learning_class_id,
        activityType: r.activity_type,
        points: r.points,
        completedAt: r.completed_at,
        challengeName: r.class_name,
        teamName: r.team_name
      }))
    });
  } catch (e) {
    next(e);
  }
};

export const submitWorkout = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const activityType = String(req.body.activityType || '').trim();
    if (!classId || !activityType) return res.status(400).json({ error: { message: 'classId and activityType required' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    const classStatus = String(access.class?.status || '').toLowerCase();
    if (classStatus === 'closed' || classStatus === 'archived') {
      return res.status(400).json({ error: { message: 'This season has been closed by a manager' } });
    }
    // Verify user is a provider member
    const [pm] = await pool.execute(
      `SELECT 1 FROM learning_class_provider_memberships WHERE learning_class_id = ? AND provider_user_id = ? AND membership_status IN ('active','completed') LIMIT 1`,
      [classId, req.user.id]
    );
    if (!pm?.length) return res.status(403).json({ error: { message: 'You must be a season participant to submit workouts' } });
    const participationAcceptance = await ensureChallengeParticipationAgreementAccepted({
      klass: access.class,
      userId: req.user.id
    });
    if (!participationAcceptance.ok) {
      return res.status(participationAcceptance.status).json({ error: { message: participationAcceptance.message } });
    }
    let teamId = req.body.teamId ? asInt(req.body.teamId) : null;
    if (!teamId) {
      const team = await ChallengeTeam.getTeamForUser(classId, req.user.id);
      teamId = team?.id || null;
    }
    const settings = parseJsonObject(access.class?.season_settings_json || {});
    const schedule = parseJsonObject(settings?.schedule || {});
    const eventCategory = String(settings?.event?.category || 'run_ruck').toLowerCase();
    const scoring = parseJsonObject(settings?.scoring || {});
    const runMilesPerPoint = Number(scoring.runMilesPerPoint || 1) || 1;
    const ruckMilesPerPoint = Number(scoring.ruckMilesPerPoint || 1) || 1;
    const caloriesPerPoint = Number(scoring.caloriesPerPoint || 100) || 100;
    const activityLower = String(activityType || '').toLowerCase();
    const isTreadmill = asInt(req.body.isTreadmill) === 1 || req.body.isTreadmill === true;
    const distanceValue = req.body.distanceValue != null ? Number(req.body.distanceValue) : null;
    const caloriesBurned = req.body.caloriesBurned != null ? asInt(req.body.caloriesBurned) : null;
    const treadmillpocalypseEnabled = settings?.treadmillpocalypse?.enabled === true;
    const treadmillpocalypseStartsAtWeek = String(settings?.treadmillpocalypse?.startsAtWeek || '').slice(0, 10) || null;
    const moderationMode = getWorkoutModerationMode(settings);
    const weekCutoffTime = String(schedule?.weekEndsSundayAt || access.class?.week_start_time || '00:00');
    const weekTimeZone = String(schedule?.weekTimeZone || 'UTC');
    let computedPoints = null;
    if (eventCategory === 'fitness' && caloriesBurned != null && caloriesPerPoint > 0) {
      computedPoints = Math.max(0, Math.floor(caloriesBurned / caloriesPerPoint));
    } else if (eventCategory === 'run_ruck' && distanceValue != null && Number.isFinite(distanceValue)) {
      if (activityLower.includes('ruck')) {
        computedPoints = Math.max(0, Math.floor(distanceValue / ruckMilesPerPoint));
      } else if (activityLower.includes('run')) {
        computedPoints = Math.max(0, Math.floor(distanceValue / runMilesPerPoint));
      }
    }
    const points = computedPoints != null ? computedPoints : (asInt(req.body.points) || 0);
    const completedAt = req.body.completedAt ? new Date(req.body.completedAt) : new Date();
    const completedWeekStart = getWeekStartDate(completedAt, weekCutoffTime, weekTimeZone);
    if (eventCategory === 'run_ruck' && activityLower.includes('ruck')) {
      const participation = parseJsonObject(settings?.participation || {});
      const maxRucksPerWeek = Math.max(0, Number.parseInt(participation?.maxRucksPerWeek, 10) || 0);
      if (maxRucksPerWeek > 0) {
        const range = getWeekDateTimeRange(completedWeekStart, weekCutoffTime, weekTimeZone) || {
          start: `${String(completedWeekStart).slice(0, 10)} 00:00:00`,
          end: `${String(completedWeekStart).slice(0, 10)} 23:59:59`
        };
        const [ruckRows] = await pool.execute(
          `SELECT COUNT(*) AS total
           FROM challenge_workouts w
           WHERE w.learning_class_id = ?
             AND w.user_id = ?
             AND LOWER(w.activity_type) LIKE '%ruck%'
             AND (w.is_disqualified IS NULL OR w.is_disqualified = 0)
             AND w.completed_at >= ?
             AND w.completed_at < ?`,
          [classId, req.user.id, range.start, range.end]
        );
        const alreadyLogged = Number(ruckRows?.[0]?.total || 0);
        if (alreadyLogged >= maxRucksPerWeek) {
          return res.status(400).json({ error: { message: `Weekly ruck limit reached (${maxRucksPerWeek}) for this season` } });
        }
      }
    }
    if (isTreadmill && treadmillpocalypseEnabled && treadmillpocalypseStartsAtWeek && String(completedWeekStart || '') >= treadmillpocalypseStartsAtWeek) {
      return res.status(400).json({ error: { message: 'Treadmill workouts are blocked for this week (treadmillpocalypse active).' } });
    }
    const weeklyTaskId = req.body.weeklyTaskId ? asInt(req.body.weeklyTaskId) : null;
    let weeklyTask = null;
    if (weeklyTaskId) {
      weeklyTask = await ChallengeWeeklyTask.findById(weeklyTaskId);
      if (!weeklyTask || Number(weeklyTask.learning_class_id) !== Number(classId)) {
        return res.status(400).json({ error: { message: 'Invalid weekly challenge tag' } });
      }
      if (String(weeklyTask.week_start_date || '').slice(0, 10) !== String(completedWeekStart || '').slice(0, 10)) {
        return res.status(400).json({ error: { message: 'Weekly challenge tag must belong to the active workout week' } });
      }
      // Enforce assignment for volunteer/captain modes — only the assigned user may tag
      if (weeklyTask.mode !== 'full_team') {
        const assignment = await ChallengeWeeklyAssignment.findByTaskAndUser(weeklyTask.id, req.user.id);
        if (!assignment) {
          return res.status(403).json({ error: { message: 'You are not assigned to this weekly challenge.' } });
        }
      }
    }
    let proofStatus = (moderationMode === 'all' || (moderationMode === 'treadmill_only' && isTreadmill))
      ? 'pending'
      : 'not_required';
    const hasTreadmillProof = !!String(req.body.screenshotFilePath || '').trim();
    const taskProofPolicy = String(weeklyTask?.proof_policy || 'none').toLowerCase();
    if (taskProofPolicy === 'photo_required' && !hasTreadmillProof) {
      return res.status(400).json({ error: { message: 'This weekly challenge requires photo proof upload.' } });
    }
    if (taskProofPolicy === 'gps_required_no_treadmill' && isTreadmill) {
      return res.status(400).json({ error: { message: 'This weekly challenge does not allow treadmill workouts.' } });
    }
    if (isTreadmill) {
      if (!hasTreadmillProof) {
        return res.status(400).json({ error: { message: 'Treadmill entries require a treadmill photo upload.' } });
      }
    }
    // ── Criteria validation (non-blocking by default unless manager enforces strict mode) ──
    let criteriaViolation = null;
    if (weeklyTask && weeklyTask.criteria_json) {
      const crit = typeof weeklyTask.criteria_json === 'object'
        ? weeklyTask.criteria_json
        : (() => { try { return JSON.parse(weeklyTask.criteria_json); } catch { return null; } })();
      if (crit) {
        // Activity type filter
        if (crit.activityTypes?.length && !crit.activityTypes.some(
          (t) => String(t).toLowerCase() === activityLower || activityLower.includes(String(t).toLowerCase())
        )) {
          criteriaViolation = `Activity type "${activityType}" is not allowed for this challenge (requires: ${crit.activityTypes.join(', ')})`;
        }
        // Terrain filter
        if (!criteriaViolation && crit.terrain?.length && terrain &&
          !crit.terrain.map((t) => String(t).toLowerCase()).includes(String(terrain).toLowerCase())
        ) {
          criteriaViolation = `Terrain "${terrain}" is not allowed for this challenge (requires: ${crit.terrain.join(', ')})`;
        }
        // Minimum distance
        const submittedDist = distanceValue != null ? Number(distanceValue) : null;
        if (!criteriaViolation && crit.distance?.minMiles && (submittedDist == null || submittedDist < crit.distance.minMiles)) {
          criteriaViolation = `Minimum distance for this challenge is ${crit.distance.minMiles} mi (submitted: ${submittedDist ?? 0} mi)`;
        }
        // Minimum duration
        const submittedDur = req.body.durationMinutes != null ? Number(req.body.durationMinutes) : null;
        if (!criteriaViolation && crit.duration?.minMinutes && (submittedDur == null || submittedDur < crit.duration.minMinutes)) {
          criteriaViolation = `Minimum duration for this challenge is ${crit.duration.minMinutes} min (submitted: ${submittedDur ?? 0} min)`;
        }
        // Max pace (minSeconds per mile)
        if (!criteriaViolation && crit.pace?.maxSecondsPerMile && submittedDist && submittedDur) {
          const submittedPaceSecPerMi = (submittedDur * 60) / submittedDist;
          if (submittedPaceSecPerMi > crit.pace.maxSecondsPerMile) {
            const maxMins = Math.floor(crit.pace.maxSecondsPerMile / 60);
            const maxSecs = String(crit.pace.maxSecondsPerMile % 60).padStart(2, '0');
            criteriaViolation = `Pace requirement not met — challenge requires faster than ${maxMins}:${maxSecs}/mi`;
          }
        }
        // Time-of-day window
        if (!criteriaViolation && crit.timeOfDay?.start && crit.timeOfDay?.end) {
          const completedHHMM = completedAt.toTimeString().slice(0, 5); // "HH:MM"
          if (completedHHMM < crit.timeOfDay.start || completedHHMM > crit.timeOfDay.end) {
            criteriaViolation = `This challenge must be completed between ${crit.timeOfDay.start} and ${crit.timeOfDay.end} (submitted: ${completedHHMM})`;
          }
        }
        // Split-run logic — count same-task workouts for this user today
        if (!criteriaViolation && crit.splitRuns?.count && crit.splitRuns.count > 1) {
          const todayStr = completedAt.toISOString().slice(0, 10);
          const [existingRows] = await pool.execute(
            `SELECT completed_at FROM challenge_workouts
             WHERE user_id = ? AND weekly_task_id = ? AND DATE(completed_at) = ?
             ORDER BY completed_at ASC`,
            [req.user.id, weeklyTaskId, todayStr]
          );
          const existingCount = existingRows?.length || 0;
          if (existingCount >= crit.splitRuns.count) {
            criteriaViolation = `You have already logged ${existingCount} workout(s) for this challenge today (max: ${crit.splitRuns.count})`;
          }
          // Check minimum separation between runs
          if (!criteriaViolation && existingCount > 0 && crit.splitRuns.minSeparationMinutes) {
            const lastAt = new Date(existingRows[existingCount - 1].completed_at).getTime();
            const sepMs = crit.splitRuns.minSeparationMinutes * 60 * 1000;
            if (completedAt.getTime() - lastAt < sepMs) {
              criteriaViolation = `Split runs for this challenge must be separated by at least ${crit.splitRuns.minSeparationMinutes} minutes`;
            }
          }
        }

        // If there's a violation, enforce strict mode or flag-only
        if (criteriaViolation) {
          const strictMode = String(weeklyTask.proof_policy || '').includes('strict') || crit.strictMode === true;
          if (strictMode) {
            return res.status(400).json({ error: { message: criteriaViolation }, criteriaViolation });
          }
          // Otherwise fall through — workout is logged but flagged
        }
      }
    }

    // Auto-flag as a race entry when a run meets or exceeds half-marathon distance
    const isRace = activityLower.includes('run') && distanceValue != null && Number(distanceValue) >= 13.1;
    const terrain = req.body.terrain ? String(req.body.terrain).trim() : null;
    const workout = await ChallengeWorkout.create({
      learningClassId: classId,
      teamId,
      userId: req.user.id,
      activityType,
      isTreadmill,
      isRace,
      terrain,
      distanceValue,
      reportedDistanceValue: distanceValue,
      durationMinutes: req.body.durationMinutes != null ? asInt(req.body.durationMinutes) : null,
      caloriesBurned,
      points,
      workoutNotes: req.body.workoutNotes ? String(req.body.workoutNotes).trim() : null,
      screenshotFilePath: req.body.screenshotFilePath ? String(req.body.screenshotFilePath).trim() : null,
      completedAt: completedAt.toISOString().slice(0, 19).replace('T', ' '),
      weeklyTaskId,
      proofStatus
    });
    if (workout?.id) {
      try {
        await queueClubRecordBreakCandidates({
          learningClassId: classId,
          workoutId: workout.id,
          userId: req.user.id
        });
      } catch {
        // Non-blocking async hook.
      }
      try {
        await enqueueWorkoutVision({
          workoutId: workout.id,
          learningClassId: classId,
          userId: req.user.id,
          screenshotFilePath: workout?.screenshot_file_path || null,
          workoutNotes: workout?.workout_notes || null
        });
      } catch {
        // Non-blocking async hook.
      }
      // Auto-link screenshot to user photo album so it appears in the member's photos.
      if (workout?.screenshot_file_path) {
        pool.execute(
          `INSERT IGNORE INTO user_photos (user_id, file_path, source, source_ref_id, is_profile)
           VALUES (?, ?, 'workout_screenshot', ?, 0)`,
          [req.user.id, workout.screenshot_file_path, workout.id]
        ).catch(() => {});
      }
    }
    return res.status(201).json({ workout, criteriaViolation: criteriaViolation || null });
  } catch (e) {
    next(e);
  }
};

export const reviewWorkoutProof = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const workoutId = asInt(req.params.workoutId);
    if (!classId || !workoutId) return res.status(400).json({ error: { message: 'Invalid classId/workoutId' } });
    if (!(await canManageChallenge({ user: req.user, classId }))) return res.status(403).json({ error: { message: 'Manage access required' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    const workout = await ChallengeWorkout.findById(workoutId);
    if (!workout || Number(workout.learning_class_id) !== Number(classId)) {
      return res.status(404).json({ error: { message: 'Workout not found' } });
    }
    const status = String(req.body?.proofStatus || '').toLowerCase();
    if (!['approved', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({ error: { message: 'proofStatus must be approved, rejected, or pending' } });
    }
    const verifiedDistanceValue = req.body?.verifiedDistanceValue != null ? Number(req.body.verifiedDistanceValue) : null;
    const nextDistance = status === 'approved' && verifiedDistanceValue != null
      ? verifiedDistanceValue
      : (workout.reported_distance_value != null ? Number(workout.reported_distance_value) : Number(workout.distance_value || 0));
    const nextWorkout = await ChallengeWorkout.updateProofReview(workoutId, {
      proofStatus: status,
      verifiedDistanceValue: status === 'approved' ? verifiedDistanceValue : null,
      distanceValue: nextDistance,
      proofReviewNote: req.body?.proofReviewNote ? String(req.body.proofReviewNote) : null,
      proofReviewedByUserId: req.user.id,
      proofReviewedAt: new Date().toISOString().slice(0, 19).replace('T', ' ')
    });
    return res.json({ workout: nextWorkout });
  } catch (e) {
    next(e);
  }
};

export const disqualifyWorkout = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const workoutId = asInt(req.params.workoutId);
    if (!classId || !workoutId) return res.status(400).json({ error: { message: 'Invalid classId/workoutId' } });
    if (!(await canManageChallenge({ user: req.user, classId }))) return res.status(403).json({ error: { message: 'Manage access required' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    const workout = await ChallengeWorkout.findById(workoutId);
    if (!workout || Number(workout.learning_class_id) !== Number(classId)) {
      return res.status(404).json({ error: { message: 'Workout not found' } });
    }
    const isDisqualified = req.body?.isDisqualified !== false;
    const reason = req.body?.reason ? String(req.body.reason) : null;
    const updated = await ChallengeWorkout.updateDisqualification(workoutId, {
      isDisqualified,
      reason,
      byUserId: req.user.id,
      at: new Date().toISOString().slice(0, 19).replace('T', ' ')
    });
    return res.json({ workout: updated });
  } catch (e) {
    next(e);
  }
};

export const getDraftReport = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    const canManage = await canManageChallenge({ user: req.user, classId });
    const isCaptain = await isCaptainForClass({ classId, userId: req.user.id });
    if (!canManage && !isCaptain) {
      return res.status(403).json({ error: { message: 'Manager/captain access required' } });
    }
    const [members] = await pool.execute(
      `SELECT pm.provider_user_id, pm.membership_status, u.first_name, u.last_name, u.email
       FROM learning_class_provider_memberships pm
       INNER JOIN users u ON u.id = pm.provider_user_id
       WHERE pm.learning_class_id = ? AND pm.membership_status IN ('active','completed')
       ORDER BY u.last_name ASC, u.first_name ASC`,
      [classId]
    );
    const [noteRows] = await pool.execute(
      `SELECT provider_user_id, note_text, updated_at
       FROM challenge_member_draft_notes
       WHERE learning_class_id = ?`,
      [classId]
    );
    const notesByUser = new Map((noteRows || []).map((r) => [Number(r.provider_user_id), { note: r.note_text || '', updatedAt: r.updated_at || null }]));
    let previousSeason = null;
    const orgId = Number(access.class?.organization_id || 0);
    if (orgId > 0) {
      const anchor = access.class?.starts_at || access.class?.created_at || new Date().toISOString().slice(0, 19).replace('T', ' ');
      const [prevRows] = await pool.execute(
        `SELECT id, class_name, starts_at
         FROM learning_program_classes
         WHERE organization_id = ?
           AND id <> ?
           AND COALESCE(starts_at, created_at) < COALESCE(?, NOW())
         ORDER BY COALESCE(starts_at, created_at) DESC
         LIMIT 1`,
        [orgId, classId, anchor]
      );
      previousSeason = prevRows?.[0] || null;
    }
    const previousByUser = new Map();
    if (previousSeason?.id) {
      const [prevStats] = await pool.execute(
        `SELECT
           pm.provider_user_id,
           COALESCE(SUM(w.points), 0) AS total_points,
           COALESCE(SUM(w.distance_value), 0) AS total_miles,
           COUNT(w.id) AS workout_count,
           MAX(t.team_name) AS team_name,
           MAX(CASE WHEN e.id IS NULL THEN 0 ELSE 1 END) AS was_eliminated
         FROM learning_class_provider_memberships pm
         LEFT JOIN challenge_workouts w
           ON w.learning_class_id = pm.learning_class_id
           AND w.user_id = pm.provider_user_id
           AND (w.is_disqualified IS NULL OR w.is_disqualified = 0)
         LEFT JOIN challenge_team_members ctm ON ctm.provider_user_id = pm.provider_user_id
         LEFT JOIN challenge_teams t ON t.id = ctm.team_id AND t.learning_class_id = pm.learning_class_id
         LEFT JOIN challenge_eliminations e
           ON e.learning_class_id = pm.learning_class_id
           AND e.provider_user_id = pm.provider_user_id
         WHERE pm.learning_class_id = ?
         GROUP BY pm.provider_user_id`,
        [previousSeason.id]
      );
      for (const row of prevStats || []) {
        previousByUser.set(Number(row.provider_user_id), {
          totalPoints: Number(row.total_points || 0),
          totalMiles: Number(row.total_miles || 0),
          workoutCount: Number(row.workout_count || 0),
          teamName: row.team_name || null,
          wasEliminated: Number(row.was_eliminated || 0) === 1
        });
      }
    }
    const participants = (members || []).map((m) => ({
      providerUserId: Number(m.provider_user_id),
      firstName: m.first_name,
      lastName: m.last_name,
      email: m.email,
      membershipStatus: m.membership_status,
      draftNote: notesByUser.get(Number(m.provider_user_id))?.note || '',
      draftNoteUpdatedAt: notesByUser.get(Number(m.provider_user_id))?.updatedAt || null,
      previousSeason: previousByUser.get(Number(m.provider_user_id)) || null
    }));
    return res.json({
      canEditNotes: canManage,
      previousSeason: previousSeason
        ? { id: Number(previousSeason.id), className: previousSeason.class_name, startsAt: previousSeason.starts_at || null }
        : null,
      participants
    });
  } catch (e) {
    next(e);
  }
};

export const upsertDraftNote = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const providerUserId = asInt(req.params.providerUserId);
    if (!classId || !providerUserId) return res.status(400).json({ error: { message: 'Invalid classId/providerUserId' } });
    if (!(await canManageChallenge({ user: req.user, classId }))) return res.status(403).json({ error: { message: 'Manage access required' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    const [memberRows] = await pool.execute(
      `SELECT 1 FROM learning_class_provider_memberships
       WHERE learning_class_id = ? AND provider_user_id = ? AND membership_status IN ('active','completed')
       LIMIT 1`,
      [classId, providerUserId]
    );
    if (!memberRows?.length) return res.status(404).json({ error: { message: 'Participant not found in season' } });
    const noteText = req.body?.noteText != null ? String(req.body.noteText).slice(0, 2000) : null;
    await pool.execute(
      `INSERT INTO challenge_member_draft_notes
       (learning_class_id, provider_user_id, note_text, created_by_user_id, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         note_text = VALUES(note_text),
         updated_by_user_id = VALUES(updated_by_user_id),
         updated_at = CURRENT_TIMESTAMP`,
      [classId, providerUserId, noteText, req.user.id, req.user.id]
    );
    return res.json({ ok: true, providerUserId, noteText });
  } catch (e) {
    next(e);
  }
};

export const editOwnImportedTreadmillWorkout = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const workoutId = asInt(req.params.workoutId);
    if (!classId || !workoutId) return res.status(400).json({ error: { message: 'Invalid classId/workoutId' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    const workout = await ChallengeWorkout.findById(workoutId);
    if (!workout || Number(workout.learning_class_id) !== Number(classId)) {
      return res.status(404).json({ error: { message: 'Workout not found' } });
    }
    if (Number(workout.user_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: { message: 'You can only edit your own workouts' } });
    }
    const participationAcceptance = await ensureChallengeParticipationAgreementAccepted({
      klass: access.class,
      userId: req.user.id
    });
    if (!participationAcceptance.ok) {
      return res.status(participationAcceptance.status).json({ error: { message: participationAcceptance.message } });
    }
    if (!workout.strava_activity_id || Number(workout.is_treadmill) !== 1) {
      return res.status(400).json({ error: { message: 'Only treadmill workouts imported from Strava can be edited' } });
    }
    const distanceValue = req.body?.distanceValue != null ? Number(req.body.distanceValue) : null;
    if (distanceValue == null || !Number.isFinite(distanceValue) || distanceValue < 0) {
      return res.status(400).json({ error: { message: 'A valid distanceValue is required' } });
    }
    const note = req.body?.workoutNotes != null ? String(req.body.workoutNotes).trim() : null;
    const screenshot = req.body?.screenshotFilePath != null ? String(req.body.screenshotFilePath).trim() : null;
    const [result] = await pool.execute(
      `UPDATE challenge_workouts
       SET distance_value = ?,
           reported_distance_value = ?,
           workout_notes = ?,
           screenshot_file_path = CASE WHEN ? = '' THEN screenshot_file_path ELSE ? END,
           proof_status = 'pending'
       WHERE id = ? AND learning_class_id = ? AND user_id = ?`,
      [distanceValue, distanceValue, note, screenshot || '', screenshot || '', workoutId, classId, req.user.id]
    );
    if (!Number(result?.affectedRows || 0)) return res.status(404).json({ error: { message: 'Workout not found' } });
    const updated = await ChallengeWorkout.findById(workoutId);
    return res.json({ workout: updated });
  } catch (e) {
    next(e);
  }
};

export const listCaptainApplications = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    if (!(await canManageChallenge({ user: req.user, classId }))) {
      const mine = await ChallengeCaptainApplication.findByClassAndUser(classId, req.user.id);
      // Return only current user's record if non-manager; do not expose full applicant list.
      return res.json({ applications: mine ? [mine] : [] });
    }
    const applications = await ChallengeCaptainApplication.listByClass(classId);
    return res.json({ applications });
  } catch (e) {
    next(e);
  }
};

export const applyForCaptain = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    const klass = access.class;
    const isOpen = klass?.captain_application_open === 1 || klass?.captain_application_open === true;
    const finalized = klass?.captains_finalized === 1 || klass?.captains_finalized === true;
    if (finalized || !isOpen) {
      return res.status(400).json({ error: { message: 'Captain applications are currently closed for this season' } });
    }
    const [membership] = await pool.execute(
      `SELECT 1
       FROM learning_class_provider_memberships
       WHERE learning_class_id = ? AND provider_user_id = ? AND membership_status IN ('active','completed')
       LIMIT 1`,
      [classId, req.user.id]
    );
    if (!membership?.length) {
      return res.status(403).json({ error: { message: 'Join the season before applying for captain' } });
    }
    const participationAcceptance = await ensureChallengeParticipationAgreementAccepted({
      klass,
      userId: req.user.id
    });
    if (!participationAcceptance.ok) {
      return res.status(participationAcceptance.status).json({ error: { message: participationAcceptance.message } });
    }
    const application = await ChallengeCaptainApplication.upsertPending({
      learningClassId: classId,
      userId: req.user.id,
      applicationText: req.body?.applicationText ? String(req.body.applicationText) : null
    });
    return res.status(201).json({ application });
  } catch (e) {
    next(e);
  }
};

export const reviewCaptainApplication = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const applicationId = asInt(req.params.applicationId);
    if (!classId || !applicationId) return res.status(400).json({ error: { message: 'Invalid classId/applicationId' } });
    if (!(await canManageChallenge({ user: req.user, classId }))) return res.status(403).json({ error: { message: 'Manage access required' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    const app = await ChallengeCaptainApplication.findById(applicationId);
    if (!app || Number(app.learning_class_id) !== Number(classId)) {
      return res.status(404).json({ error: { message: 'Captain application not found' } });
    }
    const reviewed = await ChallengeCaptainApplication.review({
      id: applicationId,
      status: req.body?.status,
      managerNotes: req.body?.managerNotes || null,
      reviewedByUserId: req.user.id
    });
    if (!reviewed) return res.status(400).json({ error: { message: 'status must be approved or rejected' } });
    return res.json({ application: reviewed });
  } catch (e) {
    next(e);
  }
};

export const finalizeCaptains = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    if (!(await canManageChallenge({ user: req.user, classId }))) return res.status(403).json({ error: { message: 'Manage access required' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    await pool.execute(
      `UPDATE learning_program_classes
       SET captains_finalized = 1, captain_application_open = 0
       WHERE id = ?`,
      [classId]
    );
    return res.json({ finalized: true });
  } catch (e) {
    next(e);
  }
};

export const getTeamWeeklyProgress = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });

    const seasonSettingsForWeek = parseJsonObject(access.class?.season_settings_json || {});
    const scheduleWeek = parseJsonObject(seasonSettingsForWeek?.schedule || {});
    const weekCutoffTime = String(scheduleWeek?.weekEndsSundayAt || access.class?.week_start_time || '00:00');
    const weekTimeZone = String(scheduleWeek?.weekTimeZone || 'UTC');
    const weekStart = req.query.weekStart || req.query.week || getWeekStartDate(new Date(), weekCutoffTime, weekTimeZone);
    const range = getWeekDateTimeRange(String(weekStart).slice(0, 10), weekCutoffTime, weekTimeZone);
    if (!range) return res.status(400).json({ error: { message: 'Invalid weekStart' } });
    const startStr = range.start;
    const endStr = range.end;

    const seasonSettings = parseJsonObject(access.class?.season_settings_json || {});
    const eventCategory = String(seasonSettings?.event?.category || 'run_ruck').toLowerCase();
    const participation = parseJsonObject(seasonSettings?.participation || {});
    let individualMinimum = access.class?.individual_min_points_per_week != null
      ? Number.parseInt(access.class.individual_min_points_per_week, 10)
      : null;
    let teamMinimum = access.class?.team_min_points_per_week != null
      ? Number.parseInt(access.class.team_min_points_per_week, 10)
      : null;
    let metricUnit = 'pts';
    let metricField = 'weekly_points';
    if (eventCategory === 'run_ruck') {
      const cutoff = String(seasonSettings?.schedule?.weekEndsSundayAt || access.class?.week_start_time || '00:00');
      const tz = String(seasonSettings?.schedule?.weekTimeZone || 'UTC');
      const baseMiles = Number(participation.runRuckStartMilesPerPerson ?? 0) || 0;
      const weeklyIncrease = Number(participation.runRuckWeeklyIncreaseMilesPerPerson ?? 2) || 0;
      const baselineMembers = Math.max(0, Number.parseInt(participation.baselineMemberCount, 10) || 0);
      const anchorWeek = access.class?.starts_at
        ? getWeekStartDate(new Date(access.class.starts_at), cutoff, tz)
        : String(weekStart || '').slice(0, 10);
      const startAnchor = new Date(`${String(anchorWeek).slice(0, 10)}T00:00:00`);
      const currentWeek = new Date(`${String(weekStart).slice(0, 10)}T00:00:00`);
      const weekIndex = Math.max(0, Math.floor((currentWeek.getTime() - startAnchor.getTime()) / (7 * 24 * 60 * 60 * 1000)));
      individualMinimum = Number((baseMiles + (weekIndex * weeklyIncrease)).toFixed(2));
      teamMinimum = Number((individualMinimum * baselineMembers).toFixed(2));
      metricUnit = 'mi';
      metricField = 'weekly_miles';
    }

    const [rows] = await pool.execute(
      `SELECT
         t.id AS team_id,
         t.team_name,
         u.id AS user_id,
         u.first_name,
         u.last_name,
         COALESCE(SUM(w.points), 0) AS weekly_points,
         COALESCE(SUM(w.distance_value), 0) AS weekly_miles
       FROM challenge_teams t
       INNER JOIN challenge_team_members tm ON tm.team_id = t.id
       INNER JOIN users u ON u.id = tm.provider_user_id
       LEFT JOIN challenge_workouts w
         ON w.learning_class_id = t.learning_class_id
         AND w.user_id = tm.provider_user_id
         AND (w.is_disqualified IS NULL OR w.is_disqualified = 0)
         AND w.completed_at >= ?
         AND w.completed_at < ?
       WHERE t.learning_class_id = ?
       GROUP BY t.id, t.team_name, u.id, u.first_name, u.last_name
       ORDER BY t.team_name ASC, weekly_points DESC, u.last_name ASC, u.first_name ASC`,
      [startStr, endStr, classId]
    );

    const teamsMap = new Map();
    for (const r of rows || []) {
      const tid = Number(r.team_id);
      if (!teamsMap.has(tid)) {
        teamsMap.set(tid, {
          teamId: tid,
          teamName: r.team_name,
          totalWeeklyPoints: 0,
          members: []
        });
      }
      const metricValue = Number(r[metricField] || 0);
      const progressStatus = individualMinimum == null
        ? 'tracking'
        : (metricValue < individualMinimum ? 'behind' : metricValue === individualMinimum ? 'met' : 'ahead');
      const entry = teamsMap.get(tid);
      entry.totalWeeklyPoints += Number(r.weekly_points || 0);
      entry.totalWeeklyMiles = Number((entry.totalWeeklyMiles || 0) + Number(r.weekly_miles || 0));
      entry.members.push({
        userId: Number(r.user_id),
        firstName: r.first_name,
        lastName: r.last_name,
        weeklyPoints: Number(r.weekly_points || 0),
        weeklyMiles: Number(r.weekly_miles || 0),
        progressStatus
      });
    }

    return res.json({
      weekStartDate: String(weekStart).slice(0, 10),
      individualMinimum,
      teamMinimum,
      metricUnit,
      teams: Array.from(teamsMap.values())
    });
  } catch (e) {
    next(e);
  }
};

export const listChallengeMessages = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    const limit = Math.min(100, asInt(req.query.limit) || 50);
    const offset = asInt(req.query.offset) || 0;
    const scope = String(req.query.scope || 'season').toLowerCase() === 'team' ? 'team' : 'season';
    let teamId = req.query.teamId ? asInt(req.query.teamId) : null;
    if (scope === 'team' && !teamId) {
      const team = await ChallengeTeam.getTeamForUser(classId, req.user.id);
      teamId = team?.id || null;
    }
    const messages = await ChallengeMessage.listByChallenge(classId, { limit, offset, scope, teamId });
    const newestId = messages?.length ? Number(messages[0].id) : null;
    await ChallengeMessage.markRead({
      learningClassId: classId,
      userId: req.user.id,
      scope,
      teamId: teamId || 0,
      lastReadMessageId: newestId
    });
    return res.json({ scope, teamId: teamId || null, messages });
  } catch (e) {
    next(e);
  }
};

export const postChallengeMessage = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const messageText = String(req.body?.messageText || '').trim();
    if (!classId || !messageText) return res.status(400).json({ error: { message: 'classId and messageText required' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    const [membership] = await pool.execute(
      `SELECT 1
       FROM learning_class_provider_memberships
       WHERE learning_class_id = ? AND provider_user_id = ? AND membership_status IN ('active','completed')
       LIMIT 1`,
      [classId, req.user.id]
    );
    if (!membership?.length && !(await canManageChallenge({ user: req.user, classId }))) {
      return res.status(403).json({ error: { message: 'Join the season before posting messages' } });
    }
    if (membership?.length) {
      const participationAcceptance = await ensureChallengeParticipationAgreementAccepted({
        klass: access.class,
        userId: req.user.id
      });
      if (!participationAcceptance.ok) {
        return res.status(participationAcceptance.status).json({ error: { message: participationAcceptance.message } });
      }
    }
    const scope = String(req.body?.scope || 'season').toLowerCase() === 'team' ? 'team' : 'season';
    let teamId = null;
    if (scope === 'team') {
      teamId = req.body.teamId ? asInt(req.body.teamId) : null;
      if (!teamId) {
        const team = await ChallengeTeam.getTeamForUser(classId, req.user.id);
        teamId = team?.id || null;
      }
      if (!teamId) {
        return res.status(400).json({ error: { message: 'Join a team before posting in team chat' } });
      }
    }
    const message = await ChallengeMessage.create({
      learningClassId: classId,
      userId: req.user.id,
      teamId,
      messageText
    });
    try {
      await challengeMessageBridge.postMessageToChannel({
        learningClassId: classId,
        teamId,
        userId: req.user.id,
        messageId: message?.id,
        text: messageText
      });
    } catch {
      // Non-blocking bridge integration.
    }
    return res.status(201).json({ message });
  } catch (e) {
    next(e);
  }
};

export const getChallengeMessageUnreadCounts = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    let teamId = 0;
    const team = await ChallengeTeam.getTeamForUser(classId, req.user.id);
    teamId = team?.id || 0;
    const unread = await ChallengeMessage.getUnreadCounts({
      learningClassId: classId,
      userId: req.user.id,
      teamId
    });
    return res.json({ ...unread, teamId: teamId || null });
  } catch (e) {
    next(e);
  }
};

export const deleteChallengeMessage = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const messageId = asInt(req.params.messageId);
    if (!classId || !messageId) return res.status(400).json({ error: { message: 'Invalid classId/messageId' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    const message = await ChallengeMessage.findById(messageId);
    if (!message || Number(message.learning_class_id) !== Number(classId) || message.deleted_at) {
      return res.status(404).json({ error: { message: 'Message not found' } });
    }
    const canDelete = (await canManageChallenge({ user: req.user, classId })) || Number(message.user_id) === Number(req.user.id);
    if (!canDelete) return res.status(403).json({ error: { message: 'Access denied' } });
    await ChallengeMessage.softDelete(messageId, req.user.id);
    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const pinChallengeMessage = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const messageId = asInt(req.params.messageId);
    if (!classId || !messageId) return res.status(400).json({ error: { message: 'Invalid classId/messageId' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    if (!(await canManageChallenge({ user: req.user, classId }))) return res.status(403).json({ error: { message: 'Manage access required' } });
    const message = await ChallengeMessage.findById(messageId);
    if (!message || Number(message.learning_class_id) !== Number(classId) || message.deleted_at) {
      return res.status(404).json({ error: { message: 'Message not found' } });
    }
    const pinned = req.body?.pinned !== false;
    const updated = await ChallengeMessage.pin(messageId, pinned, req.user.id);
    return res.json({ message: updated });
  } catch (e) {
    next(e);
  }
};

export const listWorkoutComments = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const workoutId = asInt(req.params.workoutId);
    if (!classId || !workoutId) return res.status(400).json({ error: { message: 'Invalid classId/workoutId' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    const workout = await ChallengeWorkout.findById(workoutId);
    if (!workout || Number(workout.learning_class_id) !== Number(classId)) {
      return res.status(404).json({ error: { message: 'Workout not found' } });
    }
    const comments = await ChallengeWorkoutComment.listByWorkout(workoutId);
    return res.json({ comments });
  } catch (e) {
    next(e);
  }
};

export const postWorkoutComment = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const workoutId = asInt(req.params.workoutId);
    const commentText = String(req.body?.commentText || '').trim();
    if (!classId || !workoutId || !commentText) return res.status(400).json({ error: { message: 'classId, workoutId, and commentText required' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    const workout = await ChallengeWorkout.findById(workoutId);
    if (!workout || Number(workout.learning_class_id) !== Number(classId)) {
      return res.status(404).json({ error: { message: 'Workout not found' } });
    }
    const participationAcceptance = await ensureChallengeParticipationAgreementAccepted({
      klass: access.class,
      userId: req.user.id
    });
    if (!participationAcceptance.ok) {
      return res.status(participationAcceptance.status).json({ error: { message: participationAcceptance.message } });
    }
    const comment = await ChallengeWorkoutComment.create({
      workoutId,
      learningClassId: classId,
      userId: req.user.id,
      commentText
    });
    return res.status(201).json({ comment });
  } catch (e) {
    next(e);
  }
};

export const deleteWorkoutComment = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const commentId = asInt(req.params.commentId);
    if (!classId || !commentId) return res.status(400).json({ error: { message: 'Invalid classId/commentId' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    const comment = await ChallengeWorkoutComment.findById(commentId);
    if (!comment || Number(comment.learning_class_id) !== Number(classId)) {
      return res.status(404).json({ error: { message: 'Comment not found' } });
    }
    const canDelete = Number(comment.user_id) === Number(req.user.id) || (await canManageChallenge({ user: req.user, classId }));
    if (!canDelete) return res.status(403).json({ error: { message: 'Access denied' } });
    await ChallengeWorkoutComment.remove(commentId);
    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /:classId/workouts/scan-screenshot
 * Multer handles the multipart upload; Google Vision OCR extracts workout data.
 * Returns extracted fields for the frontend to pre-fill the form.
 * Does NOT create a workout — the user reviews and submits separately.
 */
export const scanWorkoutScreenshot = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: 'Access denied' } });
    if (!req.file) return res.status(400).json({ error: { message: 'No image file uploaded' } });

    // Store the file path so it can be referenced after the user submits the workout
    const filePath = `challenge_workouts/${req.file.filename}`;
    const baseUrl = process.env.BACKEND_URL || '';

    // Attempt Vision scan — gracefully degrade if not configured
    let extracted = {};
    let rawText = null;
    let confidence = 0;
    const visionEnabled = String(process.env.GOOGLE_VISION_ENABLED || '').trim() === '1';

    if (visionEnabled) {
      try {
        const fs = await import('fs');
        const fileBuffer = fs.readFileSync(req.file.path);
        const { scanWorkoutScreenshot: visionScan } = await import('../services/challengeWorkoutVision.service.js');
        const result = await visionScan({ fileBuffer, mimeType: req.file.mimetype });
        extracted = result.extracted;
        rawText = result.rawText;
        confidence = result.confidence;
      } catch (visionErr) {
        // Vision failed but we still return the uploaded file path
        rawText = null;
        confidence = 0;
      }
    }

    return res.json({
      filePath,
      fileUrl: `${baseUrl}/uploads/${filePath}`,
      extracted,
      rawText,
      confidence,
      visionEnabled
    });
  } catch (e) {
    next(e);
  }
};

export const uploadWorkoutMedia = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const workoutId = asInt(req.params.workoutId);
    if (!classId || !workoutId) return res.status(400).json({ error: { message: 'Invalid classId/workoutId' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    const workout = await ChallengeWorkout.findById(workoutId);
    if (!workout || Number(workout.learning_class_id) !== Number(classId)) {
      return res.status(404).json({ error: { message: 'Workout not found' } });
    }
    if (!req.file) return res.status(400).json({ error: { message: 'file is required' } });
    const participationAcceptance = await ensureChallengeParticipationAgreementAccepted({
      klass: access.class,
      userId: req.user.id
    });
    if (!participationAcceptance.ok) {
      return res.status(participationAcceptance.status).json({ error: { message: participationAcceptance.message } });
    }
    const filePath = `challenge_workouts/${req.file.filename}`;
    const mime = String(req.file.mimetype || '').toLowerCase();
    const mediaType = mime.includes('gif') ? 'gif' : 'image';
    const media = await ChallengeWorkoutMedia.create({
      workoutId,
      learningClassId: classId,
      userId: req.user.id,
      mediaType,
      filePath
    });
    try {
      await enqueueWorkoutVision({
        workoutId,
        learningClassId: classId,
        userId: req.user.id,
        screenshotFilePath: filePath,
        workoutNotes: null
      });
    } catch {
      // Non-blocking async hook.
    }
    // Auto-link uploaded workout media to user photo album.
    pool.execute(
      `INSERT IGNORE INTO user_photos (user_id, file_path, source, source_ref_id, is_profile)
       VALUES (?, ?, 'workout_media', ?, 0)`,
      [req.user.id, filePath, media?.id || null]
    ).catch(() => {});
    return res.status(201).json({ media });
  } catch (e) {
    next(e);
  }
};
