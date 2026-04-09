/**
 * Kudos & Emoji Reactions for challenge workouts.
 *
 * KUDOS (limited):
 *   POST   /:classId/workouts/:workoutId/kudos          give kudos
 *   DELETE /:classId/workouts/:workoutId/kudos          take back kudos
 *   GET    /:classId/kudos-stats                        weekly/season kudos leaderboard
 *   GET    /:classId/workouts/:workoutId/kudos           who gave kudos to this workout
 *
 * EMOJI REACTIONS (unlimited, one per emoji per user per workout):
 *   POST   /:classId/workouts/:workoutId/reactions      toggle an emoji reaction on/off
 *   GET    /:classId/workouts/:workoutId/reactions      list reactions with user names
 *
 * BUDGET RULES (per week, per member):
 *   - Total kudos budget: 2 per week (no rollover)
 *   - Intra-team cap:     max 1 to own team members per week
 *   - Cross-team cap:     max 2 to other team members per week
 *   - Self-kudo:          not allowed
 *   - One kudo per workout max
 */
import pool from '../config/database.js';
import { canAccessChallenge } from '../utils/challengeAccess.js';
import { ensureChallengeParticipationAgreementAccepted } from '../utils/challengeParticipationAgreement.js';
import { getWeekStartDate } from '../utils/challengeWeekUtils.js';

const asInt = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };

// ── Shared helpers ────────────────────────────────────────────────────────────

const getWeekCutoff = (klass) => {
  const settings = (() => { try { return JSON.parse(klass?.season_settings_json || '{}'); } catch { return {}; } })();
  return String(settings?.schedule?.weekCutoffTime || klass?.week_cutoff_time || '23:59');
};
const getWeekTz = (klass) => String(
  (() => { try { return JSON.parse(klass?.season_settings_json || '{}'); } catch { return {}; } })()?.schedule?.weekTimeZone
  || klass?.week_time_zone
  || 'America/New_York'
);

async function getAccess(req, classId) {
  const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
  if (!access.ok) return null;
  return access;
}

async function getWorkout(workoutId, classId) {
  const [rows] = await pool.execute(
    `SELECT w.*, t.id as team_id_from_team
     FROM challenge_workouts w
     LEFT JOIN challenge_teams t ON t.learning_class_id = w.learning_class_id
     LEFT JOIN challenge_team_members tm ON tm.team_id = t.id AND tm.provider_user_id = w.user_id
     WHERE w.id = ? AND w.learning_class_id = ? LIMIT 1`,
    [workoutId, classId]
  );
  return rows?.[0] || null;
}

async function getGiverTeamId(userId, classId) {
  const [rows] = await pool.execute(
    `SELECT tm.team_id
     FROM challenge_team_members tm
     INNER JOIN challenge_teams t ON t.id = tm.team_id AND t.learning_class_id = ?
     WHERE tm.provider_user_id = ?
     LIMIT 1`,
    [classId, userId]
  );
  return rows?.[0]?.team_id ? Number(rows[0].team_id) : null;
}

async function getReceiverTeamId(workoutUserId, classId) {
  const [rows] = await pool.execute(
    `SELECT tm.team_id
     FROM challenge_team_members tm
     INNER JOIN challenge_teams t ON t.id = tm.team_id AND t.learning_class_id = ?
     WHERE tm.provider_user_id = ?
     LIMIT 1`,
    [classId, workoutUserId]
  );
  return rows?.[0]?.team_id ? Number(rows[0].team_id) : null;
}

// ── GIVE KUDOS ────────────────────────────────────────────────────────────────

