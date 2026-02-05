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
}

export default HiringJobDescription;

