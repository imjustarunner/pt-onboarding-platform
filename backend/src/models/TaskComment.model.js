/**
 * Task comments - discussion and @mentions on shared list tasks.
 * Body may contain @[Display Name](userId) for mentions.
 */
import pool from '../config/database.js';

const MENTION_REGEX = /@\[([^\]]*)\]\((\d+)\)/g;

export function parseMentionedUserIds(body) {
  if (!body || typeof body !== 'string') return [];
  const ids = new Set();
  for (const m of body.matchAll(MENTION_REGEX)) {
    ids.add(parseInt(m[2], 10));
  }
  return [...ids];
}

export default class TaskComment {
  static async listByTaskId(taskId) {
    const [rows] = await pool.execute(
      `SELECT c.id, c.task_id, c.user_id, c.body, c.created_at,
              u.first_name, u.last_name
       FROM task_comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.task_id = ?
       ORDER BY c.created_at ASC`,
      [parseInt(taskId, 10)]
    );
    return (rows || []).map((r) => ({
      id: r.id,
      task_id: r.task_id,
      user_id: r.user_id,
      body: r.body,
      created_at: r.created_at,
      author_name: [r.first_name, r.last_name].filter(Boolean).join(' ') || `User ${r.user_id}`
    }));
  }

  static async create({ taskId, userId, body }) {
    const bodyStr = String(body || '').trim();
    if (!bodyStr) return null;
    const [result] = await pool.execute(
      'INSERT INTO task_comments (task_id, user_id, body) VALUES (?, ?, ?)',
      [parseInt(taskId, 10), parseInt(userId, 10), bodyStr]
    );
    const id = result?.insertId;
    if (!id) return null;
    const list = await this.listByTaskId(taskId);
    return list.find((c) => c.id === id) || null;
  }
}
