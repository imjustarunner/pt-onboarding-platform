/**
 * Summit Stats Challenge controller
 * Teams, workouts, leaderboards, activity feed.
 * Challenges are learning_program_classes; UI displays as "Challenges".
 */
import pool from '../config/database.js';
import ChallengeTeam from '../models/ChallengeTeam.model.js';
import ChallengeWorkout from '../models/ChallengeWorkout.model.js';
import ChallengeCaptainApplication from '../models/ChallengeCaptainApplication.model.js';
import ChallengeMessage from '../models/ChallengeMessage.model.js';
import ChallengeWorkoutComment from '../models/ChallengeWorkoutComment.model.js';
import ChallengeWorkoutMedia from '../models/ChallengeWorkoutMedia.model.js';
import { canManageTeam } from '../utils/challengePermissions.js';
import { canAccessChallenge } from '../utils/challengeAccess.js';
import { getWeekStartDate } from '../utils/challengeWeekUtils.js';
import { enqueueWorkoutVision } from '../services/challengeWorkoutVision.service.js';
import { challengeMessageBridge } from '../services/challengeMessageBridge.service.js';

const asInt = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

const canManageChallenge = (role) => {
  const r = String(role || '').toLowerCase();
  return r === 'super_admin' || r === 'admin' || r === 'support' || r === 'staff' || r === 'clinical_practice_assistant' || r === 'provider_plus';
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
    if (!canManageChallenge(req.user?.role)) return res.status(403).json({ error: { message: 'Manage access required' } });
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
    const canManage = canManageChallenge(req.user?.role) || canManageTeam(req.user, team);
    if (!canManage) return res.status(403).json({ error: { message: 'Access denied' } });
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
    if (!canManageChallenge(req.user?.role)) return res.status(403).json({ error: { message: 'Manage access required' } });
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
    const canManage = canManageChallenge(req.user?.role) || canManageTeam(req.user, team);
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
       WHERE w.user_id = ? AND m.membership_status IN ('active','completed')${orgFilter}`,
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
       WHERE w.user_id = ? AND pm.membership_status IN ('active','completed')${orgFilter}
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
    // Verify user is a provider member
    const [pm] = await pool.execute(
      `SELECT 1 FROM learning_class_provider_memberships WHERE learning_class_id = ? AND provider_user_id = ? AND membership_status IN ('active','completed') LIMIT 1`,
      [classId, req.user.id]
    );
    if (!pm?.length) return res.status(403).json({ error: { message: 'You must be a season participant to submit workouts' } });
    let teamId = req.body.teamId ? asInt(req.body.teamId) : null;
    if (!teamId) {
      const team = await ChallengeTeam.getTeamForUser(classId, req.user.id);
      teamId = team?.id || null;
    }
    const points = asInt(req.body.points) || 0;
    const completedAt = req.body.completedAt ? new Date(req.body.completedAt) : new Date();
    const workout = await ChallengeWorkout.create({
      learningClassId: classId,
      teamId,
      userId: req.user.id,
      activityType,
      distanceValue: req.body.distanceValue != null ? Number(req.body.distanceValue) : null,
      durationMinutes: req.body.durationMinutes != null ? asInt(req.body.durationMinutes) : null,
      points,
      workoutNotes: req.body.workoutNotes ? String(req.body.workoutNotes).trim() : null,
      screenshotFilePath: req.body.screenshotFilePath ? String(req.body.screenshotFilePath).trim() : null,
      completedAt: completedAt.toISOString().slice(0, 19).replace('T', ' ')
    });
    if (workout?.id) {
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
    }
    return res.status(201).json({ workout });
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
    if (!canManageChallenge(req.user?.role)) {
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
    if (!canManageChallenge(req.user?.role)) return res.status(403).json({ error: { message: 'Manage access required' } });
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
    if (!canManageChallenge(req.user?.role)) return res.status(403).json({ error: { message: 'Manage access required' } });
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

    const weekStart = req.query.weekStart || req.query.week || getWeekStartDate(new Date());
    const start = new Date(String(weekStart).slice(0, 10));
    if (!Number.isFinite(start.getTime())) return res.status(400).json({ error: { message: 'Invalid weekStart' } });
    const startStr = start.toISOString().slice(0, 10);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const endStr = end.toISOString().slice(0, 10);

    const individualMinimum = access.class?.individual_min_points_per_week != null
      ? Number.parseInt(access.class.individual_min_points_per_week, 10)
      : null;

    const [rows] = await pool.execute(
      `SELECT
         t.id AS team_id,
         t.team_name,
         u.id AS user_id,
         u.first_name,
         u.last_name,
         COALESCE(SUM(w.points), 0) AS weekly_points
       FROM challenge_teams t
       INNER JOIN challenge_team_members tm ON tm.team_id = t.id
       INNER JOIN users u ON u.id = tm.provider_user_id
       LEFT JOIN challenge_workouts w
         ON w.learning_class_id = t.learning_class_id
         AND w.user_id = tm.provider_user_id
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
      const points = Number(r.weekly_points || 0);
      const progressStatus = individualMinimum == null
        ? 'tracking'
        : (points < individualMinimum ? 'behind' : points === individualMinimum ? 'met' : 'ahead');
      const entry = teamsMap.get(tid);
      entry.totalWeeklyPoints += points;
      entry.members.push({
        userId: Number(r.user_id),
        firstName: r.first_name,
        lastName: r.last_name,
        weeklyPoints: points,
        progressStatus
      });
    }

    return res.json({
      weekStartDate: startStr,
      individualMinimum,
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
    const messages = await ChallengeMessage.listByChallenge(classId, { limit, offset });
    return res.json({ messages });
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
    if (!membership?.length && !canManageChallenge(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Join the season before posting messages' } });
    }
    let teamId = req.body.teamId ? asInt(req.body.teamId) : null;
    if (!teamId) {
      const team = await ChallengeTeam.getTeamForUser(classId, req.user.id);
      teamId = team?.id || null;
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
    const canDelete = Number(comment.user_id) === Number(req.user.id) || canManageChallenge(req.user?.role);
    if (!canDelete) return res.status(403).json({ error: { message: 'Access denied' } });
    await ChallengeWorkoutComment.remove(commentId);
    return res.json({ ok: true });
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
    return res.status(201).json({ media });
  } catch (e) {
    next(e);
  }
};
