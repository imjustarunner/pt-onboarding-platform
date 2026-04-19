import pool from '../config/database.js';

const REPORT_REASONS = new Set([
  'spam',
  'harassment',
  'hate_speech',
  'sexual_content',
  'violence',
  'self_harm',
  'misinformation',
  'impersonation',
  'other'
]);

const SUPPORTED_CONTENT_TYPES = new Set([
  'challenge_message',
  'challenge_workout',
  'challenge_workout_comment',
  'club_feed_post',
  'club_feed_comment',
  'user_profile'
]);

const asInt = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const ownerLookupByType = {
  challenge_message: {
    sql: 'SELECT user_id AS owner_id, NULL AS organization_id FROM challenge_messages WHERE id = ? LIMIT 1'
  },
  challenge_workout: {
    sql: `SELECT w.user_id AS owner_id, c.organization_id
          FROM challenge_workouts w
          LEFT JOIN learning_program_classes c ON c.id = w.learning_class_id
          WHERE w.id = ? LIMIT 1`
  },
  challenge_workout_comment: {
    sql: 'SELECT user_id AS owner_id, NULL AS organization_id FROM challenge_workout_comments WHERE id = ? LIMIT 1'
  },
  club_feed_post: {
    sql: 'SELECT author_user_id AS owner_id, organization_id FROM club_feed_posts WHERE id = ? LIMIT 1'
  },
  club_feed_comment: {
    sql: 'SELECT user_id AS owner_id, NULL AS organization_id FROM club_feed_post_comments WHERE id = ? LIMIT 1'
  },
  user_profile: {
    sql: 'SELECT id AS owner_id, NULL AS organization_id FROM users WHERE id = ? LIMIT 1'
  }
};

async function resolveContentOwner(contentType, contentId) {
  const def = ownerLookupByType[contentType];
  if (!def) return { owner_id: null, organization_id: null };
  try {
    const [rows] = await pool.execute(def.sql, [contentId]);
    return rows?.[0] || { owner_id: null, organization_id: null };
  } catch {
    return { owner_id: null, organization_id: null };
  }
}

export const submitContentReport = async (req, res, next) => {
  try {
    const reporterId = Number(req.user?.id || 0);
    if (!reporterId) return res.status(401).json({ error: { message: 'Unauthorized' } });

    const contentType = String(req.body?.contentType || '').trim();
    const contentId = asInt(req.body?.contentId);
    const reason = String(req.body?.reason || '').trim().toLowerCase();
    const details = req.body?.details ? String(req.body.details).slice(0, 2000) : null;
    const alsoBlock = req.body?.alsoBlock === true;

    if (!SUPPORTED_CONTENT_TYPES.has(contentType)) {
      return res.status(400).json({ error: { message: 'Unsupported contentType' } });
    }
    if (!contentId) {
      return res.status(400).json({ error: { message: 'contentId is required' } });
    }
    if (!REPORT_REASONS.has(reason)) {
      return res.status(400).json({ error: { message: 'Invalid reason' } });
    }

    const owner = await resolveContentOwner(contentType, contentId);
    const ownerUserId = owner?.owner_id ? Number(owner.owner_id) : null;
    const orgId = owner?.organization_id ? Number(owner.organization_id) : null;

    await pool.execute(
      `INSERT INTO user_content_reports
         (reporter_user_id, content_type, content_id, content_owner_user_id, organization_id, reason, details, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open')`,
      [reporterId, contentType, contentId, ownerUserId, orgId, reason, details]
    );

    if (alsoBlock && ownerUserId && ownerUserId !== reporterId) {
      await pool.execute(
        `INSERT IGNORE INTO user_blocks (blocker_user_id, blocked_user_id, reason)
         VALUES (?, ?, ?)`,
        [reporterId, ownerUserId, `auto-block from report (${reason})`]
      );
    }

    return res.status(201).json({
      ok: true,
      message: 'Report submitted. Our team reviews flagged content within 24 hours.',
      blocked: alsoBlock && !!ownerUserId && ownerUserId !== reporterId
    });
  } catch (e) {
    next(e);
  }
};

export const blockUser = async (req, res, next) => {
  try {
    const blockerId = Number(req.user?.id || 0);
    if (!blockerId) return res.status(401).json({ error: { message: 'Unauthorized' } });

    const targetId = asInt(req.body?.userId);
    if (!targetId) return res.status(400).json({ error: { message: 'userId is required' } });
    if (targetId === blockerId) {
      return res.status(400).json({ error: { message: 'You cannot block yourself' } });
    }

    const reason = req.body?.reason ? String(req.body.reason).slice(0, 255) : null;
    await pool.execute(
      `INSERT IGNORE INTO user_blocks (blocker_user_id, blocked_user_id, reason)
       VALUES (?, ?, ?)`,
      [blockerId, targetId, reason]
    );

    return res.status(201).json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const unblockUser = async (req, res, next) => {
  try {
    const blockerId = Number(req.user?.id || 0);
    if (!blockerId) return res.status(401).json({ error: { message: 'Unauthorized' } });

    const targetId = asInt(req.params?.userId);
    if (!targetId) return res.status(400).json({ error: { message: 'userId is required' } });

    await pool.execute(
      `DELETE FROM user_blocks WHERE blocker_user_id = ? AND blocked_user_id = ?`,
      [blockerId, targetId]
    );
    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const listMyBlocks = async (req, res, next) => {
  try {
    const blockerId = Number(req.user?.id || 0);
    if (!blockerId) return res.status(401).json({ error: { message: 'Unauthorized' } });

    const [rows] = await pool.execute(
      `SELECT ub.blocked_user_id, ub.reason, ub.created_at,
              u.first_name, u.last_name
       FROM user_blocks ub
       LEFT JOIN users u ON u.id = ub.blocked_user_id
       WHERE ub.blocker_user_id = ?
       ORDER BY ub.created_at DESC`,
      [blockerId]
    );
    return res.json({
      blocks: (rows || []).map((r) => ({
        userId: Number(r.blocked_user_id),
        firstName: r.first_name || null,
        lastName: r.last_name || null,
        reason: r.reason || null,
        createdAt: r.created_at
      }))
    });
  } catch (e) {
    next(e);
  }
};
