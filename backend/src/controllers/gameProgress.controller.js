import pool from '../config/database.js';
import User from '../models/User.model.js';

const MAX_STATE_BYTES = 1024 * 1024 * 2; // 2 MB

function normalizeGameKey(raw) {
  const gameKey = String(raw || '').trim().toLowerCase();
  if (!gameKey || !/^[a-z0-9][a-z0-9._-]{0,99}$/.test(gameKey)) return null;
  return gameKey;
}

async function assertUserCanUseGames(req) {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'super_admin') return true;
  const userId = Number(req.user?.id || 0);
  if (!userId) return false;
  const user = await User.findById(userId);
  return !!(user?.has_games_access === true || user?.has_games_access === 1 || user?.has_games_access === '1');
}

export async function getGameProgress(req, res) {
  try {
    const gameKey = normalizeGameKey(req.params?.gameKey);
    if (!gameKey) {
      return res.status(400).json({ error: { message: 'Invalid game key' } });
    }

    const userId = Number(req.user?.id || 0);
    if (!userId) {
      return res.status(401).json({ error: { message: 'Unauthorized' } });
    }
    if (!(await assertUserCanUseGames(req))) {
      return res.status(403).json({ error: { message: 'Games access is not enabled for this user' } });
    }

    const [rows] = await pool.execute(
      `SELECT state_json, updated_at
       FROM user_game_progress
       WHERE user_id = ? AND game_key = ?
       LIMIT 1`,
      [userId, gameKey]
    );

    if (!rows?.length) {
      return res.json({
        gameKey,
        state: null,
        updatedAt: null
      });
    }

    let state = null;
    try {
      state = JSON.parse(rows[0].state_json);
    } catch {
      state = null;
    }

    return res.json({
      gameKey,
      state,
      updatedAt: rows[0].updated_at || null
    });
  } catch (err) {
    console.error('[games.progress.get] error:', err);
    return res.status(500).json({ error: { message: 'Failed to fetch game progress' } });
  }
}

export async function upsertGameProgress(req, res) {
  try {
    const gameKey = normalizeGameKey(req.params?.gameKey);
    if (!gameKey) {
      return res.status(400).json({ error: { message: 'Invalid game key' } });
    }

    const state = req.body?.state ?? null;
    if (!state || typeof state !== 'object' || Array.isArray(state)) {
      return res.status(400).json({ error: { message: 'state object is required' } });
    }

    const stateJson = JSON.stringify(state);
    const bytes = Buffer.byteLength(stateJson, 'utf8');
    if (bytes > MAX_STATE_BYTES) {
      return res.status(413).json({ error: { message: 'state payload too large' } });
    }

    const userId = Number(req.user?.id || 0);
    if (!userId) {
      return res.status(401).json({ error: { message: 'Unauthorized' } });
    }
    if (!(await assertUserCanUseGames(req))) {
      return res.status(403).json({ error: { message: 'Games access is not enabled for this user' } });
    }

    await pool.execute(
      `INSERT INTO user_game_progress (user_id, game_key, state_json)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         state_json = VALUES(state_json),
         updated_at = CURRENT_TIMESTAMP`,
      [userId, gameKey, stateJson]
    );

    return res.json({
      ok: true,
      gameKey
    });
  } catch (err) {
    console.error('[games.progress.upsert] error:', err);
    return res.status(500).json({ error: { message: 'Failed to save game progress' } });
  }
}
