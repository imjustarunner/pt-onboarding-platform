/**
 * seasonRecognitionStandings.controller.js
 *
 * Manager-gated weekly trophy posting + live season-standing display + member
 * splash tracking for the Season Recognition system.
 *
 * Flow:
 *   1. After a week boundary passes, ensureWeekStatusRows() is called lazily
 *      on the manager's dashboard load to insert 'pending' rows.
 *   2. Manager sees RecognitionWeekPrompt, chooses "Post Trophies" or "Dismiss".
 *   3. postWeekTrophies() runs winner computation and writes grant rows.
 *   4. Members see SeasonRecognitionSplash (per-user, per-week dismissal).
 */

import pool from '../config/database.js';
import { normalizeRecognitionCategories } from './learningProgramClasses.controller.js';
import ChallengeWorkout from '../models/ChallengeWorkout.model.js';
import { getWeekStartDate } from '../utils/challengeWeekUtils.js';
import { canUserManageChallengeClass, getUserClubMembership } from '../utils/sscClubAccess.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

const parseJson = (raw, fallback = {}) => {
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
};

const toInt = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

/** Parse HH:MM cutoff time from class row (mirrors scoreboard.controller.js). */
const getWeekCutoffTime = (klass) => {
  const s = parseJson(klass?.season_settings_json);
  const schedule = parseJson(s?.schedule);
  const raw = String(schedule?.weekEndsSundayAt || klass?.week_start_time || '00:00').trim();
  return /^\d{1,2}:\d{2}$/.test(raw) ? raw : '00:00';
};

const getWeekTimeZone = (klass) => {
  const s = parseJson(klass?.season_settings_json);
  const schedule = parseJson(s?.schedule);
  const tz = String(schedule?.weekTimeZone || 'UTC').trim();
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return tz;
  } catch { return 'UTC'; }
};

/**
 * Compute 1-based week number from season start for a given date.
 * Uses Monday boundaries (matches getWeekStartDate behaviour).
 */
const computeWeekNumber = (seasonStartsAt, weekStartDate) => {
  const origin = new Date(seasonStartsAt);
  const originWeekStart = getWeekStartDate(origin);      // snap to Monday
  const target = new Date(weekStartDate);
  const diffMs = target.getTime() - new Date(originWeekStart).getTime();
  const diffWeeks = Math.floor(diffMs / (7 * 24 * 3600 * 1000));
  return diffWeeks + 1; // 1-based
};

/**
 * Fetch class row with recognition config.  Returns null if not found.
 */
const fetchClass = async (classId) => {
  const [rows] = await pool.execute(
    `SELECT id, organization_id, starts_at, ends_at, week_start_time,
            recognition_categories_json, masters_age_threshold,
            season_settings_json, status
     FROM learning_program_classes WHERE id = ? LIMIT 1`,
    [classId]
  );
  return rows?.[0] || null;
};

/**
 * Return all weeks that have already ended (their Sunday midnight passed) for
 * this season. Returns array of { weekNumber, weekStartDate }.
 */
const getPastWeeks = (klass) => {
  const cutoff = getWeekCutoffTime(klass);
  const tz = getWeekTimeZone(klass);
  const now = new Date();
  const seasonStart = new Date(klass.starts_at);
  const seasonEnd = klass.ends_at ? new Date(klass.ends_at) : null;

  const weeks = [];
  let current = new Date(getWeekStartDate(seasonStart, cutoff, tz));
  let weekNum = 1;

  while (true) {
    const nextWeekStart = new Date(current.getTime() + 7 * 24 * 3600 * 1000);
    // Week has "ended" when its end boundary is in the past
    if (nextWeekStart > now) break;
    if (seasonEnd && current >= seasonEnd) break;
    weeks.push({
      weekNumber: weekNum,
      weekStartDate: current.toISOString().slice(0, 10)
    });
    current = nextWeekStart;
    weekNum++;
  }
  return weeks;
};

// ─── Ensure week status rows exist (lazy creation) ──────────────────────────

const ensureWeekStatusRows = async (classId, klass) => {
  const pastWeeks = getPastWeeks(klass);
  if (!pastWeeks.length) return;
  // Batch upsert all past weeks as 'pending' (ON DUPLICATE KEY does nothing)
  const placeholders = pastWeeks.map(() => '(?, ?, ?, ?)').join(', ');
  const values = pastWeeks.flatMap(w => [classId, w.weekNumber, w.weekStartDate, 'pending']);
  await pool.execute(
    `INSERT IGNORE INTO season_recognition_week_status
       (learning_class_id, week_number, week_start_date, status)
     VALUES ${placeholders}`,
    values
  );
};

