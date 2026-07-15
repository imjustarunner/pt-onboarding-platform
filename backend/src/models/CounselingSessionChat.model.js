import pool from '../config/database.js';

export default class CounselingSessionChat {
  static async create({ sessionId, senderUserId, senderRole, body }) {
    const [result] = await pool.execute(
      `INSERT INTO counseling_session_chat
        (session_id, sender_user_id, sender_role, body)
       VALUES (?, ?, ?, ?)`,
      [Number(sessionId), Number(senderUserId), String(senderRole), String(body || '')]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT * FROM counseling_session_chat WHERE id = ? LIMIT 1`,
      [Number(id)]
    );
    return rows[0] || null;
  }

  static async listForSession(sessionId, { afterId = 0, limit = 100 } = {}) {
    const [rows] = await pool.execute(
      `SELECT * FROM counseling_session_chat
       WHERE session_id = ? AND id > ?
       ORDER BY id ASC
       LIMIT ?`,
      [Number(sessionId), Number(afterId) || 0, Math.min(Number(limit) || 100, 200)]
    );
    return rows.map((r) => this.toPublic(r));
  }

  static toPublic(row) {
    if (!row) return null;
    return {
      id: row.id,
      sessionId: row.session_id,
      senderUserId: row.sender_user_id,
      senderRole: row.sender_role,
      body: row.body,
      createdAt: row.created_at
    };
  }
}
