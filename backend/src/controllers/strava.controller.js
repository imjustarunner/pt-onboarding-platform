/**
 * Strava OAuth controller for Summit Stats Team Challenge
 * Connect/disconnect Strava accounts for fitness profile linking.
 * Activities listing and selective import for challenge workouts.
 */
import pool from '../config/database.js';
import ChallengeTeam from '../models/ChallengeTeam.model.js';
import ChallengeWorkout from '../models/ChallengeWorkout.model.js';
import { queueClubRecordBreakCandidates } from './summitStats.controller.js';
import { getWeekStartDate, getWeekDateTimeRange } from '../utils/challengeWeekUtils.js';
import {
  createSignedState,
  verifySignedState,
  getAuthorizeUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  fetchAthleteActivities,
  fetchActivityById,
  isConfigured,
  getConfigDiagnostics
} from '../services/stravaOAuth.service.js';

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

const getWorkoutModerationMode = (settings) => {
  const mode = String(settings?.workoutModeration?.mode || '').trim().toLowerCase();
  if (mode === 'all' || mode === 'treadmill_only' || mode === 'none') return mode;
  return 'treadmill_only';
};

const isTreadmillActivity = (activity) => {
  if (!activity || typeof activity !== 'object') return false;
  if (activity.trainer === true) return true;
  const sport = String(activity.sport_type || '').toLowerCase();
  const type = String(activity.type || '').toLowerCase();
  return sport.includes('virtualrun') || type.includes('virtualrun') || sport.includes('treadmill') || type.includes('treadmill');
};

