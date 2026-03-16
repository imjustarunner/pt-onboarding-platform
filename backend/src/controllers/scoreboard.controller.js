/**
 * Summit Stats Challenge: Scoreboard, Elimination, Weekly Tasks
 * Weekly scoreboard (top 5 athletes, top 5 teams, top per team), elimination board, weekly challenges.
 */
import pool from '../config/database.js';
import LearningProgramClass from '../models/LearningProgramClass.model.js';
import ChallengeTeam from '../models/ChallengeTeam.model.js';
import ChallengeWorkout from '../models/ChallengeWorkout.model.js';
import ChallengeWeeklyTask from '../models/ChallengeWeeklyTask.model.js';
import ChallengeWeeklyAssignment from '../models/ChallengeWeeklyAssignment.model.js';
import ChallengeElimination from '../models/ChallengeElimination.model.js';
import { getWeekStartDate } from '../utils/challengeWeekUtils.js';
import { canAccessChallenge } from '../utils/challengeAccess.js';

const asInt = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

const canManageChallenge = (role) => {
  const r = String(role || '').toLowerCase();
  return ['super_admin', 'admin', 'support', 'staff', 'clinical_practice_assistant', 'provider_plus'].includes(r);
};

const getAccess = async (req, classId) => {
  const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
  if (!access.ok) {
    if (access.eliminated) return { status: 403, message: 'You have been eliminated from this challenge.' };
    return { status: 403, message: 'Access denied' };
  }
  return { ok: true, class: access.class };
};

export const getScoreboard = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const weekParam = req.query.week || req.query.weekStart;
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const access = await getAccess(req, classId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    const weekStart = weekParam ? String(weekParam).slice(0, 10) : getWeekStartDate(new Date());
    const [cached] = await pool.execute(
      `SELECT snapshot_json, posted_at FROM challenge_weekly_scoreboard WHERE learning_class_id = ? AND week_start_date = ? LIMIT 1`,
      [classId, weekStart]
    );
    if (cached?.length) {
      const snap = cached[0];
      let data;
      try {
        data = typeof snap.snapshot_json === 'string' ? JSON.parse(snap.snapshot_json) : snap.snapshot_json;
      } catch {
        data = {};
      }
      return res.json({ weekStartDate: weekStart, postedAt: snap.posted_at, ...data });
    }
    const top5Athletes = (await ChallengeWorkout.getWeeklyLeaderboard(classId, weekStart, { limit: 5 }))
      .map((r) => ({ user_id: r.user_id, first_name: r.first_name, last_name: r.last_name, team_name: r.team_name, total_points: Number(r.total_points) }));
    const top5Teams = (await ChallengeWorkout.getWeeklyTeamLeaderboard(classId, weekStart, { limit: 5 }))
      .map((r) => ({ team_id: r.team_id, team_name: r.team_name, total_points: Number(r.total_points) }));
    const topPerTeam = (await ChallengeWorkout.getWeeklyTopPerTeam(classId, weekStart))
      .map((r) => ({ user_id: r.user_id, first_name: r.first_name, last_name: r.last_name, team_id: r.team_id, team_name: r.team_name, total_points: Number(r.total_points) }));
    const [klassRows] = await pool.execute(`SELECT masters_age_threshold, recognition_categories_json FROM learning_program_classes WHERE id = ?`, [classId]);
    const klass = klassRows?.[0];
    const categories = Array.isArray(klass?.recognition_categories_json) ? klass.recognition_categories_json : (typeof klass?.recognition_categories_json === 'string' ? (() => { try { return JSON.parse(klass.recognition_categories_json); } catch { return []; } })() : []);
    const mastersThreshold = klass?.masters_age_threshold != null ? asInt(klass.masters_age_threshold) : 53;
    const recognitionOfTheWeek = {};
    if (categories.includes('fastest_male')) {
      const r = await ChallengeWorkout.getWeeklyLeaderByGender(classId, weekStart, { gender: 'male' });
      if (r) recognitionOfTheWeek.fastest_male = { user_id: r.user_id, first_name: r.first_name, last_name: r.last_name, team_name: r.team_name, total_points: Number(r.total_points) };
    }
    if (categories.includes('fastest_female')) {
      const r = await ChallengeWorkout.getWeeklyLeaderByGender(classId, weekStart, { gender: 'female' });
      if (r) recognitionOfTheWeek.fastest_female = { user_id: r.user_id, first_name: r.first_name, last_name: r.last_name, team_name: r.team_name, total_points: Number(r.total_points) };
    }
    if (categories.includes('fastest_masters_male')) {
      const r = await ChallengeWorkout.getWeeklyMastersLeader(classId, weekStart, { gender: 'male', ageThreshold: mastersThreshold });
      if (r) recognitionOfTheWeek.fastest_masters_male = { user_id: r.user_id, first_name: r.first_name, last_name: r.last_name, team_name: r.team_name, total_points: Number(r.total_points) };
    }
    if (categories.includes('fastest_masters_female')) {
      const r = await ChallengeWorkout.getWeeklyMastersLeader(classId, weekStart, { gender: 'female', ageThreshold: mastersThreshold });
      if (r) recognitionOfTheWeek.fastest_masters_female = { user_id: r.user_id, first_name: r.first_name, last_name: r.last_name, team_name: r.team_name, total_points: Number(r.total_points) };
    }
    return res.json({
      weekStartDate: weekStart,
      postedAt: null,
      top5Athletes,
      top5Teams,
      topPerTeam,
      recognitionOfTheWeek: Object.keys(recognitionOfTheWeek).length ? recognitionOfTheWeek : undefined
    });
  } catch (e) {
    next(e);
  }
};

