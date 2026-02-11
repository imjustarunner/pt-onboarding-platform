import pool from '../config/database.js';

function parseIntParam(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

class HiringJobDescription {
  static async create({
    agencyId,
    title,
    descriptionText = null,
    storagePath = null,
    originalName = null,
    mimeType = null,
    createdByUserId,
    isActive = true
  }) {
    const [result] = await pool.execute(
      `INSERT INTO hiring_job_descriptions (
        agency_id, title, description_text,
        storage_path, original_name, mime_type,
        is_active, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        parseIntParam(agencyId),
        String(title || '').trim().slice(0, 255),
        descriptionText !== undefined && descriptionText !== null ? String(descriptionText) : null,
        storagePath || null,
        originalName || null,
        mimeType || null,
        isActive ? 1 : 0,
        parseIntParam(createdByUserId)
      ]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT *
       FROM hiring_job_descriptions
       WHERE id = ?
       LIMIT 1`,
      [parseIntParam(id)]
    );
    return rows[0] || null;
  }

  static async listByAgencyId(agencyId, { includeInactive = false, limit = 500 } = {}) {
    const aid = parseIntParam(agencyId);
    const lim = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 500);
    const whereActive = includeInactive ? '' : ' AND is_active = 1';
    const [rows] = await pool.execute(
      `SELECT *
       FROM hiring_job_descriptions
       WHERE agency_id = ?${whereActive}
       ORDER BY updated_at DESC, id DESC
       LIMIT ${lim}`,
      [aid]
    );
    return rows || [];
  }

  static async updateById(id, { title, descriptionText, storagePath, originalName, mimeType, isActive } = {}) {
    const updates = [];
    const params = [];

    if (title !== undefined) {
      updates.push('title = ?');
      params.push(String(title || '').trim().slice(0, 255));
    }
    if (descriptionText !== undefined) {
      updates.push('description_text = ?');
      params.push(descriptionText !== null ? String(descriptionText) : null);
    }
    if (storagePath !== undefined) {
      updates.push('storage_path = ?');
      params.push(storagePath || null);
    }
    if (originalName !== undefined) {
      updates.push('original_name = ?');
      params.push(originalName || null);
    }
    if (mimeType !== undefined) {
      updates.push('mime_type = ?');
      params.push(mimeType || null);
    }
    if (isActive !== undefined) {
      updates.push('is_active = ?');
      params.push(isActive ? 1 : 0);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    params.push(parseIntParam(id));
    await pool.execute(
      `UPDATE hiring_job_descriptions
       SET ${updates.join(', ')}
       WHERE id = ?
       LIMIT 1`,
      params
    );
    return this.findById(id);
  }

  static async deactivateById(id) {
    return this.updateById(id, { isActive: false });
  }
}

export default HiringJobDescription;