const getValidAccessToken = async (userId) => {
  const [rows] = await pool.execute(
    `SELECT strava_access_token, strava_refresh_token, strava_token_expires_at FROM user_preferences WHERE user_id = ?`,
    [userId]
  );
  const row = rows?.[0];
  if (!row?.strava_access_token) return null;
  const expiresAt = row.strava_token_expires_at ? new Date(row.strava_token_expires_at).getTime() : 0;
  const now = Date.now();
  if (expiresAt && expiresAt < now + 60 * 1000) {
    const refreshed = await refreshAccessToken(row.strava_refresh_token);
    if (!refreshed?.accessToken) return null;
    const newExpires = refreshed.expiresAt || null;
    await pool.execute(
      `UPDATE user_preferences SET strava_access_token = ?, strava_refresh_token = ?, strava_token_expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
      [refreshed.accessToken, refreshed.refreshToken || row.strava_refresh_token, newExpires, userId]
    );
    return refreshed.accessToken;
  }
  return row.strava_access_token;
};

const getRequestBaseUrl = (req) => {
  const proto = (req.get('x-forwarded-proto') || req.protocol || 'https').toString().split(',')[0].trim();
  const host = (req.get('x-forwarded-host') || req.get('host') || req.hostname || '').toString().split(',')[0].trim();
  return host ? `${proto === 'http' ? 'http' : 'https'}://${host}` : '';
};

export const stravaConnectStart = async (req, res, next) => {
  try {
    if (!req.user?.id) return res.status(401).json({ error: { message: 'Unauthorized' } });
    if (!isConfigured()) return res.status(503).json({ error: { message: 'Strava integration is not configured' } });
    const state = createSignedState({ userId: req.user.id });
    // Use the configured STRAVA_REDIRECT_URI — dynamically derived host can differ on Cloud Run
    const authUrl = getAuthorizeUrl({ state });
    return res.redirect(302, authUrl);
  } catch (e) {
    next(e);
  }
};

export const stravaCallback = async (req, res, next) => {
  try {
    const { code, state, error: oauthError } = req.query;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const redirectTo = `${frontendUrl}/dashboard?tab=my&my=account&strava=connected`;
    const redirectError = `${frontendUrl}/dashboard?tab=my&my=account&strava=error`;
    if (oauthError) return res.redirect(302, redirectError);
    const payload = verifySignedState(state);
    if (!payload?.userId) return res.redirect(302, redirectError);
    const userId = Number(payload.userId);
    if (!userId) return res.redirect(302, redirectError);
    const tokens = await exchangeCodeForTokens({
      code: String(code || '').trim(),
      redirectUri: process.env.STRAVA_REDIRECT_URI || `${getRequestBaseUrl(req)}/api/strava/callback`
    });
    const athleteId = tokens.athlete?.id ? Number(tokens.athlete.id) : null;
    const athleteUsername = tokens.athlete?.username ? String(tokens.athlete.username) : null;
    const connectedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const [prefs] = await pool.execute('SELECT id FROM user_preferences WHERE user_id = ?', [userId]);
    if (prefs?.length) {
      await pool.execute(
        `UPDATE user_preferences SET
          strava_athlete_id = ?, strava_athlete_username = ?,
          strava_access_token = ?, strava_refresh_token = ?, strava_token_expires_at = ?, strava_connected_at = ?,
          updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ?`,
        [athleteId, athleteUsername, tokens.accessToken, tokens.refreshToken, tokens.expiresAt, connectedAt, userId]
      );
    } else {
      await pool.execute(
        `INSERT INTO user_preferences (user_id, strava_athlete_id, strava_athlete_username, strava_access_token, strava_refresh_token, strava_token_expires_at, strava_connected_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [userId, athleteId, athleteUsername, tokens.accessToken, tokens.refreshToken, tokens.expiresAt, connectedAt]
      );
    }
    return res.redirect(302, redirectTo);
  } catch (e) {
    next(e);
  }
};

export const stravaDisconnect = async (req, res, next) => {
  try {
    const userId = Number(req.user?.id || 0);
    if (!userId) return res.status(401).json({ error: { message: 'Unauthorized' } });
    await pool.execute(
      `UPDATE user_preferences SET
        strava_athlete_id = NULL, strava_athlete_username = NULL,
        strava_access_token = NULL, strava_refresh_token = NULL, strava_token_expires_at = NULL, strava_connected_at = NULL,
        updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ?`,
      [userId]
    );
    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const stravaStatus = async (req, res, next) => {
  try {
    const userId = Number(req.user?.id || 0);
    if (!userId) return res.status(401).json({ error: { message: 'Unauthorized' } });
    const [rows] = await pool.execute(
      'SELECT strava_athlete_id, strava_athlete_username, strava_connected_at FROM user_preferences WHERE user_id = ?',
      [userId]
    );
    const row = rows?.[0];
    const connected = !!(row?.strava_athlete_id);
    const cfg = getConfigDiagnostics();
    return res.json({
      connected,
      athleteId: row?.strava_athlete_id || null,
      username: row?.strava_athlete_username || null,
      connectedAt: row?.strava_connected_at || null,
      stravaConfigured: cfg.configured,
      stravaConfig: {
        hasClientId: cfg.hasClientId,
        hasClientSecret: cfg.hasClientSecret,
        hasRedirectUri: cfg.hasRedirectUri,
        redirectUri: cfg.redirectUri
      }
    });
  } catch (e) {
    next(e);
  }
};

/** Map Strava type/sport_type to challenge activity_type */
const stravaTypeToActivity = (type, sportType) => {
  const t = String(type || sportType || '').toLowerCase();
  if (t.includes('run')) return 'running';
  if (t.includes('ride') || t.includes('cycle') || t.includes('bike')) return 'cycling';
  if (t.includes('walk') || t.includes('hike')) return 'steps';
  return 'workout_session';
};

/** Compute default points from Strava activity (distance in meters, moving_time in seconds) */
const computePointsFromStrava = (activity) => {
  const distMeters = Number(activity?.distance) || 0;
  const movingSec = Number(activity?.moving_time) || Number(activity?.elapsed_time) || 0;
  const miles = distMeters / 1609.34;
  const minutes = movingSec / 60;
  if (miles > 0) return Math.max(1, Math.round(miles));
  if (minutes > 0) return Math.max(1, Math.round(minutes / 15));
  return 1;
};

export const stravaActivities = async (req, res, next) => {
  try {
    const userId = Number(req.user?.id || 0);
    if (!userId) return res.status(401).json({ error: { message: 'Unauthorized' } });
    if (!isConfigured()) return res.status(503).json({ error: { message: 'Strava integration is not configured' } });
    const token = await getValidAccessToken(userId);
    if (!token) return res.status(400).json({ error: { message: 'Strava not connected. Connect your Strava account first.' } });
    const after = asInt(req.query.after) || Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
    const before = asInt(req.query.before) || Math.floor(Date.now() / 1000);
    const perPage = Math.min(100, asInt(req.query.per_page) || 30);
    const activities = await fetchAthleteActivities(token, { after, before, per_page: perPage });
    return res.json({ activities });
  } catch (e) {
    next(e);
  }
};

export const stravaImport = async (req, res, next) => {
  try {
    const userId = Number(req.user?.id || 0);
    if (!userId) return res.status(401).json({ error: { message: 'Unauthorized' } });
    if (!isConfigured()) return res.status(503).json({ error: { message: 'Strava integration is not configured' } });
    const token = await getValidAccessToken(userId);
    if (!token) return res.status(400).json({ error: { message: 'Strava not connected. Connect your Strava account first.' } });
    const learningClassId = asInt(req.body.learningClassId);
    const activityIds = Array.isArray(req.body.activityIds) ? req.body.activityIds.map((id) => asInt(id)).filter(Boolean) : [];
    if (!learningClassId || !activityIds.length) {
      return res.status(400).json({ error: { message: 'learningClassId and activityIds (array) required' } });
    }
    const [pm] = await pool.execute(
      `SELECT 1 FROM learning_class_provider_memberships WHERE learning_class_id = ? AND provider_user_id = ? AND membership_status IN ('active','completed') LIMIT 1`,
      [learningClassId, userId]
    );
    if (!pm?.length) return res.status(403).json({ error: { message: 'You must be a season participant to import workouts' } });
    const [classRows] = await pool.execute(
      `SELECT season_settings_json, week_start_time
       FROM learning_program_classes
       WHERE id = ?
       LIMIT 1`,
      [learningClassId]
    );
    const seasonSettings = parseJsonObject(classRows?.[0]?.season_settings_json || {});
    const moderationMode = getWorkoutModerationMode(seasonSettings);
    const weekCutoffTime = String(seasonSettings?.schedule?.weekEndsSundayAt || classRows?.[0]?.week_start_time || '00:00');
    const weekTimeZone = String(seasonSettings?.schedule?.weekTimeZone || 'UTC');
    const maxRucksPerWeek = Math.max(0, Number.parseInt(seasonSettings?.participation?.maxRucksPerWeek, 10) || 0);
    const importedRucksByWeek = new Map();
    let teamId = req.body.teamId ? asInt(req.body.teamId) : null;
    if (!teamId) {
      const team = await ChallengeTeam.getTeamForUser(learningClassId, userId);
      teamId = team?.id || null;
    }
    const imported = [];
    const skipped = [];
    for (const stravaId of activityIds) {
      const activity = await fetchActivityById(token, stravaId);
      if (!activity) {
        skipped.push({ stravaId, reason: 'not_found' });
        continue;
      }
      const [existing] = await pool.execute(
        `SELECT 1 FROM challenge_workouts WHERE learning_class_id = ? AND user_id = ? AND strava_activity_id = ? LIMIT 1`,
        [learningClassId, userId, stravaId]
      );
      if (existing?.length) {
        skipped.push({ stravaId, reason: 'already_imported' });
        continue;
      }
      const activityType = stravaTypeToActivity(activity.type, activity.sport_type);
      const distanceMiles = activity.distance ? Number(activity.distance) / 1609.34 : null;
      const durationMinutes = activity.moving_time ? Math.round(Number(activity.moving_time) / 60) : null;
      const points = computePointsFromStrava(activity);
      const completedAt = activity.start_date ? new Date(activity.start_date).toISOString().slice(0, 19).replace('T', ' ') : null;
      const treadmill = isTreadmillActivity(activity);
      const isRuck = String(activityType || '').toLowerCase().includes('ruck');
      if (isRuck && maxRucksPerWeek > 0) {
        const completedWeekStart = getWeekStartDate(completedAt ? new Date(completedAt) : new Date(), weekCutoffTime, weekTimeZone);
        const weekKey = String(completedWeekStart || '').slice(0, 10);
        let count = importedRucksByWeek.get(weekKey);
        if (count == null) {
          const range = getWeekDateTimeRange(weekKey, weekCutoffTime, weekTimeZone) || {
            start: `${weekKey} 00:00:00`,
            end: `${weekKey} 23:59:59`
          };
          const [existingRucks] = await pool.execute(
            `SELECT COUNT(*) AS total
             FROM challenge_workouts w
             WHERE w.learning_class_id = ?
               AND w.user_id = ?
               AND LOWER(w.activity_type) LIKE '%ruck%'
               AND (w.is_disqualified IS NULL OR w.is_disqualified = 0)
               AND w.completed_at >= ?
               AND w.completed_at < ?`,
            [learningClassId, userId, range.start, range.end]
          );
          count = Number(existingRucks?.[0]?.total || 0);
        }
        if (count >= maxRucksPerWeek) {
          skipped.push({ stravaId, reason: 'weekly_ruck_limit_reached' });
          continue;
        }
        importedRucksByWeek.set(weekKey, count + 1);
      }
      const proofStatus = (moderationMode === 'all' || (moderationMode === 'treadmill_only' && treadmill)) ? 'pending' : 'not_required';
      const workout = await ChallengeWorkout.create({
        learningClassId,
        teamId,
        userId,
        activityType,
        isTreadmill: treadmill,
        distanceValue: distanceMiles,
        reportedDistanceValue: distanceMiles,
        durationMinutes,
        points,
        workoutNotes: activity.name ? String(activity.name).trim() : null,
        completedAt,
        stravaActivityId: stravaId,
        proofStatus
      });
      if (workout) {
        imported.push(workout);
        try {
          await queueClubRecordBreakCandidates({
            learningClassId,
            workoutId: workout.id,
            userId
          });
        } catch {
          // non-blocking
        }
      }
    }
    return res.status(201).json({ imported: imported.length, skipped: skipped.length, workouts: imported });
  } catch (e) {
    next(e);
  }
};