export const getEliminationBoard = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const weekParam = req.query.week || req.query.weekStart;
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const access = await getAccess(req, classId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    const weekStart = weekParam ? String(weekParam).slice(0, 10) : null;
    const eliminations = weekStart
      ? await ChallengeElimination.listByWeek(classId, weekStart)
      : await ChallengeElimination.listAll(classId);
    return res.json({ weekStartDate: weekStart, eliminations });
  } catch (e) {
    next(e);
  }
};

export const listWeeklyTasks = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const weekParam = req.query.week || req.query.weekStart;
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const access = await getAccess(req, classId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    const weekStart = weekParam ? String(weekParam).slice(0, 10) : getWeekStartDate(new Date());
    const tasks = await ChallengeWeeklyTask.listByWeek(classId, weekStart);
    return res.json({ weekStartDate: weekStart, tasks });
  } catch (e) {
    next(e);
  }
};

export const createWeeklyTasks = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const tasks = Array.isArray(req.body.tasks) ? req.body.tasks : [];
    const weekParam = req.body.week || req.body.weekStart;
    if (!classId || !tasks.length) return res.status(400).json({ error: { message: 'classId and tasks (array of 3) required' } });
    if (!canManageChallenge(req.user?.role)) return res.status(403).json({ error: { message: 'Manage access required' } });
    const access = await getAccess(req, classId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    const weekStart = weekParam ? String(weekParam).slice(0, 10) : getWeekStartDate(new Date());
    await ChallengeWeeklyTask.deleteByWeek(classId, weekStart);
    const created = await ChallengeWeeklyTask.createBatch(classId, weekStart, tasks.slice(0, 3));
    return res.status(201).json({ weekStartDate: weekStart, tasks: created });
  } catch (e) {
    next(e);
  }
};

export const listWeeklyAssignments = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const weekParam = req.query.week || req.query.weekStart;
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const access = await getAccess(req, classId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    const weekStart = weekParam ? String(weekParam).slice(0, 10) : getWeekStartDate(new Date());
    const assignments = await ChallengeWeeklyAssignment.listByWeek(classId, weekStart);
    return res.json({ weekStartDate: weekStart, assignments });
  } catch (e) {
    next(e);
  }
};