// ─── Icon URL helper ─────────────────────────────────────────────────────────

const resolveIconUrl = async (iconRef) => {
  if (!iconRef) return null;
  if (String(iconRef).startsWith('icon:')) {
    const iconId = toInt(String(iconRef).replace('icon:', ''));
    if (!iconId) return null;
    try {
      const { default: Icon } = await import('../models/Icon.model.js');
      const [rows] = await pool.execute(`SELECT id, file_path FROM icons WHERE id = ? LIMIT 1`, [iconId]);
      if (rows?.[0]) return Icon.getIconUrl(rows[0]);
    } catch { /* non-fatal */ }
  }
  return null;
};

// ─── GET /seasons/:id/recognition/manager-pending ───────────────────────────

export const getManagerPendingWeeks = async (req, res, next) => {
  try {
    const classId = toInt(req.params.id);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid season id' } });

    const access = await canUserManageChallengeClass(req.user, classId);
    if (!access.ok) return res.status(access.status ?? 403).json({ error: { message: access.message } });

    const klass = await fetchClass(classId);
    if (!klass) return res.status(404).json({ error: { message: 'Season not found' } });

    await ensureWeekStatusRows(classId, klass);

    const [rows] = await pool.execute(
      `SELECT week_number, week_start_date, status, snoozed_until, posted_at
       FROM season_recognition_week_status
       WHERE learning_class_id = ?
         AND status = 'pending'
         AND (snoozed_until IS NULL OR snoozed_until < NOW())
       ORDER BY week_number ASC`,
      [classId]
    );

    // Only show if the season has active recognition categories
    const categories = normalizeRecognitionCategories(klass.recognition_categories_json) || [];
    const activeCategories = categories.filter(c => c.active);

    return res.json({
      pendingWeeks: rows.map(r => ({
        weekNumber: r.week_number,
        weekStartDate: r.week_start_date,
        status: r.status,
        snoozedUntil: r.snoozed_until || null,
        postedAt: r.posted_at || null
      })),
      hasRecognitionConfig: activeCategories.length > 0
    });
  } catch (e) { next(e); }
};

// ─── POST /seasons/:id/recognition/snooze-week ──────────────────────────────

export const snoozeWeekTrophies = async (req, res, next) => {
  try {
    const classId = toInt(req.params.id);
    const weekNumber = toInt(req.body?.weekNumber);
    if (!classId || !weekNumber) return res.status(400).json({ error: { message: 'classId and weekNumber required' } });

    const access = await canUserManageChallengeClass(req.user, classId);
    if (!access.ok) return res.status(access.status ?? 403).json({ error: { message: access.message } });

    await pool.execute(
      `UPDATE season_recognition_week_status
       SET snoozed_until = DATE_ADD(NOW(), INTERVAL 20 HOUR)
       WHERE learning_class_id = ? AND week_number = ?`,
      [classId, weekNumber]
    );
    return res.json({ ok: true });
  } catch (e) { next(e); }
};

// ─── POST /seasons/:id/recognition/post-week ────────────────────────────────

