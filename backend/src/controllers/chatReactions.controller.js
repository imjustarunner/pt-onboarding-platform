import pool from '../config/database.js';

/**
 * Reactions on platform chat_messages. Mirrors the activity-feed reactions
 * pattern (challengeKudos.controller.js): a user can stack different reactions
 * on the same message, but cannot add the same reaction code twice.
 *
 * "code" is either a unicode emoji like "🔥" or a custom-icon ref like
 * "icon:42" referencing icons.id (same convention used for workout
 * reactions, so frontend pickers can be reused).
 */

const VALID_EMOJI = new Set([
  '👏','🔥','💪','🏆','⚡','🙌','😤','🎯','🥊','💥',
  '🚀','👟','🏃','❤️','🤙','🫡','💯','🤩','😍','👍',
  '😂','🥇','🎉','💎','⭐','🌟','💫','🏅','🥳','😎'
]);

const isIconRef = (v) => /^icon:\d+$/.test(String(v || ''));

async function assertCallerInThreadForMessage(userId, messageId) {
  const [rows] = await pool.execute(
    `SELECT 1
       FROM chat_messages m
       INNER JOIN chat_thread_participants tp
         ON tp.thread_id = m.thread_id AND tp.user_id = ?
      WHERE m.id = ?
      LIMIT 1`,
    [userId, messageId]
  );
  return rows?.length > 0;
}

export const addReaction = async (req, res, next) => {
  try {
    const messageId = parseInt(req.params.messageId, 10);
    if (!messageId) return res.status(400).json({ error: { message: 'messageId is required' } });
    const code = String(req.body?.code || req.body?.emoji || '').trim();
    if (!code) return res.status(400).json({ error: { message: 'code is required' } });
    if (code.length > 64) return res.status(400).json({ error: { message: 'Invalid reaction' } });
    if (!VALID_EMOJI.has(code) && !isIconRef(code)) {
      // Allow other unicode characters that are 1-2 graphemes - just cap length.
      if (code.length > 16) return res.status(400).json({ error: { message: 'Invalid reaction' } });
    }

    const ok = await assertCallerInThreadForMessage(req.user.id, messageId);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied to this thread' } });

    let iconId = null;
    if (isIconRef(code)) {
      iconId = parseInt(code.slice(5), 10) || null;
    } else if (req.body?.iconId) {
      const n = parseInt(req.body.iconId, 10);
      if (Number.isFinite(n) && n > 0) iconId = n;
    }

    await pool.execute(
      `INSERT IGNORE INTO chat_message_reactions (message_id, user_id, reaction_code, reaction_icon_id)
       VALUES (?, ?, ?, ?)`,
      [messageId, req.user.id, code, iconId]
    );
    return res.status(201).json({ ok: true, action: 'added', code });
  } catch (e) {
    next(e);
  }
};

export const removeReaction = async (req, res, next) => {
  try {
    const messageId = parseInt(req.params.messageId, 10);
    const code = String(req.params.code || '').trim();
    if (!messageId || !code) {
      return res.status(400).json({ error: { message: 'messageId and code are required' } });
    }
    const ok = await assertCallerInThreadForMessage(req.user.id, messageId);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied to this thread' } });

    await pool.execute(
      `DELETE FROM chat_message_reactions
        WHERE message_id = ? AND user_id = ? AND reaction_code = ?`,
      [messageId, req.user.id, code]
    );
    return res.json({ ok: true, action: 'removed', code });
  } catch (e) {
    next(e);
  }
};

export const listReactions = async (req, res, next) => {
  try {
    const messageId = parseInt(req.params.messageId, 10);
    if (!messageId) return res.status(400).json({ error: { message: 'messageId is required' } });
    const ok = await assertCallerInThreadForMessage(req.user.id, messageId);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied to this thread' } });

    const [rows] = await pool.execute(
      `SELECT r.reaction_code, r.user_id, r.created_at,
              u.first_name, u.last_name,
              ic.file_path AS icon_file_path
         FROM chat_message_reactions r
         JOIN users u ON u.id = r.user_id
         LEFT JOIN icons ic ON ic.id = r.reaction_icon_id
        WHERE r.message_id = ?
        ORDER BY r.created_at ASC`,
      [messageId]
    );

    const baseUrl = String(process.env.BACKEND_PUBLIC_URL || process.env.BACKEND_URL || '').replace(/\/$/, '');
    const byCode = {};
    for (const r of rows || []) {
      const code = r.reaction_code;
      if (!byCode[code]) {
        byCode[code] = {
          iconUrl: r.icon_file_path ? `${baseUrl}/uploads/${r.icon_file_path}` : null,
          users: []
        };
      }
      byCode[code].users.push({
        userId: Number(r.user_id),
        firstName: r.first_name,
        lastName: r.last_name
      });
    }
    const grouped = Object.entries(byCode).map(([code, { iconUrl, users }]) => ({
      code,
      iconUrl: iconUrl || null,
      count: users.length,
      users,
      mineActive: users.some((u) => Number(u.userId) === Number(req.user.id))
    })).sort((a, b) => b.count - a.count);

    return res.json({ reactions: grouped });
  } catch (e) {
    next(e);
  }
};
