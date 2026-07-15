import pool from '../config/database.js';

const VISIBILITIES = new Set([
  'provider_private',
  'shared',
  'client_journal',
  'activity_reflection'
]);

export default class CounselingSessionNotes {
  static async create({
    sessionId,
    authorUserId,
    visibility,
    body,
    activityId = null
  }) {
    if (!VISIBILITIES.has(visibility)) {
      throw new Error('Invalid note visibility');
    }
    const [result] = await pool.execute(
      `INSERT INTO counseling_session_notes
        (session_id, author_user_id, visibility, body, activity_id)
       VALUES (?, ?, ?, ?, ?)`,
      [
        Number(sessionId),
        Number(authorUserId),
        visibility,
        String(body || ''),
        activityId || null
      ]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT * FROM counseling_session_notes WHERE id = ? LIMIT 1`,
      [Number(id)]
    );
    return rows[0] || null;
  }

  /**
   * @param {'provider'|'client'} role
   */
  static async listForSession(sessionId, role) {
    let visibilityFilter = `visibility IN ('shared', 'activity_reflection', 'client_journal')`;
    if (role === 'provider') {
      visibilityFilter = `visibility IN ('provider_private', 'shared', 'activity_reflection', 'client_journal')`;
    }
    const [rows] = await pool.execute(
      `SELECT * FROM counseling_session_notes
       WHERE session_id = ? AND ${visibilityFilter}
       ORDER BY created_at ASC`,
      [Number(sessionId)]
    );
    return rows.map((r) => this.toPublic(r));
  }

  static async update(id, { body }) {
    await pool.execute(
      `UPDATE counseling_session_notes SET body = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [String(body || ''), Number(id)]
    );
    return this.findById(id);
  }

  static toPublic(row) {
    if (!row) return null;
    return {
      id: row.id,
      sessionId: row.session_id,
      authorUserId: row.author_user_id,
      visibility: row.visibility,
      body: row.body,
      activityId: row.activity_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