export const postWeekTrophies = async (req, res, next) => {
  try {
    const classId = toInt(req.params.id);
    const weekNumber = toInt(req.body?.weekNumber);
    if (!classId || !weekNumber) return res.status(400).json({ error: { message: 'classId and weekNumber required' } });

    const access = await canUserManageChallengeClass(req.user, classId);
    if (!access.ok) return res.status(access.status ?? 403).json({ error: { message: access.message } });

    const klass = await fetchClass(classId);
    if (!klass) return res.status(404).json({ error: { message: 'Season not found' } });

    // Find the weekStartDate for this weekNumber
    const [statusRows] = await pool.execute(
      `SELECT week_start_date FROM season_recognition_week_status
       WHERE learning_class_id = ? AND week_number = ? LIMIT 1`,
      [classId, weekNumber]
    );
    const weekStartDate = statusRows?.[0]?.week_start_date;
    if (!weekStartDate) return res.status(404).json({ error: { message: 'Week not found' } });

    const categories = normalizeRecognitionCategories(klass.recognition_categories_json) || [];
    const activeCategories = categories.filter(c => c.active);
    const klassWithCats = { ...klass, _allCategories: categories };

    const recognitionEntries = [];
    for (const cat of activeCategories) {
      const entries = await ChallengeWorkout.computeRecognitionWinner(classId, cat, weekStartDate, klassWithCats);
      recognitionEntries.push(...entries);
    }

    // Write grant rows (same logic as scoreboard closeWeek, adds week_number + workout_id)
    const upsertGrant = async (entry, winner) => {
      if (!entry || !winner?.user_id) return;
      const label = String(entry.label || '').slice(0, 255);
      const icon = entry.icon ? String(entry.icon).slice(0, 128) : null;
      const period = ['weekly', 'monthly', 'season', 'challenge'].includes(entry.period) ? entry.period : 'weekly';
      const metric = entry.metric ? String(entry.metric).slice(0, 64) : '';
      const aggregation = entry.aggregation ? String(entry.aggregation).slice(0, 64) : 'most';
      const categoryId = entry.categoryId ? String(entry.categoryId).slice(0, 64) : '';
      if (!categoryId || !label) return;
      const metricValue = winner.value != null && Number.isFinite(Number(winner.value)) ? Number(winner.value) : null;
      const workoutId = winner.workout_id ? toInt(winner.workout_id) : null;
      const detailsJson = JSON.stringify({
        firstName: winner.first_name || null,
        lastName: winner.last_name || null,
        teamName: winner.team_name || null,
        milestoneThreshold: entry.milestoneThreshold ?? null,
        referenceTarget: entry.referenceTarget ?? null
      });
      await pool.execute(
        `INSERT INTO challenge_member_award_grants
           (learning_class_id, user_id, category_id, label, icon, period, metric, aggregation,
            week_start_date, week_number, workout_id, metric_value, details_json, granted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           label        = VALUES(label),
           icon         = VALUES(icon),
           period       = VALUES(period),
           metric       = VALUES(metric),
           aggregation  = VALUES(aggregation),
           week_number  = VALUES(week_number),
           workout_id   = VALUES(workout_id),
           metric_value = VALUES(metric_value),
           details_json = VALUES(details_json),
           updated_at   = CURRENT_TIMESTAMP`,
        [classId, Number(winner.user_id), categoryId, label, icon, period, metric, aggregation,
         weekStartDate, weekNumber, workoutId, metricValue, detailsJson]
      );
    };

    let grantCount = 0;
    for (const entry of recognitionEntries) {
      if (Array.isArray(entry?.winners) && entry.winners.length) {
        for (const w of entry.winners) { await upsertGrant(entry, w); grantCount++; }
      } else if (entry?.winner?.user_id) {
        await upsertGrant(entry, entry.winner); grantCount++;
      }
    }

    // Mark week as posted
    await pool.execute(
      `UPDATE season_recognition_week_status
       SET status = 'posted', posted_at = NOW(), posted_by_user_id = ?
       WHERE learning_class_id = ? AND week_number = ?`,
      [req.user.id, classId, weekNumber]
    );

    return res.json({
      ok: true,
      weekNumber,
      grantCount,
      recognitionCount: recognitionEntries.length
    });
  } catch (e) { next(e); }
};

// ─── POST /seasons/:id/recognition/backfill-past-weeks ──────────────────────
// Re-evaluates every past week with the CURRENT recognition_categories_json
// and upserts grant rows. Does NOT change season_recognition_week_status so
// the manager's pending-week queue is preserved.
// Use this after adding a new recognition category mid-season.

