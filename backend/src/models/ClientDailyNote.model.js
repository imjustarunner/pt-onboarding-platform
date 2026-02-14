import pool from '../config/database.js';

class ClientDailyNote {
  static async upsert({ clientId, authorId, programId, noteDate, message }) {
    const [result] = await pool.execute(
      `INSERT INTO client_daily_notes (client_id, author_id, program_id, note_date, message)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE message = VALUES(message), updated_at = CURRENT_TIMESTAMP`,
      [clientId, authorId, programId || null, noteDate, message]
    );
    return this.findByClientAuthorDate(clientId, authorId, noteDate);
  }

  static async findByClientAuthorDate(clientId, authorId, noteDate) {
    const [rows] = await pool.execute(
      'SELECT * FROM client_daily_notes WHERE client_id = ? AND author_id = ? AND note_date = ?',
      [clientId, authorId, noteDate]
    );
    return rows[0] || null;
  }

  static async findByClient(clientId, { programId = null, startDate = null, endDate = null } = {}) {
    let query = `
      SELECT n.*, u.first_name as author_first_name, u.last_name as author_last_name
       FROM client_daily_notes n
       LEFT JOIN users u ON n.author_id = u.id
       WHERE n.client_id = ?
    `;
    const params = [clientId];
    if (programId) {
      query += ' AND (n.program_id = ? OR n.program_id IS NULL)';
      params.push(programId);
    }
    if (startDate) {
      query += ' AND n.note_date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND n.note_date <= ?';
      params.push(endDate);
    }
    query += ' ORDER BY n.note_date DESC, n.created_at DESC';
    const [rows] = await pool.execute(query, params);
    return rows;
  }

  /** All notes for a client on a specific date (for multi-author daily view). Returns with author_initials. */
  static async findByClientAndDate(clientId, noteDate, { programId = null } = {}) {
    let query = `
      SELECT n.*, u.first_name as author_first_name, u.last_name as author_last_name
       FROM client_daily_notes n
       LEFT JOIN users u ON n.author_id = u.id
       WHERE n.client_id = ? AND n.note_date = ?
    `;
    const params = [clientId, String(noteDate).slice(0, 10)];
    if (programId) {
      query += ' AND (n.program_id = ? OR n.program_id IS NULL)';
      params.push(programId);
    }
    query += ' ORDER BY n.created_at ASC';
    const [rows] = await pool.execute(query, params);
    return (rows || []).map((r) => {
      const fn = String(r?.author_first_name || '').trim();
      const ln = String(r?.author_last_name || '').trim();
      const initials = fn && ln ? `${fn[0]}${ln[0]}`.toUpperCase() : (fn ? fn[0] : ln ? ln[0] : '?').toUpperCase();
      return { ...r, author_initials: initials || '?' };
    });
  }
}

export default ClientDailyNote;