export const giveKudos = async (req, res, next) => {
  try {
    const classId   = asInt(req.params.classId);
    const workoutId = asInt(req.params.workoutId);
    if (!classId || !workoutId) return res.status(400).json({ error: { message: 'Invalid classId/workoutId' } });

    const access = await getAccess(req, classId);
    if (!access) return res.status(403).json({ error: { message: 'Access denied' } });
    const participationAcceptance = await ensureChallengeParticipationAgreementAccepted({
      klass: access.class,
      userId: req.user.id
    });
    if (!participationAcceptance.ok) {
      return res.status(participationAcceptance.status).json({ error: { message: participationAcceptance.message } });
    }

    const workout = await getWorkout(workoutId, classId);
    if (!workout) return res.status(404).json({ error: { message: 'Workout not found' } });

    const giverId    = Number(req.user.id);
    const receiverId = Number(workout.user_id);

    if (giverId === receiverId) {
      return res.status(400).json({ error: { message: 'You cannot give kudos to your own workout.' } });
    }

    // Compute current week start
    const klass      = access.class;
    const weekStart  = getWeekStartDate(new Date(), getWeekCutoff(klass), getWeekTz(klass));

    // Get team membership for giver and receiver
    const [giverTeamId, receiverTeamId] = await Promise.all([
      getGiverTeamId(giverId, classId),
      getReceiverTeamId(receiverId, classId)
    ]);

    // Load giver's weekly kudos usage
    const [weekRows] = await pool.execute(
      `SELECT receiver_team_id, giver_team_id FROM challenge_workout_kudos
       WHERE giver_user_id = ? AND learning_class_id = ? AND week_start_date = ?`,
      [giverId, classId, weekStart]
    );
    const totalGiven = weekRows.length;

    // Total weekly budget = 2
    if (totalGiven >= 2) {
      return res.status(400).json({ error: { message: 'You have used all 2 kudos for this week. They reset each week.' } });
    }

    // Intra-team cap = 1 (giver and receiver on same team)
    const sameTeam = giverTeamId && receiverTeamId && giverTeamId === receiverTeamId;
    if (sameTeam) {
      const intraCount = weekRows.filter((r) => {
        const rTeam = r.receiver_team_id ? Number(r.receiver_team_id) : null;
        return rTeam && rTeam === giverTeamId;
      }).length;
      if (intraCount >= 1) {
        return res.status(400).json({ error: { message: 'You can only give 1 kudos to your own team per week.' } });
      }
    }

    // Insert kudos (UNIQUE key on giver + workout prevents duplicates)
    try {
      await pool.execute(
        `INSERT INTO challenge_workout_kudos
         (workout_id, learning_class_id, week_start_date, giver_user_id, giver_team_id, receiver_user_id, receiver_team_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [workoutId, classId, weekStart, giverId,
         giverTeamId || null, receiverId, receiverTeamId || null]
      );
    } catch (insertErr) {
      if (String(insertErr?.code) === 'ER_DUP_ENTRY') {
        return res.status(400).json({ error: { message: 'You already gave kudos to this workout.' } });
      }
      throw insertErr;
    }

    const budgetRemaining = 1 - (totalGiven); // after this kudo, totalGiven+1 used
    return res.status(201).json({ ok: true, budgetRemaining, weekStart });
  } catch (e) { next(e); }
};

// ── REMOVE KUDOS ──────────────────────────────────────────────────────────────

export const removeKudos = async (req, res, next) => {
  try {
    const classId   = asInt(req.params.classId);
    const workoutId = asInt(req.params.workoutId);
    if (!classId || !workoutId) return res.status(400).json({ error: { message: 'Invalid classId/workoutId' } });

    const access = await getAccess(req, classId);
    if (!access) return res.status(403).json({ error: { message: 'Access denied' } });
    const participationAcceptance = await ensureChallengeParticipationAgreementAccepted({
      klass: access.class,
      userId: req.user.id
    });
    if (!participationAcceptance.ok) {
      return res.status(participationAcceptance.status).json({ error: { message: participationAcceptance.message } });
    }

    const [result] = await pool.execute(
      `DELETE FROM challenge_workout_kudos WHERE giver_user_id = ? AND workout_id = ?`,
      [req.user.id, workoutId]
    );
    if (!result?.affectedRows) {
      return res.status(404).json({ error: { message: 'You have not given kudos to this workout.' } });
    }
    return res.json({ ok: true });
  } catch (e) { next(e); }
};

// ── LIST KUDOS FOR A WORKOUT ──────────────────────────────────────────────────

export const listWorkoutKudos = async (req, res, next) => {
  try {
    const classId   = asInt(req.params.classId);
    const workoutId = asInt(req.params.workoutId);
    if (!classId || !workoutId) return res.status(400).json({ error: { message: 'Invalid classId/workoutId' } });

    const access = await getAccess(req, classId);
    if (!access) return res.status(403).json({ error: { message: 'Access denied' } });

    const [rows] = await pool.execute(
      `SELECT k.id, k.giver_user_id, k.given_at,
              u.first_name, u.last_name, u.profile_photo_path,
              t.team_name as giver_team_name
       FROM challenge_workout_kudos k
       JOIN users u ON u.id = k.giver_user_id
       LEFT JOIN challenge_teams t ON t.id = k.giver_team_id
       WHERE k.workout_id = ? AND k.learning_class_id = ?
       ORDER BY k.given_at DESC`,
      [workoutId, classId]
    );
    const myKudo = (rows || []).find((r) => Number(r.giver_user_id) === Number(req.user.id));
    return res.json({ kudos: rows || [], myKudo: myKudo || null, count: rows?.length || 0 });
  } catch (e) { next(e); }
};

// ── KUDOS STATS (weekly + season leaderboard) ────────────────────────────────

export const getKudosStats = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });

    const access = await getAccess(req, classId);
    if (!access) return res.status(403).json({ error: { message: 'Access denied' } });

    const klass     = access.class;
    const weekStart = req.query.week || getWeekStartDate(new Date(), getWeekCutoff(klass), getWeekTz(klass));

    // Weekly: individual most kudos received
    const [weekTopReceived] = await pool.execute(
      `SELECT k.receiver_user_id, u.first_name, u.last_name, u.profile_photo_path,
              COUNT(*) AS kudos_received
       FROM challenge_workout_kudos k
       JOIN users u ON u.id = k.receiver_user_id
       WHERE k.learning_class_id = ? AND k.week_start_date = ?
       GROUP BY k.receiver_user_id, u.first_name, u.last_name, u.profile_photo_path
       ORDER BY kudos_received DESC
       LIMIT 10`,
      [classId, weekStart]
    );

    // Weekly: individual most kudos given (most generous)
    const [weekTopGiven] = await pool.execute(
      `SELECT k.giver_user_id, u.first_name, u.last_name, u.profile_photo_path,
              COUNT(*) AS kudos_given
       FROM challenge_workout_kudos k
       JOIN users u ON u.id = k.giver_user_id
       WHERE k.learning_class_id = ? AND k.week_start_date = ?
       GROUP BY k.giver_user_id, u.first_name, u.last_name, u.profile_photo_path
       ORDER BY kudos_given DESC
       LIMIT 10`,
      [classId, weekStart]
    );

    // Team: most kudos received FROM other teams (cross-team received)
    const [teamMostReceived] = await pool.execute(
      `SELECT t.team_name, k.receiver_team_id AS team_id, COUNT(*) AS kudos_received
       FROM challenge_workout_kudos k
       JOIN challenge_teams t ON t.id = k.receiver_team_id
       WHERE k.learning_class_id = ? AND k.week_start_date = ?
         AND k.giver_team_id != k.receiver_team_id
       GROUP BY k.receiver_team_id, t.team_name
       ORDER BY kudos_received DESC
       LIMIT 10`,
      [classId, weekStart]
    );

    // Team: most kudos given TO other teams (most supportive cross-team)
    const [teamMostGivenCross] = await pool.execute(
      `SELECT t.team_name, k.giver_team_id AS team_id, COUNT(*) AS kudos_given
       FROM challenge_workout_kudos k
       JOIN challenge_teams t ON t.id = k.giver_team_id
       WHERE k.learning_class_id = ? AND k.week_start_date = ?
         AND k.giver_team_id != k.receiver_team_id
       GROUP BY k.giver_team_id, t.team_name
       ORDER BY kudos_given DESC
       LIMIT 10`,
      [classId, weekStart]
    );

    // Team: most kudos given WITHIN own team (most internally supportive)
    const [teamMostGivenIntra] = await pool.execute(
      `SELECT t.team_name, k.giver_team_id AS team_id, COUNT(*) AS kudos_given_intra
       FROM challenge_workout_kudos k
       JOIN challenge_teams t ON t.id = k.giver_team_id
       WHERE k.learning_class_id = ? AND k.week_start_date = ?
         AND k.giver_team_id = k.receiver_team_id
       GROUP BY k.giver_team_id, t.team_name
       ORDER BY kudos_given_intra DESC
       LIMIT 10`,
      [classId, weekStart]
    );

    // Workout: most kudos this week
    const [topWorkout] = await pool.execute(
      `SELECT k.workout_id, COUNT(*) AS kudos_count,
              w.activity_type, w.distance_value, w.duration_minutes,
              u.first_name, u.last_name
       FROM challenge_workout_kudos k
       JOIN challenge_workouts w ON w.id = k.workout_id
       JOIN users u ON u.id = w.user_id
       WHERE k.learning_class_id = ? AND k.week_start_date = ?
       GROUP BY k.workout_id, w.activity_type, w.distance_value, w.duration_minutes, u.first_name, u.last_name
       ORDER BY kudos_count DESC
       LIMIT 5`,
      [classId, weekStart]
    );

    // My budget remaining this week
    const [myBudgetRows] = await pool.execute(
      `SELECT COUNT(*) AS used FROM challenge_workout_kudos
       WHERE giver_user_id = ? AND learning_class_id = ? AND week_start_date = ?`,
      [req.user.id, classId, weekStart]
    );
    const myUsed      = Number(myBudgetRows?.[0]?.used || 0);
    const myRemaining = Math.max(0, 2 - myUsed);

    // Season totals
    const [seasonTopReceived] = await pool.execute(
      `SELECT k.receiver_user_id, u.first_name, u.last_name, u.profile_photo_path,
              COUNT(*) AS kudos_received
       FROM challenge_workout_kudos k
       JOIN users u ON u.id = k.receiver_user_id
       WHERE k.learning_class_id = ?
       GROUP BY k.receiver_user_id, u.first_name, u.last_name, u.profile_photo_path
       ORDER BY kudos_received DESC
       LIMIT 10`,
      [classId]
    );

    return res.json({
      weekStart,
      myBudget: { total: 2, used: myUsed, remaining: myRemaining },
      weekly: {
        topReceived:     weekTopReceived  || [],
        topGiven:        weekTopGiven     || [],
        topWorkout:      topWorkout       || [],
        teamMostReceived:   teamMostReceived   || [],
        teamMostGivenCross: teamMostGivenCross || [],
        teamMostGivenIntra: teamMostGivenIntra || []
      },
      season: {
        topReceived: seasonTopReceived || []
      }
    });
  } catch (e) { next(e); }
};

// ── BUDGET CHECK (lightweight, for real-time UI) ──────────────────────────────

export const getKudosBudget = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });

    const access = await getAccess(req, classId);
    if (!access) return res.status(403).json({ error: { message: 'Access denied' } });

    const klass     = access.class;
    const weekStart = getWeekStartDate(new Date(), getWeekCutoff(klass), getWeekTz(klass));

    const [rows] = await pool.execute(
      `SELECT receiver_team_id, giver_team_id
       FROM challenge_workout_kudos
       WHERE giver_user_id = ? AND learning_class_id = ? AND week_start_date = ?`,
      [req.user.id, classId, weekStart]
    );
    const giverTeamId = await getGiverTeamId(req.user.id, classId);
    const intraCount  = (rows || []).filter((r) => {
      return r.receiver_team_id && giverTeamId && Number(r.receiver_team_id) === giverTeamId;
    }).length;

    // workout_ids I've already kudoed
    const [kudoedRows] = await pool.execute(
      `SELECT workout_id FROM challenge_workout_kudos WHERE giver_user_id = ? AND learning_class_id = ?`,
      [req.user.id, classId]
    );
    const kudoedWorkoutIds = (kudoedRows || []).map((r) => Number(r.workout_id));

    return res.json({
      weekStart,
      total:       2,
      used:        rows.length,
      remaining:   Math.max(0, 2 - rows.length),
      intraCap:    1,
      intraUsed:   intraCount,
      intraRemaining: Math.max(0, 1 - intraCount),
      kudoedWorkoutIds
    });
  } catch (e) { next(e); }
};

// ── EMOJI REACTIONS ───────────────────────────────────────────────────────────

// Valid emoji set — device-native Unicode (render as Apple/Android native)
const VALID_EMOJI = new Set([
  '👏','🔥','💪','🏆','⚡','🙌','😤','🎯','🥊','💥',
  '🚀','👟','🏃','❤️','🤙','🫡','💯','🤩','😍','👍',
  '😂','🥇','🎉','💎','⭐','🌟','💫','🏅','🥳','😎'
]);

/** Returns true if the value is a valid icon reference like "icon:42" */
const isIconRef = (v) => /^icon:\d+$/.test(String(v || ''));

export const toggleReaction = async (req, res, next) => {
  try {
    const classId   = asInt(req.params.classId);
    const workoutId = asInt(req.params.workoutId);
    if (!classId || !workoutId) return res.status(400).json({ error: { message: 'Invalid classId/workoutId' } });

    const access = await getAccess(req, classId);
    if (!access) return res.status(403).json({ error: { message: 'Access denied' } });
    const participationAcceptance = await ensureChallengeParticipationAgreementAccepted({
      klass: access.class,
      userId: req.user.id
    });
    if (!participationAcceptance.ok) {
      return res.status(participationAcceptance.status).json({ error: { message: participationAcceptance.message } });
    }

    const emoji = String(req.body?.emoji || '').trim();
    if (!emoji) return res.status(400).json({ error: { message: 'emoji is required' } });

    // Accept valid emoji from allowlist OR icon references like "icon:42"
    if (!VALID_EMOJI.has(emoji) && !isIconRef(emoji)) {
      if (emoji.length > 64) return res.status(400).json({ error: { message: 'Invalid reaction' } });
    }
    if (emoji.length > 64) return res.status(400).json({ error: { message: 'Invalid reaction' } });

    // Check if already reacted with this emoji (toggle off)
    const [existing] = await pool.execute(
      `SELECT id FROM challenge_workout_reactions WHERE user_id = ? AND workout_id = ? AND emoji = ? LIMIT 1`,
      [req.user.id, workoutId, emoji]
    );
    if (existing?.length) {
      await pool.execute(
        `DELETE FROM challenge_workout_reactions WHERE id = ?`,
        [existing[0].id]
      );
      return res.json({ ok: true, action: 'removed', emoji });
    }

    // Verify workout belongs to this season
    const [wRows] = await pool.execute(
      `SELECT id FROM challenge_workouts WHERE id = ? AND learning_class_id = ? LIMIT 1`,
      [workoutId, classId]
    );
    if (!wRows?.length) return res.status(404).json({ error: { message: 'Workout not found' } });

    await pool.execute(
      `INSERT INTO challenge_workout_reactions (workout_id, learning_class_id, user_id, emoji) VALUES (?, ?, ?, ?)`,
      [workoutId, classId, req.user.id, emoji]
    );
    return res.status(201).json({ ok: true, action: 'added', emoji });
  } catch (e) { next(e); }
};

export const listReactions = async (req, res, next) => {
  try {
    const classId   = asInt(req.params.classId);
    const workoutId = asInt(req.params.workoutId);
    if (!classId || !workoutId) return res.status(400).json({ error: { message: 'Invalid ids' } });

    const access = await getAccess(req, classId);
    if (!access) return res.status(403).json({ error: { message: 'Access denied' } });

    const [rows] = await pool.execute(
      `SELECT r.emoji, r.user_id, r.reacted_at, u.first_name, u.last_name,
              ic.file_path AS icon_file_path
       FROM challenge_workout_reactions r
       JOIN users u ON u.id = r.user_id
       LEFT JOIN icons ic ON ic.id = CASE WHEN r.emoji REGEXP '^icon:[0-9]+$' THEN CAST(SUBSTRING(r.emoji, 6) AS UNSIGNED) ELSE NULL END
       WHERE r.workout_id = ? AND r.learning_class_id = ?
       ORDER BY r.reacted_at ASC`,
      [workoutId, classId]
    );

    const baseUrl = String(process.env.BACKEND_PUBLIC_URL || process.env.BACKEND_URL || '').replace(/\/$/, '');
    // Group by emoji
    const byEmoji = {};
    for (const r of rows || []) {
      if (!byEmoji[r.emoji]) byEmoji[r.emoji] = { iconUrl: r.icon_file_path ? `${baseUrl}/uploads/${r.icon_file_path}` : null, users: [] };
      byEmoji[r.emoji].users.push({ userId: Number(r.user_id), firstName: r.first_name, lastName: r.last_name });
    }

    const grouped = Object.entries(byEmoji).map(([emoji, { iconUrl, users }]) => ({
      emoji,
      iconUrl: iconUrl || null,
      count: users.length,
      users,
      iMine: users.some((u) => Number(u.userId) === Number(req.user.id))
    })).sort((a, b) => b.count - a.count);

    return res.json({ reactions: grouped });
  } catch (e) { next(e); }
};

// Exported emoji set for frontend reference
export const listEmojiOptions = async (_req, res) => {
  return res.json({ emojis: [...VALID_EMOJI] });
};
