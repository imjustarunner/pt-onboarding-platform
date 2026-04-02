import pool from '../config/database.js';
import { parseJsonMaybe } from '../services/companyEvents.service.js';

class Survey {
  static normalize(row) {
    if (!row) return null;
    const questions = parseJsonMaybe(row.questions_json);
    return {
      ...row,
      is_active: !!Number(row.is_active),
      is_anonymous: !!Number(row.is_anonymous),
      is_scored: !!Number(row.is_scored),
      questions_json: Array.isArray(questions) ? questions : []
    };
  }

  static async create(data) {
    const {
      agencyId,
      title,
      description = null,
      isActive = true,
      isAnonymous = false,
      isScored = false,
      pushType = null,
      questions = [],
      createdByUserId = null
    } = data || {};
    const [result] = await pool.execute(
      `INSERT INTO surveys
       (agency_id, title, description, is_active, is_anonymous, is_scored, push_type, questions_json, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(agencyId),
        String(title || '').trim(),
        description ? String(description).trim() : null,
        isActive ? 1 : 0,
        isAnonymous ? 1 : 0,
        isScored ? 1 : 0,
        pushType ? String(pushType).trim().toLowerCase() : null,
        JSON.stringify(Array.isArray(questions) ? questions : []),
        createdByUserId ? Number(createdByUserId) : null
      ]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute('SELECT * FROM surveys WHERE id = ? LIMIT 1', [id]);
    return this.normalize(rows?.[0] || null);
  }

  static async listByAgency(agencyId, { includeInactive = true } = {}) {
    const params = [Number(agencyId)];
    let query = 'SELECT * FROM surveys WHERE agency_id = ?';
    if (!includeInactive) query += ' AND is_active = 1';
    query += ' ORDER BY updated_at DESC, id DESC';
    const [rows] = await pool.execute(query, params);
    return rows.map((r) => this.normalize(r));
  }

  static async update(id, data) {
    const existing = await this.findById(id);
    if (!existing) return null;
    const {
      title = existing.title,
      description = existing.description,
      isActive = existing.is_active,
      isAnonymous = existing.is_anonymous,
      isScored = existing.is_scored,
      pushType = existing.push_type,
      questions = existing.questions_json
    } = data || {};
    await pool.execute(
      `UPDATE surveys
       SET title = ?, description = ?, is_active = ?, is_anonymous = ?, is_scored = ?, push_type = ?, questions_json = ?
       WHERE id = ?`,
      [
        String(title || '').trim(),
        description ? String(description).trim() : null,
        isActive ? 1 : 0,
        isAnonymous ? 1 : 0,
        isScored ? 1 : 0,
        pushType ? String(pushType).trim().toLowerCase() : null,
        JSON.stringify(Array.isArray(questions) ? questions : []),
        Number(id)
      ]
    );
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await pool.execute('DELETE FROM surveys WHERE id = ?', [Number(id)]);
    return Number(result?.affectedRows || 0);
  }
}

export default Survey;
