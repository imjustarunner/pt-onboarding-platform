/**
 * Strava OAuth controller for Summit Stats Team Challenge
 * Connect/disconnect Strava accounts for fitness profile linking.
 * Activities listing and selective import for challenge workouts.
 */
import pool from '../config/database.js';
import User from '../models/User.model.js';
import ChallengeTeam from '../models/ChallengeTeam.model.js';
import ChallengeWorkout from '../models/ChallengeWorkout.model.js';
import { isStravaRolloutEnabledForEmail } from '../utils/stravaRollout.js';
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
    const u = await User.findById(req.user.id);
    if (!u || !isStravaRolloutEnabledForEmail(u.email)) {
      return res.status(403).json({ error: { message: 'Strava is not enabled for your account yet.' } });
    }
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
    const oauthUser = await User.findById(userId);
    if (!oauthUser || !isStravaRolloutEnabledForEmail(oauthUser.email)) {
      return res.redirect(302, redirectError);
    }
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
    const u = await User.findById(userId);
    const [tokRow] = await pool.execute(
      'SELECT strava_access_token FROM user_preferences WHERE user_id = ? LIMIT 1',
      [userId]
    );
    const hadTokens = !!tokRow?.[0]?.strava_access_token;
    if ((!u || !isStravaRolloutEnabledForEmail(u.email)) && !hadTokens) {
      return res.status(403).json({ error: { message: 'Strava is not enabled for your account yet.' } });
    }
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
    const cfg = getConfigDiagnostics();
    const u = await User.findById(userId);
    const rollout = u && isStravaRolloutEnabledForEmail(u.email);
    if (!rollout) {
      return res.json({
        connected: false,
        athleteId: null,
        username: null,
        connectedAt: null,
        stravaRolloutEnabled: false,
        stravaConfigured: cfg.configured,
        stravaConfig: {
          hasClientId: cfg.hasClientId,
          hasClientSecret: cfg.hasClientSecret,
          hasRedirectUri: cfg.hasRedirectUri,
          redirectUri: cfg.redirectUri
        }
      });
    }
    const [rows] = await pool.execute(
      'SELECT strava_athlete_id, strava_athlete_username, strava_connected_at FROM user_preferences WHERE user_id = ?',
      [userId]
    );
    const row = rows?.[0];
    const connected = !!(row?.strava_athlete_id);
    return res.json({
      connected,
      athleteId: row?.strava_athlete_id || null,
      username: row?.strava_athlete_username || null,
      connectedAt: row?.strava_connected_at || null,
      stravaRolloutEnabled: true,
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

/**
 * Compute points from Strava activity using season scoring settings.
 * Distance-based sports count to 2 decimal places (e.g. 3.89 mi = 3.89 pts).
 * Time-based fallback (no GPS distance) stays whole-number per 15 min.
 */
const computePointsFromStrava = (activity, activityType, scoring = {}) => {
  const distMeters = Number(activity?.distance) || 0;
  const movingSec  = Number(activity?.moving_time) || Number(activity?.elapsed_time) || 0;
  const miles      = distMeters / 1609.34;
  const minutes    = movingSec / 60;
  const aLower     = String(activityType || '').toLowerCase();
  if (miles > 0) {
    const milesPerPoint = aLower.includes('ruck')
      ? Math.max(0.01, Number(scoring.ruckMilesPerPoint || 1))
      : Math.max(0.01, Number(scoring.runMilesPerPoint  || 1));
    return Math.max(0, Math.round((miles / milesPerPoint) * 100) / 100);
  }
  if (minutes > 0) return Math.max(0, Math.floor(minutes / 15));
  return 0;
};

export const stravaActivities = async (req, res, next) => {
  try {
    const userId = Number(req.user?.id || 0);
    if (!userId) return res.status(401).json({ error: { message: 'Unauthorized' } });
    const su = await User.findById(userId);
    if (!su || !isStravaRolloutEnabledForEmail(su.email)) {
      return res.status(403).json({ error: { message: 'Strava is not enabled for your account yet.' } });
    }
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
    const iu = await User.findById(userId);
    if (!iu || !isStravaRolloutEnabledForEmail(iu.email)) {
      return res.status(403).json({ error: { message: 'Strava is not enabled for your account yet.' } });
    }
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
    const stravaScoring = parseJsonObject(seasonSettings?.scoring || {});
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
      const rawSec = Number(activity.moving_time) || Number(activity.elapsed_time) || 0;
      const durationMinutes = rawSec > 0 ? Math.floor(rawSec / 60) : null;
      const durationSeconds = rawSec > 0 ? (rawSec % 60) : null;
      const mapSummaryPolyline = activity.map?.summary_polyline || null;
      const caloriesBurned = activity.calories ? Math.round(Number(activity.calories)) : null;
      const elevationGainMeters = activity.total_elevation_gain != null ? Number(activity.total_elevation_gain) : null;
      const averageHeartrate = activity.average_heartrate != null ? Number(activity.average_heartrate) : null;
      const maxHeartrate = activity.max_heartrate != null ? Number(activity.max_heartrate) : null;
      // Mile splits: use splits_standard (imperial). Each item has distance_m, elapsed_time_s, moving_time_s,
      // elevation_diff_m, average_speed_ms, average_heartrate, split number.
      const splitsJson = (() => {
        const raw = activity.splits_standard;
        if (!Array.isArray(raw) || !raw.length) return null;
        return raw.map((s) => ({
          split: s.split,
          distanceMeters: s.distance != null ? Number(s.distance) : null,
          elapsedTimeSec: s.elapsed_time != null ? Number(s.elapsed_time) : null,
          movingTimeSec: s.moving_time != null ? Number(s.moving_time) : null,
          elevationDiffMeters: s.elevation_difference != null ? Number(s.elevation_difference) : null,
          averageSpeedMs: s.average_speed != null ? Number(s.average_speed) : null,
          averageHeartrate: s.average_heartrate != null ? Number(s.average_heartrate) : null
        }));
      })();
      // Combine Strava name + description for workout notes
      const noteParts = [
        activity.name ? String(activity.name).trim() : null,
        activity.description ? String(activity.description).trim() : null
      ].filter(Boolean);
      const workoutNotes = noteParts.length ? noteParts.join('\n') : null;
      const points = computePointsFromStrava(activity, activityType, stravaScoring);
      // Same-day check: compare the activity's local date against today in the season/club timezone.
      // start_date_local from Strava is already the athlete's local clock date (YYYY-MM-DD…).
      const activityLocalDate = activity.start_date_local
        ? String(activity.start_date_local).slice(0, 10)
        : (activity.start_date ? new Intl.DateTimeFormat('en-CA', { timeZone: weekTimeZone }).format(new Date(activity.start_date)) : null);
      const todayInTz = new Intl.DateTimeFormat('en-CA', { timeZone: weekTimeZone }).format(new Date());
      if (!activityLocalDate || activityLocalDate !== todayInTz) {
        skipped.push({ stravaId, reason: 'not_today', date: activityLocalDate });
        continue;
      }
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
        durationSeconds,
        caloriesBurned,
        elevationGainMeters,
        averageHeartrate,
        maxHeartrate,
        splitsJson,
        mapSummaryPolyline,
        points,
        workoutNotes,
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
