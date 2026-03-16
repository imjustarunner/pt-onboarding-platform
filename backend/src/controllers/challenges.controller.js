/**
 * Summit Stats Challenge controller
 * Teams, workouts, leaderboards, activity feed.
 * Challenges are learning_program_classes; UI displays as "Challenges".
 */
import pool from '../config/database.js';
import ChallengeTeam from '../models/ChallengeTeam.model.js';
import ChallengeWorkout from '../models/ChallengeWorkout.model.js';
import { canManageTeam } from '../utils/challengePermissions.js';
import { canAccessChallenge } from '../utils/challengeAccess.js';

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
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this challenge.' : 'Access denied' } });
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
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this challenge.' : 'Access denied' } });
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
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this challenge.' : 'Access denied' } });
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
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this challenge.' : 'Access denied' } });
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
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this challenge.' : 'Access denied' } });
    const limit = Math.min(100, asInt(req.query.limit) || 50);
    const offset = asInt(req.query.offset) || 0;
    const workouts = await ChallengeWorkout.listByChallenge(classId, { limit, offset });
    return res.json({ workouts });
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
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this challenge.' : 'Access denied' } });
    // Verify user is a provider member
    const [pm] = await pool.execute(
      `SELECT 1 FROM learning_class_provider_memberships WHERE learning_class_id = ? AND provider_user_id = ? AND membership_status IN ('active','completed') LIMIT 1`,
      [classId, req.user.id]
    );
    if (!pm?.length) return res.status(403).json({ error: { message: 'You must be a challenge participant to submit workouts' } });
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
    return res.status(201).json({ workout });
  } catch (e) {
    next(e);
  }
};