export const backfillPastWeeks = async (req, res, next) => {
  try {
    const classId = toInt(req.params.id);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid season id' } });

    const access = await canUserManageChallengeClass(req.user, classId);
    if (!access.ok) return res.status(access.status ?? 403).json({ error: { message: access.message } });

    const klass = await fetchClass(classId);
    if (!klass) return res.status(404).json({ error: { message: 'Season not found' } });

    await ensureWeekStatusRows(classId, klass);

    const pastWeeks = getPastWeeks(klass);
    if (!pastWeeks.length) return res.json({ ok: true, weeksProcessed: 0, grantCount: 0 });

    // Pre-fetch existing week_start_date → week_number mapping from status table
    const [statusRows] = await pool.execute(
      `SELECT week_number, week_start_date FROM season_recognition_week_status WHERE learning_class_id = ?`,
      [classId]
    );
    const weekNumByDate = new Map(statusRows.map(r => [String(r.week_start_date).slice(0, 10), Number(r.week_number)]));

    const categories = normalizeRecognitionCategories(klass.recognition_categories_json) || [];
    const activeCategories = categories.filter(c => c.active);
    const klassWithCats = { ...klass, _allCategories: categories };

    let grantCount = 0;

    const upsertGrant = async (entry, winner, weekStartDate, weekNumber) => {
      if (!entry || !winner?.user_id) return;
      const label = String(entry.label || '').slice(0, 255);
      const icon = entry.icon ? String(entry.icon).slice(0, 128) : null;
      const period = ['weekly', 'monthly', 'season', 'challenge'].includes(entry.period) ? entry.period : 'weekly';
      const metric = entry.metric ? String(entry.metric).slice(0, 64) : '';
      const aggregation = entry.aggregation ? String(entry.aggregation).slice(0, 64) : 'most';
      const categoryId = entry.categoryId ? String(entry.categoryId).slice(0, 64) : '';
      if (!categoryId || !label) return;
      const metricValue = winner.value != null && Number.isFinite(Number(winner.value)) ? Number(winner.value) : null;
      const workoutId = winner.workout_id ? toInt(winner.workout_id) : null;
      const detailsJson = JSON.stringify({
        firstName: winner.first_name || null,
        lastName: winner.last_name || null,
        teamName: winner.team_name || null,
        milestoneThreshold: entry.milestoneThreshold ?? null,
        referenceTarget: entry.referenceTarget ?? null
      });
      await pool.execute(
        `INSERT INTO challenge_member_award_grants
           (learning_class_id, user_id, category_id, label, icon, period, metric, aggregation,
            week_start_date, week_number, workout_id, metric_value, details_json, granted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           label        = VALUES(label),
           icon         = VALUES(icon),
           period       = VALUES(period),
           metric       = VALUES(metric),
           aggregation  = VALUES(aggregation),
           week_number  = VALUES(week_number),
           workout_id   = VALUES(workout_id),
           metric_value = VALUES(metric_value),
           details_json = VALUES(details_json),
           updated_at   = CURRENT_TIMESTAMP`,
        [classId, Number(winner.user_id), categoryId, label, icon, period, metric, aggregation,
         weekStartDate, weekNumber, workoutId, metricValue, detailsJson]
      );
      grantCount++;
    };

    for (const { weekNumber, weekStartDate } of pastWeeks) {
      const resolvedWeekNum = weekNumByDate.get(weekStartDate) ?? weekNumber;
      const recognitionEntries = [];
      for (const cat of activeCategories) {
        const entries = await ChallengeWorkout.computeRecognitionWinner(classId, cat, weekStartDate, klassWithCats);
        recognitionEntries.push(...entries);
      }
      for (const entry of recognitionEntries) {
        if (Array.isArray(entry?.winners) && entry.winners.length) {
          for (const w of entry.winners) await upsertGrant(entry, w, weekStartDate, resolvedWeekNum);
        } else if (entry?.winner?.user_id) {
          await upsertGrant(entry, entry.winner, weekStartDate, resolvedWeekNum);
        }
      }
    }

    return res.json({ ok: true, weeksProcessed: pastWeeks.length, grantCount });
  } catch (e) { next(e); }
};

// ─── GET /seasons/:id/recognition/standings ──────────────────────────────────
// Live standings: last week's winners + current season-level leaders.
// Public — no auth required but viewer membership may be checked by caller.