export const upsertWeeklyAssignment = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const { taskId, teamId, providerUserId, volunteered } = req.body;
    if (!classId || !taskId || !teamId || !providerUserId) {
      return res.status(400).json({ error: { message: 'taskId, teamId, providerUserId required' } });
    }
    const task = await ChallengeWeeklyTask.findById(taskId);
    if (!task || Number(task.learning_class_id) !== Number(classId)) {
      return res.status(404).json({ error: { message: 'Task not found' } });
    }
    const team = await ChallengeTeam.findById(teamId);
    if (!team || Number(team.learning_class_id) !== Number(classId)) {
      return res.status(404).json({ error: { message: 'Team not found' } });
    }
    const isCaptain = team.team_manager_user_id && Number(team.team_manager_user_id) === Number(req.user.id);
    const isSelf = Number(providerUserId) === Number(req.user.id);
    if (!canManageChallenge(req.user?.role) && !isCaptain && !(isSelf && volunteered)) {
      return res.status(403).json({ error: { message: 'Only captain can assign; you can volunteer for yourself' } });
    }
    const access = await getAccess(req, classId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    const assignment = await ChallengeWeeklyAssignment.assign({
      taskId,
      teamId,
      providerUserId,
      assignedByUserId: isCaptain || canManageChallenge(req.user?.role) ? req.user.id : null,
      volunteered: !!volunteered
    });
    return res.json({ assignment });
  } catch (e) {
    next(e);
  }
};

