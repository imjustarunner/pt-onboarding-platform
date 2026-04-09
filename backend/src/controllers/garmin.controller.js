/**
 * Garmin Connect integration controller — Summit Stats Team Challenge
 *
 * STATUS: Coming soon.
 *
 * Architecture mirrors strava.controller.js exactly:
 *  - OAuth 2.0 connect / callback / disconnect
 *  - Token storage in user_preferences (garmin_access_token, garmin_refresh_token, garmin_token_expires_at)
 *  - Activity listing via Garmin Health API
 *  - Selective activity import into challenge_workouts (same payload shape as Strava)
 *  - Auto-import webhook handler (Garmin push subscriptions)
 *
 * Garmin Health API docs:
 *   https://developer.garmin.com/gc-developer-program/overview/
 *
 * When credentials are obtained and implementation is ready, this controller
 * will be drop-in compatible with the frontend integration panel because it
 * exposes the same route surface as the Strava controller:
 *
 *   GET  /api/garmin/connect       → redirect to Garmin OAuth
 *   GET  /api/garmin/callback      → handle OAuth code exchange
 *   DELETE /api/garmin/disconnect  → revoke & clear tokens
 *   GET  /api/garmin/status        → connection info for UI
 *   GET  /api/garmin/activities    → list today's activities (same shape as Strava)
 *   POST /api/garmin/import        → import selected activities
 *   POST /api/garmin/webhook       → Garmin push notifications (auto-import)
 */
import pool from '../config/database.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const comingSoon = (_req, res) =>
  res.status(503).json({
    error: {
      code: 'GARMIN_COMING_SOON',
      message: 'Garmin Connect integration is coming soon. Stay tuned!',
    },
  });

// ─── Token helpers (mirrors getValidAccessToken in strava.controller.js) ──────

/**
 * Retrieve a valid Garmin access token for the given user, refreshing it if
 * necessary.  Returns null when the user has no Garmin connection or the
 * refresh fails.
 *
 * @param {number} userId
 * @returns {Promise<string|null>}
 */
export const getValidGarminAccessToken = async (userId) => {
  const [rows] = await pool.execute(
    `SELECT garmin_access_token, garmin_refresh_token, garmin_token_expires_at
       FROM user_preferences WHERE user_id = ?`,
    [userId],
  );
  const row = rows?.[0];
  if (!row?.garmin_access_token) return null;

  const expiresAt = row.garmin_token_expires_at
    ? new Date(row.garmin_token_expires_at).getTime()
    : 0;

  if (expiresAt && expiresAt < Date.now() + 60_000) {
    // TODO: call Garmin token-refresh endpoint and update the DB row
    return null;
  }

  return row.garmin_access_token;
};

// ─── Route handlers ───────────────────────────────────────────────────────────

/** GET /api/garmin/connect — redirect to Garmin OAuth */
export const garminConnectStart = comingSoon;

/** GET /api/garmin/callback — handle OAuth code exchange */
export const garminCallback = comingSoon;

/** DELETE /api/garmin/disconnect — revoke & clear tokens */
export const garminDisconnect = comingSoon;

/**
 * GET /api/garmin/status — connection info for the UI.
 *
 * Returns the same shape as Strava's status endpoint so the frontend
 * integration panel can render consistently:
 *
 * {
 *   connected: boolean,
 *   username: string|null,
 *   connectedAt: string|null,
 *   garminConfigured: boolean,
 * }
 */
export const garminStatus = async (req, res, next) => {
  try {
    if (!req.user?.id) return res.status(401).json({ error: { message: 'Unauthorized' } });

    const [rows] = await pool.execute(
      `SELECT garmin_access_token, garmin_athlete_username, garmin_connected_at
         FROM user_preferences WHERE user_id = ?`,
      [req.user.id],
    );
    const row = rows?.[0];
    return res.json({
      connected: !!(row?.garmin_access_token),
      username: row?.garmin_athlete_username || null,
      connectedAt: row?.garmin_connected_at || null,
      garminConfigured: false, // flip to true once API credentials are provisioned
    });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/garmin/activities — list activities for today (same shape as Strava).
 *
 * Expected response shape (array of activity objects):
 * [{
 *   id, name, type, distance, moving_time, elapsed_time,
 *   total_elevation_gain, start_date, start_date_local,
 *   average_heartrate, max_heartrate, calories, trainer,
 *   sport_type,
 * }]
 */
export const garminActivities = comingSoon;

/**
 * POST /api/garmin/import — import selected activities into challenge_workouts.
 *
 * Request body mirrors Strava import:
 * { classId, activityIds: number[], timezone?: string }
 *
 * Processing will be identical to stravaImport() in strava.controller.js:
 *  - Same-day validation (respects sameDayOnly season setting)
 *  - calorie sanitization via calorieUtils.sanitizeCalories()
 *  - Treadmill detection → draft status until photo proof uploaded
 *  - Auto-assignment to the user's challenge team
 *  - Points withheld until manager approval (where required)
 */
export const garminImport = comingSoon;

/**
 * POST /api/garmin/webhook — Garmin push notification endpoint.
 *
 * Garmin sends a POST to this URL when a new activity is created for any
 * connected user.  The handler will:
 *  1. Validate the HMAC signature.
 *  2. Look up the user by garmin_athlete_id in user_preferences.
 *  3. Check whether the user's active season has auto-import enabled.
 *  4. Check whether the activity type is in the user's allowed-types list.
 *  5. Import automatically (identical pipeline to garminImport()).
 *  6. If activity is a treadmill run, save as draft pending photo proof.
 *
 * See: https://developer.garmin.com/gc-developer-program/activity-api/
 */
export const garminWebhook = comingSoon;
