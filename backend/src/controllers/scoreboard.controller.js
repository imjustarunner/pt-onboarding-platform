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

const deriveSummaryLimits = (klass) => {
  const s = parseJsonObject(klass?.season_settings_json || {});
  const rec = parseJsonObject(s.recognition || {});
  const asCount = (v, fallback) => {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return {
    weeklyTopAthletes: asCount(rec.weeklyTopAthletesCount, 5),
    weeklyTopTeams: asCount(rec.weeklyTopTeamsCount, 5),
    seasonTopIndividuals: asCount(rec.seasonTopIndividualsCount, 5),
    seasonTopMasters: asCount(rec.seasonTopMastersCount, 3),
    seasonTopLadies: asCount(rec.seasonTopLadiesCount, 3)
  };
};

const getWeekCutoffTime = (klass) => {
  const s = parseJsonObject(klass?.season_settings_json || {});
  const schedule = parseJsonObject(s.schedule || {});
  const raw = String(schedule.weekEndsSundayAt || klass?.week_start_time || '00:00').trim();
  return /^\d{1,2}:\d{2}$/.test(raw) ? raw : '00:00';
};

const buildAiWeeklyTaskDraft = ({ klass, weekStart }) => {
  const settings = parseJsonObject(klass?.season_settings_json || {});
  const event = parseJsonObject(settings.event || {});
  const scoring = parseJsonObject(settings.scoring || {});
  const schedule = parseJsonObject(settings.schedule || {});
  const rec = parseJsonObject(settings.recognition || {});
  const participation = parseJsonObject(settings.participation || {});
  const minimum = Number.parseInt(scoring.weeklyMinimumPointsPerAthlete, 10) || Number.parseInt(klass?.individual_min_points_per_week, 10) || 0;
  const teamTarget = Number.parseInt(scoring.teamWeeklyTargetPoints, 10) || Number.parseInt(participation.teamMinPointsPerWeek, 10) || Number.parseInt(klass?.team_min_points_per_week, 10) || 0;
  const metrics = Array.isArray(rec.additionalMetrics) ? rec.additionalMetrics : [];
  const cadence = String(schedule.weeklyCadence || 'weekly');
  const eventCategory = String(event.category || 'run_ruck').toLowerCase();
  const challengeMode = String(event.challengeAssignmentMode || 'volunteer_or_elect');
  const wk = String(weekStart || '').slice(0, 10);
  const cleverRunRuckNames = ['Ruck N Roll Relay', 'Trailblazer Sprint', 'Mile Hunter Mission', 'Ruck & Rise'];
  const cleverFitnessNames = ['Calorie Crush Circuit', 'Engine Ignite Session', 'Pulse Peak Builder', 'Sweat Equity Stack'];
  const nameSet = eventCategory === 'fitness' ? cleverFitnessNames : cleverRunRuckNames;
  return [
    {
      name: `${nameSet[0]} (${cadence})`,
      description: eventCategory === 'fitness'
        ? `Log fitness sessions and target calories that convert to points, pacing toward ${minimum} minimum points.`
        : `Log run/ruck mileage and stay on pace for ${minimum} minimum points this week.`
    },
    {
      name: nameSet[1],
      description: `Coordinate with your team to collectively push toward ${teamTarget || 100} points this week.`
    },
    {
      name: metrics.length
        ? `Spotlight: ${metrics[0]}`
        : nameSet[2],
      description: `Each team should ${challengeMode.includes('elect') ? 'elect' : 'volunteer'} one participant per challenge and complete assignments for week ${wk}.`
    }
  ];
};

const getAccess = async (req, classId) => {
  const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
  if (!access.ok) {
    if (access.eliminated) return { status: 403, message: 'You have been eliminated from this season.' };
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
    const weekCutoffTime = getWeekCutoffTime(access.class);
    const weekStart = weekParam ? String(weekParam).slice(0, 10) : getWeekStartDate(new Date(), weekCutoffTime);
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
    const top5Athletes = (await ChallengeWorkout.getWeeklyLeaderboard(classId, weekStart, { limit: 5, weekCutoffTime }))
      .map((r) => ({ user_id: r.user_id, first_name: r.first_name, last_name: r.last_name, team_name: r.team_name, total_points: Number(r.total_points) }));
    const top5Teams = (await ChallengeWorkout.getWeeklyTeamLeaderboard(classId, weekStart, { limit: 5, weekCutoffTime }))
      .map((r) => ({ team_id: r.team_id, team_name: r.team_name, total_points: Number(r.total_points) }));
    const topPerTeam = (await ChallengeWorkout.getWeeklyTopPerTeam(classId, weekStart, { weekCutoffTime }))
      .map((r) => ({ user_id: r.user_id, first_name: r.first_name, last_name: r.last_name, team_id: r.team_id, team_name: r.team_name, total_points: Number(r.total_points) }));
    const [klassRows] = await pool.execute(`SELECT masters_age_threshold, recognition_categories_json FROM learning_program_classes WHERE id = ?`, [classId]);
    const klass = klassRows?.[0];
    const categories = Array.isArray(klass?.recognition_categories_json) ? klass.recognition_categories_json : (typeof klass?.recognition_categories_json === 'string' ? (() => { try { return JSON.parse(klass.recognition_categories_json); } catch { return []; } })() : []);
    const mastersThreshold = klass?.masters_age_threshold != null ? asInt(klass.masters_age_threshold) : 53;
    const recognitionOfTheWeek = {};
    if (categories.includes('fastest_male')) {
      const r = await ChallengeWorkout.getWeeklyLeaderByGender(classId, weekStart, { gender: 'male', weekCutoffTime });
      if (r) recognitionOfTheWeek.fastest_male = { user_id: r.user_id, first_name: r.first_name, last_name: r.last_name, team_name: r.team_name, total_points: Number(r.total_points) };
    }
    if (categories.includes('fastest_female')) {
      const r = await ChallengeWorkout.getWeeklyLeaderByGender(classId, weekStart, { gender: 'female', weekCutoffTime });
      if (r) recognitionOfTheWeek.fastest_female = { user_id: r.user_id, first_name: r.first_name, last_name: r.last_name, team_name: r.team_name, total_points: Number(r.total_points) };
    }
    if (categories.includes('fastest_masters_male')) {
      const r = await ChallengeWorkout.getWeeklyMastersLeader(classId, weekStart, { gender: 'male', ageThreshold: mastersThreshold, weekCutoffTime });
      if (r) recognitionOfTheWeek.fastest_masters_male = { user_id: r.user_id, first_name: r.first_name, last_name: r.last_name, team_name: r.team_name, total_points: Number(r.total_points) };
    }
    if (categories.includes('fastest_masters_female')) {
      const r = await ChallengeWorkout.getWeeklyMastersLeader(classId, weekStart, { gender: 'female', ageThreshold: mastersThreshold, weekCutoffTime });
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
    const weekCutoffTime = getWeekCutoffTime(access.class);
    const weekStart = weekParam ? String(weekParam).slice(0, 10) : getWeekStartDate(new Date(), weekCutoffTime);
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
    const weekCutoffTime = getWeekCutoffTime(access.class);
    const weekStart = weekParam ? String(weekParam).slice(0, 10) : getWeekStartDate(new Date(), weekCutoffTime);
    await ChallengeWeeklyTask.deleteByWeek(classId, weekStart);
    const created = await ChallengeWeeklyTask.createBatch(classId, weekStart, tasks.slice(0, 3));
    return res.status(201).json({ weekStartDate: weekStart, tasks: created });
  } catch (e) {
    next(e);
  }
};

export const generateWeeklyTasksDraft = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const weekParam = req.body.week || req.body.weekStart;
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    if (!canManageChallenge(req.user?.role)) return res.status(403).json({ error: { message: 'Manage access required' } });
    const access = await getAccess(req, classId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    const weekCutoffTime = getWeekCutoffTime(access.class);
    const weekStart = weekParam ? String(weekParam).slice(0, 10) : getWeekStartDate(new Date(), weekCutoffTime);
    const draftTasks = buildAiWeeklyTaskDraft({ klass: access.class, weekStart });
    await pool.execute(
      `INSERT INTO challenge_weekly_task_drafts
       (learning_class_id, week_start_date, status, source, draft_json, generated_by_user_id)
       VALUES (?, ?, 'draft', 'ai', ?, ?)
       ON DUPLICATE KEY UPDATE
         status = 'draft',
         source = 'ai',
         draft_json = VALUES(draft_json),
         generated_by_user_id = VALUES(generated_by_user_id),
         updated_at = CURRENT_TIMESTAMP`,
      [classId, weekStart, JSON.stringify({ tasks: draftTasks }), req.user.id]
    );
    return res.status(201).json({ weekStartDate: weekStart, tasks: draftTasks, status: 'draft' });
  } catch (e) {
    next(e);
  }
};

export const publishWeeklyTasksDraft = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const weekParam = req.body.week || req.body.weekStart;
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    if (!canManageChallenge(req.user?.role)) return res.status(403).json({ error: { message: 'Manage access required' } });
    const access = await getAccess(req, classId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    const weekCutoffTime = getWeekCutoffTime(access.class);
    const weekStart = weekParam ? String(weekParam).slice(0, 10) : getWeekStartDate(new Date(), weekCutoffTime);
    const tasksInput = Array.isArray(req.body.tasks) ? req.body.tasks : [];
    const tasksToPublish = tasksInput.length
      ? tasksInput.slice(0, 3)
      : (() => {
        const fallback = buildAiWeeklyTaskDraft({ klass: access.class, weekStart });
        return fallback;
      })();
    await ChallengeWeeklyTask.deleteByWeek(classId, weekStart);
    const created = await ChallengeWeeklyTask.createBatch(classId, weekStart, tasksToPublish);
    await pool.execute(
      `INSERT INTO challenge_weekly_task_drafts
       (learning_class_id, week_start_date, status, source, draft_json, generated_by_user_id, published_by_user_id, published_at)
       VALUES (?, ?, 'published', 'ai', ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         status = 'published',
         draft_json = VALUES(draft_json),
         published_by_user_id = VALUES(published_by_user_id),
         published_at = VALUES(published_at),
         updated_at = CURRENT_TIMESTAMP`,
      [classId, weekStart, JSON.stringify({ tasks: tasksToPublish }), req.user.id, req.user.id]
    );
    return res.json({ weekStartDate: weekStart, status: 'published', tasks: created });
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
    const weekCutoffTime = getWeekCutoffTime(access.class);
    const weekStart = weekParam ? String(weekParam).slice(0, 10) : getWeekStartDate(new Date(), weekCutoffTime);
    const assignments = await ChallengeWeeklyAssignment.listByWeek(classId, weekStart);
    return res.json({ weekStartDate: weekStart, assignments });
  } catch (e) {
    next(e);
  }
};