export const getRecognitionStandings = async (req, res, next) => {
  try {
    const classId = toInt(req.params.id);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid season id' } });

    const klass = await fetchClass(classId);
    if (!klass) return res.status(404).json({ error: { message: 'Season not found' } });

    // Last posted week
    const [lastPostedRows] = await pool.execute(
      `SELECT MAX(week_number) AS max_week FROM season_recognition_week_status
       WHERE learning_class_id = ? AND status = 'posted'`,
      [classId]
    );
    const lastPostedWeek = lastPostedRows?.[0]?.max_week || null;

    // Weekly winners from grants for the last posted week
    let weeklyWinners = [];
    if (lastPostedWeek) {
      const [grantRows] = await pool.execute(
        `SELECT g.user_id, g.label, g.icon, g.week_number, g.week_start_date,
                g.metric_value, g.workout_id, g.details_json,
                u.first_name, u.last_name, u.profile_photo_path
         FROM challenge_member_award_grants g
         LEFT JOIN users u ON u.id = g.user_id
         WHERE g.learning_class_id = ? AND g.week_number = ?
         ORDER BY g.label`,
        [classId, lastPostedWeek]
      );
      weeklyWinners = await Promise.all(grantRows.map(async (r) => {
        const details = parseJson(r.details_json, {});
        return {
          userId: r.user_id,
          label: r.label,
          icon: r.icon || null,
          iconUrl: await resolveIconUrl(r.icon),
          weekNumber: r.week_number,
          weekStartDate: r.week_start_date,
          metricValue: r.metric_value != null ? Number(r.metric_value) : null,
          workoutId: r.workout_id || null,
          firstName: r.first_name || details.firstName || null,
          lastName: r.last_name || details.lastName || null,
          teamName: details.teamName || null
        };
      }));
    }

    // Live season standings — compute current leader for each active category
    const categories = normalizeRecognitionCategories(klass.recognition_categories_json) || [];
    const seasonCategories = categories.filter(c => c.active && c.period === 'season');
    const klassWithCats = { ...klass, _allCategories: categories };

    const seasonStandings = [];
    for (const cat of seasonCategories) {
      const entries = await ChallengeWorkout.computeRecognitionWinner(classId, cat, null, klassWithCats);
      for (const entry of entries) {
        const winner = entry.winner || null;
        seasonStandings.push({
          categoryId: entry.categoryId,
          label: entry.label,
          icon: entry.icon || null,
          iconUrl: await resolveIconUrl(entry.icon),
          leader: winner ? {
            userId: winner.user_id,
            firstName: winner.first_name || null,
            lastName: winner.last_name || null,
            teamName: winner.team_name || null,
            metricValue: winner.value != null ? Number(winner.value) : null,
            workoutId: winner.workout_id || null
          } : null
        });
      }
    }

    return res.json({
      classId,
      lastPostedWeek,
      weeklyWinners,
      seasonStandings
    });
  } catch (e) { next(e); }
};

// ─── GET /seasons/:id/recognition/splash ─────────────────────────────────────
// Returns unseen weekly winners + standings for logged-in member.

export const getPendingRecognitionSplash = async (req, res, next) => {
  try {
    const classId = toInt(req.params.id);
    const userId = req.user?.id;
    if (!classId || !userId) return res.status(400).json({ error: { message: 'Invalid request' } });

    // Viewer must be a member
    const membership = await getUserClubMembership(userId, null, classId);
    // getUserClubMembership may not support classId directly — fetch club from class
    // We'll just skip hard membership check; splash is harmless if they see it.

    // Find the latest posted week
    const [lastRows] = await pool.execute(
      `SELECT MAX(week_number) AS max_week FROM season_recognition_week_status
       WHERE learning_class_id = ? AND status = 'posted'`,
      [classId]
    );
    const lastPostedWeek = lastRows?.[0]?.max_week || null;
    if (!lastPostedWeek) return res.json({ hasSplash: false });

    // Which splash types has this user already dismissed for this week?
    const [viewedRows] = await pool.execute(
      `SELECT splash_type FROM season_recognition_splash_views
       WHERE learning_class_id = ? AND week_number = ? AND user_id = ?`,
      [classId, lastPostedWeek, userId]
    );
    const viewedTypes = new Set(viewedRows.map(r => r.splash_type));
    const needsWeekly = !viewedTypes.has('weekly');
    const needsStandings = !viewedTypes.has('standings');
    if (!needsWeekly && !needsStandings) return res.json({ hasSplash: false });

    let weeklyWinners = [];
    if (needsWeekly) {
      const [grantRows] = await pool.execute(
        `SELECT g.user_id, g.label, g.icon, g.week_number, g.metric_value,
                g.workout_id, g.details_json,
                u.first_name, u.last_name
         FROM challenge_member_award_grants g
         LEFT JOIN users u ON u.id = g.user_id
         WHERE g.learning_class_id = ? AND g.week_number = ?
         ORDER BY g.label`,
        [classId, lastPostedWeek]
      );
      weeklyWinners = await Promise.all(grantRows.map(async r => {
        const details = parseJson(r.details_json, {});
        return {
          userId: r.user_id,
          label: r.label,
          icon: r.icon || null,
          iconUrl: await resolveIconUrl(r.icon),
          weekNumber: r.week_number,
          metricValue: r.metric_value != null ? Number(r.metric_value) : null,
          workoutId: r.workout_id || null,
          firstName: r.first_name || details.firstName || null,
          lastName: r.last_name || details.lastName || null
        };
      }));
    }

    // Season standings (reuse getRecognitionStandings logic inline)
    let seasonStandings = [];
    if (needsStandings) {
      const klass = await fetchClass(classId);
      if (klass) {
        const categories = normalizeRecognitionCategories(klass.recognition_categories_json) || [];
        const seasonCategories = categories.filter(c => c.active && c.period === 'season');
        const klassWithCats = { ...klass, _allCategories: categories };
        for (const cat of seasonCategories) {
          const entries = await ChallengeWorkout.computeRecognitionWinner(classId, cat, null, klassWithCats);
          for (const entry of entries) {
            const winner = entry.winner || null;
            seasonStandings.push({
              categoryId: entry.categoryId,
              label: entry.label,
              icon: entry.icon || null,
              iconUrl: await resolveIconUrl(entry.icon),
              leader: winner ? {
                userId: winner.user_id,
                firstName: winner.first_name || null,
                lastName: winner.last_name || null,
                metricValue: winner.value != null ? Number(winner.value) : null,
                workoutId: winner.workout_id || null
              } : null
            });
          }
        }
      }
    }

    return res.json({
      hasSplash: true,
      weekNumber: lastPostedWeek,
      needsWeekly,
      needsStandings,
      weeklyWinners,
      seasonStandings
    });
  } catch (e) { next(e); }
};