export const completeWeeklyChallenge = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const assignmentId = asInt(req.params.assignmentId);
    if (!classId || !assignmentId) return res.status(400).json({ error: { message: 'Invalid assignmentId' } });
    const assignment = await ChallengeWeeklyAssignment.findById(assignmentId);
    if (!assignment) return res.status(404).json({ error: { message: 'Assignment not found' } });
    const task = await ChallengeWeeklyTask.findById(assignment.task_id);
    if (!task || Number(task.learning_class_id) !== Number(classId)) {
      return res.status(404).json({ error: { message: 'Assignment not found' } });
    }
    if (Number(assignment.provider_user_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: { message: 'Only the assigned person can mark this challenge complete' } });
    }
    const access = await getAccess(req, classId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    await ChallengeWeeklyAssignment.markCompleted(assignmentId, {
      completedAt: req.body.completedAt || null,
      notes: req.body.notes || req.body.completionNotes || null,
      attachmentPath: req.body.attachmentPath || null
    });
    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const closeWeek = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const weekParam = req.body.week || req.body.weekStart;
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    if (!canManageChallenge(req.user?.role)) return res.status(403).json({ error: { message: 'Manage access required' } });
    const access = await getAccess(req, classId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    const klass = access.class;
    const weekStart = weekParam ? String(weekParam).slice(0, 10) : getWeekStartDate(new Date());
    const teamMin = klass.team_min_points_per_week != null ? asInt(klass.team_min_points_per_week) : null;
    const indMin = klass.individual_min_points_per_week != null ? asInt(klass.individual_min_points_per_week) : null;

    const top5Athletes = (await ChallengeWorkout.getWeeklyLeaderboard(classId, weekStart, { limit: 5 }))
      .map((r) => ({ user_id: r.user_id, first_name: r.first_name, last_name: r.last_name, team_name: r.team_name, total_points: Number(r.total_points) }));
    const top5Teams = (await ChallengeWorkout.getWeeklyTeamLeaderboard(classId, weekStart, { limit: 5 }))
      .map((r) => ({ team_id: r.team_id, team_name: r.team_name, total_points: Number(r.total_points) }));
    const topPerTeam = (await ChallengeWorkout.getWeeklyTopPerTeam(classId, weekStart))
      .map((r) => ({ user_id: r.user_id, first_name: r.first_name, last_name: r.last_name, team_id: r.team_id, team_name: r.team_name, total_points: Number(r.total_points) }));

    const categories = Array.isArray(klass.recognition_categories_json) ? klass.recognition_categories_json : (typeof klass.recognition_categories_json === 'string' ? (() => { try { return JSON.parse(klass.recognition_categories_json); } catch { return []; } })() : []);
    const mastersThreshold = klass.masters_age_threshold != null ? asInt(klass.masters_age_threshold) : 53;
    const recognitionOfTheWeek = {};
    if (categories.includes('fastest_male')) {
      const r = await ChallengeWorkout.getWeeklyLeaderByGender(classId, weekStart, { gender: 'male' });
      if (r) recognitionOfTheWeek.fastest_male = { user_id: r.user_id, first_name: r.first_name, last_name: r.last_name, team_name: r.team_name, total_points: Number(r.total_points) };
    }
    if (categories.includes('fastest_female')) {
      const r = await ChallengeWorkout.getWeeklyLeaderByGender(classId, weekStart, { gender: 'female' });
      if (r) recognitionOfTheWeek.fastest_female = { user_id: r.user_id, first_name: r.first_name, last_name: r.last_name, team_name: r.team_name, total_points: Number(r.total_points) };
    }
    if (categories.includes('fastest_masters_male')) {
      const r = await ChallengeWorkout.getWeeklyMastersLeader(classId, weekStart, { gender: 'male', ageThreshold: mastersThreshold });
      if (r) recognitionOfTheWeek.fastest_masters_male = { user_id: r.user_id, first_name: r.first_name, last_name: r.last_name, team_name: r.team_name, total_points: Number(r.total_points) };
    }
    if (categories.includes('fastest_masters_female')) {
      const r = await ChallengeWorkout.getWeeklyMastersLeader(classId, weekStart, { gender: 'female', ageThreshold: mastersThreshold });
      if (r) recognitionOfTheWeek.fastest_masters_female = { user_id: r.user_id, first_name: r.first_name, last_name: r.last_name, team_name: r.team_name, total_points: Number(r.total_points) };
    }

    const snapshotData = { top5Athletes, top5Teams, topPerTeam };
    if (Object.keys(recognitionOfTheWeek).length) snapshotData.recognitionOfTheWeek = recognitionOfTheWeek;

    await pool.execute(
      `INSERT INTO challenge_weekly_scoreboard (learning_class_id, week_start_date, snapshot_json, posted_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE snapshot_json = VALUES(snapshot_json), posted_at = VALUES(posted_at)`,
      [classId, weekStart, JSON.stringify(snapshotData)]
    );

    const eliminations = [];
    const [members] = await pool.execute(
      `SELECT pm.provider_user_id FROM learning_class_provider_memberships pm
       WHERE pm.learning_class_id = ? AND pm.membership_status IN ('active','completed')`,
      [classId]
    );
    const assignments = await ChallengeWeeklyAssignment.listByWeek(classId, weekStart);
    const completedByUser = new Set(
      assignments.filter((a) => a.is_completed).map((a) => Number(a.provider_user_id))
    );
    for (const m of members || []) {
      const pid = m.provider_user_id;
      if (await ChallengeElimination.isEliminated(classId, pid)) continue;
      let pointsFailed = false;
      let challengeFailed = false;
      if (indMin != null) {
        const pts = await ChallengeWorkout.getWeeklyPointsForUser(classId, pid, weekStart);
        if (pts < indMin) pointsFailed = true;
      }
      const myAssignment = assignments.find((a) => Number(a.provider_user_id) === Number(pid));
      if (myAssignment && !completedByUser.has(Number(pid))) {
        challengeFailed = true;
      }
      const reason = pointsFailed && challengeFailed ? 'both' : pointsFailed ? 'points_failed' : challengeFailed ? 'challenge_not_completed' : null;
      if (reason) {
        await ChallengeElimination.create({
          learningClassId: classId,
          providerUserId: pid,
          weekStartDate: weekStart,
          reason,
          adminComment: req.body.eliminations?.[String(pid)]?.adminComment || null
        });
        eliminations.push({ providerUserId: pid, reason });
      }
    }

    return res.json({
      weekStartDate: weekStart,
      scoreboardPosted: true,
      eliminationsCount: eliminations.length
    });
  } catch (e) {
    next(e);
  }
};

export const updateEliminationComment = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const eliminationId = asInt(req.params.eliminationId);
    const adminComment = req.body.adminComment;
    if (!classId || !eliminationId) return res.status(400).json({ error: { message: 'Invalid eliminationId' } });
    if (!canManageChallenge(req.user?.role)) return res.status(403).json({ error: { message: 'Manage access required' } });
    const [rows] = await pool.execute(
      `SELECT id FROM challenge_eliminations WHERE id = ? AND learning_class_id = ? LIMIT 1`,
      [eliminationId, classId]
    );
    if (!rows?.length) return res.status(404).json({ error: { message: 'Elimination not found' } });
    await ChallengeElimination.updateAdminComment(eliminationId, adminComment);
    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};
