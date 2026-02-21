import pool from '../config/database.js';

class UserExtension {
  static async findById(id) {
    const [rows] = await pool.execute('SELECT * FROM user_extensions WHERE id = ? LIMIT 1', [id]);
    return rows[0] || null;
  }

  static async findByAgencyAndExtension(agencyId, extension) {
    const ext = String(extension || '').trim().replace(/^0+/, '') || '0';
    const [rows] = await pool.execute(
      `SELECT * FROM user_extensions
       WHERE agency_id = ? AND extension = ? AND is_active = TRUE
       LIMIT 1`,
      [agencyId, ext]
    );
    return rows[0] || null;
  }

  /** Resolve extension to user. Tries number-specific first, then agency-wide (number_id IS NULL). */
  static async resolveExtension({ agencyId, numberId, extension }) {
    const ext = String(extension || '').trim().replace(/^0+/, '') || '0';
    // 0 = main line, not an extension
    if (ext === '0') return null;

    // Try number-specific first
    if (numberId) {
      const [byNumber] = await pool.execute(
        `SELECT * FROM user_extensions
         WHERE agency_id = ? AND number_id = ? AND extension = ? AND is_active = TRUE
         LIMIT 1`,
        [agencyId, numberId, ext]
      );
      if (byNumber.length) return byNumber[0];
    }

    // Fall back to agency-wide (number_id IS NULL)
    const [byAgency] = await pool.execute(
      `SELECT * FROM user_extensions
       WHERE agency_id = ? AND number_id IS NULL AND extension = ? AND is_active = TRUE
       LIMIT 1`,
      [agencyId, ext]
    );
    return byAgency[0] || null;
  }

  static async listByAgency(agencyId, { includeInactive = false } = {}) {
    const where = includeInactive ? '' : ' AND ue.is_active = TRUE';
    const [rows] = await pool.execute(
      `SELECT ue.*, u.first_name, u.last_name, u.email, tn.phone_number
       FROM user_extensions ue
       JOIN users u ON u.id = ue.user_id
       LEFT JOIN twilio_numbers tn ON tn.id = ue.number_id
       WHERE ue.agency_id = ?${where}
       ORDER BY ue.extension ASC`,
      [agencyId]
    );
    return rows;
  }

  static async listByUserId(userId) {
    const [rows] = await pool.execute(
      `SELECT ue.*, tn.phone_number, tn.friendly_name
       FROM user_extensions ue
       LEFT JOIN twilio_numbers tn ON tn.id = ue.number_id
       WHERE ue.user_id = ? AND ue.is_active = TRUE
       ORDER BY ue.extension ASC`,
      [userId]
    );
    return rows;
  }

  static async create({ agencyId, userId, extension, numberId = null }) {
    const ext = String(extension || '').trim().replace(/^0+/, '') || null;
    if (!ext) throw new Error('Extension is required');
    const [result] = await pool.execute(
      `INSERT INTO user_extensions (agency_id, user_id, extension, number_id, is_active)
       VALUES (?, ?, ?, ?, TRUE)`,
      [agencyId, userId, ext, numberId]
    );
    return this.findById(result.insertId);
  }

  static async update(id, patch) {
    const updates = [];
    const params = [];
    if (patch.extension !== undefined) {
      updates.push('extension = ?');
      params.push(String(patch.extension).trim().replace(/^0+/, '') || null);
    }
    if (patch.numberId !== undefined) {
      updates.push('number_id = ?');
      params.push(patch.numberId);
    }
    if (patch.isActive !== undefined) {
      updates.push('is_active = ?');
      params.push(patch.isActive ? 1 : 0);
    }
    if (!updates.length) return this.findById(id);
    params.push(id);
    await pool.execute(
      `UPDATE user_extensions SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      params
    );
    return this.findById(id);
  }

  static async deactivate(id) {
    await pool.execute(
      `UPDATE user_extensions SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [id]
    );
    return this.findById(id);
  }

  /** Check if agency has any extensions (for IVR prompt). */
  static async agencyHasExtensions(agencyId, numberId = null) {
    const [rows] = await pool.execute(
      numberId
        ? `SELECT 1 FROM user_extensions
           WHERE agency_id = ? AND is_active = TRUE
             AND (number_id IS NULL OR number_id = ?)
           LIMIT 1`
        : `SELECT 1 FROM user_extensions
           WHERE agency_id = ? AND is_active = TRUE
           LIMIT 1`,
      numberId ? [agencyId, numberId] : [agencyId]
    );
    return rows.length > 0;
  }
}

export default UserExtension;