// ─── POST /seasons/:id/recognition/splash/dismiss ────────────────────────────

export const dismissRecognitionSplash = async (req, res, next) => {
  try {
    const classId = toInt(req.params.id);
    const userId = req.user?.id;
    const weekNumber = toInt(req.body?.weekNumber);
    const splashTypes = Array.isArray(req.body?.splashTypes) ? req.body.splashTypes : ['weekly', 'standings'];
    if (!classId || !userId || !weekNumber) return res.status(400).json({ error: { message: 'classId, weekNumber required' } });

    const validTypes = splashTypes.filter(t => ['weekly', 'standings'].includes(t));
    if (!validTypes.length) return res.json({ ok: true });

    const placeholders = validTypes.map(() => '(?, ?, ?, ?)').join(', ');
    const values = validTypes.flatMap(t => [classId, weekNumber, t, userId]);
    await pool.execute(
      `INSERT IGNORE INTO season_recognition_splash_views
         (learning_class_id, week_number, splash_type, user_id)
       VALUES ${placeholders}`,
      values
    );
    return res.json({ ok: true });
  } catch (e) { next(e); }
};

// ─── GET /seasons/:id/recognition/member-summary ─────────────────────────────
// Used by trophy case — returns awards grouped by label+icon.

export const getMemberRecognitionSummary = async ({ classId, userId }) => {
  // Only return grants from weeks the manager has officially posted/published
  const [rows] = await pool.execute(
    `SELECT g.category_id, g.label, g.icon, g.week_number, g.workout_id,
            g.metric_value, g.week_start_date
     FROM challenge_member_award_grants g
     INNER JOIN season_recognition_week_status ws
       ON ws.learning_class_id = g.learning_class_id
      AND ws.week_number = g.week_number
      AND ws.status = 'posted'
     WHERE g.user_id = ? AND g.learning_class_id = ?
     ORDER BY g.week_number`,
    [userId, classId]
  );
  if (!rows.length) return [];

  // Group by categoryId (same award type across weeks)
  const map = new Map();
  for (const r of rows) {
    const key = r.category_id;
    if (!map.has(key)) {
      map.set(key, {
        categoryId: r.category_id,
        label: r.label,
        icon: r.icon || null,
        iconUrl: null, // resolved below
        count: 0,
        weekNumbers: [],
        grants: []
      });
    }
    const entry = map.get(key);
    entry.count++;
    if (r.week_number) entry.weekNumbers.push(r.week_number);
    entry.grants.push({
      weekNumber: r.week_number,
      weekStartDate: r.week_start_date,
      metricValue: r.metric_value != null ? Number(r.metric_value) : null,
      workoutId: r.workout_id || null
    });
  }

  // Resolve icon URLs
  const items = [...map.values()];
  for (const item of items) {
    item.iconUrl = await resolveIconUrl(item.icon);
  }
  return items;
};