export const listMyByeWeeks = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const access = await getAccess(req, classId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    const [rows] = await pool.execute(
      `SELECT id, week_start_date, status, declared_at, note
       FROM challenge_bye_weeks
       WHERE learning_class_id = ? AND provider_user_id = ?
       ORDER BY week_start_date DESC`,
      [classId, req.user.id]
    );
    return res.json({ byeWeeks: rows || [] });
  } catch (e) {
    next(e);
  }
};

export const declareByeWeek = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const weekParam = req.body.week || req.body.weekStart;
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const access = await getAccess(req, classId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    const [membership] = await pool.execute(
      `SELECT 1
       FROM learning_class_provider_memberships
       WHERE learning_class_id = ? AND provider_user_id = ? AND membership_status IN ('active','completed')
       LIMIT 1`,
      [classId, req.user.id]
    );
    if (!membership?.length) return res.status(403).json({ error: { message: 'Join the season before declaring a bye week' } });
    const weekStart = weekParam ? String(weekParam).slice(0, 10) : getWeekStartDate(new Date());
    const settings = parseJsonObject(access.class?.season_settings_json || {});
    const byeWeek = parseJsonObject(settings.byeWeek || {});
    const allowByeWeek = byeWeek.allowByeWeek === true;
    const maxBye = Number.parseInt(byeWeek.maxByeWeeksPerParticipant, 10);
    const maxByeWeeks = Number.isFinite(maxBye) ? Math.max(0, maxBye) : 1;
    const requireAdvance = byeWeek.requireAdvanceDeclaration !== false;
    if (!allowByeWeek) {
      return res.status(400).json({ error: { message: 'Bye week is not enabled for this season' } });
    }
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM challenge_bye_weeks
       WHERE learning_class_id = ? AND provider_user_id = ? AND status IN ('declared','used')`,
      [classId, req.user.id]
    );
    const alreadyUsed = Number(countRows?.[0]?.total || 0);
    if (alreadyUsed >= maxByeWeeks) {
      return res.status(400).json({ error: { message: `You have already used your ${maxByeWeeks} bye week(s)` } });
    }
    if (requireAdvance) {
      const now = new Date();
      const [h, m] = String(weekCutoffTime || '00:00').split(':').map((n) => Number.parseInt(n, 10) || 0);
      const weekStartDate = new Date(`${weekStart}T00:00:00`);
      weekStartDate.setHours(h, m, 0, 0);
      if (!(weekStartDate.getTime() > now.getTime())) {
        return res.status(400).json({ error: { message: 'Bye week must be declared before the week starts' } });
      }
    }
    await pool.execute(
      `INSERT INTO challenge_bye_weeks
       (learning_class_id, provider_user_id, week_start_date, status, note)
       VALUES (?, ?, ?, 'declared', ?)
       ON DUPLICATE KEY UPDATE
         status = 'declared',
         note = VALUES(note),
         updated_at = CURRENT_TIMESTAMP`,
      [classId, req.user.id, weekStart, req.body?.note ? String(req.body.note).slice(0, 255) : null]
    );
    return res.status(201).json({ declared: true, weekStartDate: weekStart });
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
    const weekCutoffTime = getWeekCutoffTime(access.class);
    const weekStart = weekParam ? String(weekParam).slice(0, 10) : getWeekStartDate(new Date(), weekCutoffTime);
    const teamMin = klass.team_min_points_per_week != null ? asInt(klass.team_min_points_per_week) : null;
    const indMin = klass.individual_min_points_per_week != null ? asInt(klass.individual_min_points_per_week) : null;

    const top5Athletes = (await ChallengeWorkout.getWeeklyLeaderboard(classId, weekStart, { limit: 5, weekCutoffTime }))
      .map((r) => ({ user_id: r.user_id, first_name: r.first_name, last_name: r.last_name, team_name: r.team_name, total_points: Number(r.total_points) }));
    const top5Teams = (await ChallengeWorkout.getWeeklyTeamLeaderboard(classId, weekStart, { limit: 5, weekCutoffTime }))
      .map((r) => ({ team_id: r.team_id, team_name: r.team_name, total_points: Number(r.total_points) }));
    const topPerTeam = (await ChallengeWorkout.getWeeklyTopPerTeam(classId, weekStart, { weekCutoffTime }))
      .map((r) => ({ user_id: r.user_id, first_name: r.first_name, last_name: r.last_name, team_id: r.team_id, team_name: r.team_name, total_points: Number(r.total_points) }));

    const categories = Array.isArray(klass.recognition_categories_json) ? klass.recognition_categories_json : (typeof klass.recognition_categories_json === 'string' ? (() => { try { return JSON.parse(klass.recognition_categories_json); } catch { return []; } })() : []);
    const mastersThreshold = klass.masters_age_threshold != null ? asInt(klass.masters_age_threshold) : 53;
    const recognitionOfTheWeek = {};
    if (categories.includes('fastest_male')) {
      const r = await ChallengeWorkout.getWeeklyLeaderByGender(classId, weekStart, { gender: 'male', weekCutoffTime });
      if (r) recognitionOfTheWeek.fastest_male = { user_id: r.user_id, first_name: r.first_name, last_name: r.last_name, team_name: r.team_name, total_points: Number(r.total_points) };
    }
    if (categories.includes('fastest_female')) {
      const r = await ChallengeWorkout.getWeeklyLeaderByGender(classId, weekStart, { gender: 'female', weekCutoffTime });
      if (r) recognitionOfTheWeek.fastest_female = { user_id: r.user_id, first_name: r.first_name, last_name: r.last_name, team_name: r.team_name, total_points: Number(r.total_points) };
    }
    if (categories.includes('fastest_masters_male')) {
      const r = await ChallengeWorkout.getWeeklyMastersLeader(classId, weekStart, { gender: 'male', ageThreshold: mastersThreshold, weekCutoffTime });
      if (r) recognitionOfTheWeek.fastest_masters_male = { user_id: r.user_id, first_name: r.first_name, last_name: r.last_name, team_name: r.team_name, total_points: Number(r.total_points) };
    }
    if (categories.includes('fastest_masters_female')) {
      const r = await ChallengeWorkout.getWeeklyMastersLeader(classId, weekStart, { gender: 'female', ageThreshold: mastersThreshold, weekCutoffTime });
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
    const [byeRows] = await pool.execute(
      `SELECT provider_user_id
       FROM challenge_bye_weeks
       WHERE learning_class_id = ? AND week_start_date = ? AND status = 'declared'`,
      [classId, weekStart]
    );
    const byeByUser = new Set((byeRows || []).map((r) => Number(r.provider_user_id)));
    for (const m of members || []) {
      const pid = m.provider_user_id;
      if (await ChallengeElimination.isEliminated(classId, pid)) continue;
      if (byeByUser.has(Number(pid))) {
        await pool.execute(
          `UPDATE challenge_bye_weeks
           SET status = 'used', updated_at = CURRENT_TIMESTAMP
           WHERE learning_class_id = ? AND provider_user_id = ? AND week_start_date = ? AND status = 'declared'`,
          [classId, pid, weekStart]
        );
        continue;
      }
      let pointsFailed = false;
      let challengeFailed = false;
      if (indMin != null) {
        const pts = await ChallengeWorkout.getWeeklyPointsForUser(classId, pid, weekStart, { weekCutoffTime });
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

export const getSeasonSummary = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const weekParam = req.query.week || req.query.weekStart;
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const access = await getAccess(req, classId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    const weekCutoffTime = getWeekCutoffTime(access.class);
    const weekStart = weekParam ? String(weekParam).slice(0, 10) : getWeekStartDate(new Date(), weekCutoffTime);
    const limits = deriveSummaryLimits(access.class);
    const weeklyTopAthletes = (await ChallengeWorkout.getWeeklyLeaderboard(classId, weekStart, { limit: limits.weeklyTopAthletes, weekCutoffTime }))
      .map((r) => ({ user_id: r.user_id, first_name: r.first_name, last_name: r.last_name, team_name: r.team_name, total_points: Number(r.total_points || 0) }));
    const weeklyTopTeams = (await ChallengeWorkout.getWeeklyTeamLeaderboard(classId, weekStart, { limit: limits.weeklyTopTeams, weekCutoffTime }))
      .map((r) => ({ team_id: r.team_id, team_name: r.team_name, total_points: Number(r.total_points || 0) }));
    const seasonTopIndividuals = (await ChallengeWorkout.getLeaderboardIndividual(classId, { limit: limits.seasonTopIndividuals }))
      .map((r) => ({ user_id: r.user_id, first_name: r.first_name, last_name: r.last_name, total_points: Number(r.total_points || 0) }));
    const [teamSeasonRows] = await pool.execute(
      `SELECT t.id AS team_id, t.team_name, COALESCE(SUM(w.points), 0) AS total_points
       FROM challenge_teams t
       LEFT JOIN challenge_workouts w ON w.team_id = t.id
       WHERE t.learning_class_id = ?
       GROUP BY t.id, t.team_name
       ORDER BY total_points DESC, t.team_name ASC`,
      [classId]
    );
    const [clubTotalsRows] = await pool.execute(
      `SELECT COALESCE(SUM(w.points), 0) AS season_points,
              COALESCE(SUM(w.distance_value), 0) AS season_miles
       FROM challenge_workouts w
       WHERE w.learning_class_id = ?`,
      [classId]
    );
    const mastersThreshold = Number.parseInt(access.class?.masters_age_threshold, 10) || 53;
    const [mastersRows] = await pool.execute(
      `SELECT w.user_id, u.first_name, u.last_name, SUM(w.points) AS total_points
       FROM challenge_workouts w
       INNER JOIN users u ON u.id = w.user_id
       INNER JOIN challenge_participant_profiles p
         ON p.learning_class_id = w.learning_class_id AND p.provider_user_id = w.user_id
       WHERE w.learning_class_id = ?
         AND p.date_of_birth IS NOT NULL
         AND TIMESTAMPDIFF(YEAR, p.date_of_birth, CURDATE()) >= ?
       GROUP BY w.user_id, u.first_name, u.last_name
       ORDER BY total_points DESC
       LIMIT ?`,
      [classId, mastersThreshold, limits.seasonTopMasters]
    );
    const [ladiesRows] = await pool.execute(
      `SELECT w.user_id, u.first_name, u.last_name, SUM(w.points) AS total_points
       FROM challenge_workouts w
       INNER JOIN users u ON u.id = w.user_id
       INNER JOIN challenge_participant_profiles p
         ON p.learning_class_id = w.learning_class_id AND p.provider_user_id = w.user_id
       WHERE w.learning_class_id = ?
         AND p.gender = 'female'
       GROUP BY w.user_id, u.first_name, u.last_name
       ORDER BY total_points DESC
       LIMIT ?`,
      [classId, limits.seasonTopLadies]
    );
    return res.json({
      weekStartDate: weekStart,
      weeklySummary: {
        topAthletes: weeklyTopAthletes,
        topTeams: weeklyTopTeams,
        teamSeasonTotals: (teamSeasonRows || []).map((r) => ({ team_id: r.team_id, team_name: r.team_name, total_points: Number(r.total_points || 0) })),
        seasonPointsTotal: Number(clubTotalsRows?.[0]?.season_points || 0),
        seasonMilesTotal: Number(clubTotalsRows?.[0]?.season_miles || 0)
      },
      seasonStandings: {
        topIndividuals: seasonTopIndividuals,
        topMasters: (mastersRows || []).map((r) => ({ user_id: r.user_id, first_name: r.first_name, last_name: r.last_name, total_points: Number(r.total_points || 0) })),
        topLadies: (ladiesRows || []).map((r) => ({ user_id: r.user_id, first_name: r.first_name, last_name: r.last_name, total_points: Number(r.total_points || 0) }))
      }
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
