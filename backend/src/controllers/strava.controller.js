/**
 * Strava OAuth controller for Summit Stats Challenge
 * Connect/disconnect Strava accounts for fitness profile linking.
 * Activities listing and selective import for challenge workouts.
 */
import pool from '../config/database.js';
import ChallengeTeam from '../models/ChallengeTeam.model.js';
import ChallengeWorkout from '../models/ChallengeWorkout.model.js';
import {
  createSignedState,
  verifySignedState,
  getAuthorizeUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  fetchAthleteActivities,
  fetchActivityById,
  isConfigured
} from '../services/stravaOAuth.service.js';

const asInt = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
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
    const baseUrl = getRequestBaseUrl(req);
    const redirectUri = `${baseUrl}/api/strava/callback`;
    const state = createSignedState({ userId: req.user.id });
    const authUrl = getAuthorizeUrl({ state, redirectUri });
    return res.redirect(302, authUrl);
  } catch (e) {
    next(e);
  }
};

export const stravaCallback = async (req, res, next) => {
  try {
    const { code, state, error: oauthError } = req.query;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const redirectTo = `${frontendUrl}/dashboard?tab=my&my=preferences&strava=connected`;
    const redirectError = `${frontendUrl}/dashboard?tab=my&my=preferences&strava=error`;
    if (oauthError) return res.redirect(302, redirectError);
    const payload = verifySignedState(state);
    if (!payload?.userId) return res.redirect(302, redirectError);
    const userId = Number(payload.userId);
    if (!userId) return res.redirect(302, redirectError);
    const tokens = await exchangeCodeForTokens({
      code: String(code || '').trim(),
      redirectUri: `${getRequestBaseUrl(req)}/api/strava/callback`
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
    return res.json({
      connected,
      athleteId: row?.strava_athlete_id || null,
      username: row?.strava_athlete_username || null,
      connectedAt: row?.strava_connected_at || null,
      stravaConfigured: isConfigured()
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
    if (!pm?.length) return res.status(403).json({ error: { message: 'You must be a challenge participant to import workouts' } });
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
      const workout = await ChallengeWorkout.create({
        learningClassId,
        teamId,
        userId,
        activityType,
        distanceValue: distanceMiles,
        durationMinutes,
        points,
        workoutNotes: activity.name ? String(activity.name).trim() : null,
        completedAt,
        stravaActivityId: stravaId
      });
      if (workout) imported.push(workout);
    }
    return res.status(201).json({ imported: imported.length, skipped: skipped.length, workouts: imported });
  } catch (e) {
    next(e);
  }
};
