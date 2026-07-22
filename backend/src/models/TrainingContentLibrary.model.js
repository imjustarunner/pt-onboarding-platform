import pool from '../config/database.js';

function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    agencyId: row.agency_id,
    title: row.title,
    contentType: row.content_type,
    contentData: parseJson(row.content_data, {}),
    settings: parseJson(row.settings, null),
    tags: parseJson(row.tags_json, []),
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

class TrainingContentLibrary {
  static async findAll({ agencyId = null, contentType = null } = {}) {
    const conditions = [];
    const params = [];
    if (agencyId != null && agencyId !== 'null' && agencyId !== '') {
      conditions.push('(agency_id IS NULL OR agency_id = ?)');
      params.push(Number(agencyId));
    }
    if (contentType) {
      conditions.push('content_type = ?');
      params.push(contentType);
    }
    let sql = `SELECT * FROM training_content_library`;
    if (conditions.length) sql += ` WHERE ${conditions.join(' AND ')}`;
    sql += ' ORDER BY updated_at DESC, title ASC';
    const [rows] = await pool.execute(sql, params);
    return rows.map(mapRow);
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM training_content_library WHERE id = ? LIMIT 1',
      [id]
    );
    return mapRow(rows[0]);
  }

  static async create({
    agencyId = null,
    title,
    contentType,
    contentData,
    settings = null,
    tags = null,
    createdByUserId = null
  }) {
    const [result] = await pool.execute(
      `INSERT INTO training_content_library
        (agency_id, title, content_type, content_data, settings, tags_json, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        agencyId || null,
        title,
        contentType,
        JSON.stringify(contentData ?? {}),
        settings != null ? JSON.stringify(settings) : null,
        tags != null ? JSON.stringify(tags) : null,
        createdByUserId || null
      ]
    );
    return this.findById(result.insertId);
  }

  static async update(id, data) {
    const updates = [];
    const values = [];
    if (data.title !== undefined) {
      updates.push('title = ?');
      values.push(data.title);
    }
    if (data.contentType !== undefined) {
      updates.push('content_type = ?');
      values.push(data.contentType);
    }
    if (data.contentData !== undefined) {
      updates.push('content_data = ?');
      values.push(JSON.stringify(data.contentData ?? {}));
    }
    if (data.settings !== undefined) {
      updates.push('settings = ?');
      values.push(data.settings != null ? JSON.stringify(data.settings) : null);
    }
    if (data.tags !== undefined) {
      updates.push('tags_json = ?');
      values.push(data.tags != null ? JSON.stringify(data.tags) : null);
    }
    if (data.agencyId !== undefined) {
      updates.push('agency_id = ?');
      values.push(data.agencyId || null);
    }
    if (!updates.length) return this.findById(id);
    values.push(id);
    await pool.execute(
      `UPDATE training_content_library SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await pool.execute(
      'DELETE FROM training_content_library WHERE id = ?',
      [id]
    );
    return result.affectedRows > 0;
  }
}

export default TrainingContentLibrary;
