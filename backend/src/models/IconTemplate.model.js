import pool from '../config/database.js';

class IconTemplate {
  static async create(template) {
    const {
      name,
      description,
      scope,
      agencyId,
      createdByUserId,
      isShared,
      iconData
    } = template;

    const [result] = await pool.execute(
      `INSERT INTO icon_templates
       (name, description, scope, agency_id, created_by_user_id, is_shared, icon_data)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        description || null,
        scope,
        agencyId || null,
        createdByUserId,
        isShared ?? true,
        JSON.stringify(iconData || {})
      ]
    );

    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute('SELECT * FROM icon_templates WHERE id = ?', [id]);
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      ...row,
      icon_data: typeof row.icon_data === 'string' ? JSON.parse(row.icon_data) : row.icon_data
    };
  }

  static async findAccessible({ scope, agencyIds = [], isSuperAdmin = false } = {}) {
    let query = 'SELECT * FROM icon_templates WHERE 1=1';
    const params = [];

    if (scope) {
      query += ' AND scope = ?';
      params.push(scope);
    }

    if (!isSuperAdmin) {
      // Non-super-admins can see:
      // - templates tied to their agencies
      // - shared "global" templates (agency_id IS NULL AND is_shared = TRUE)
      const canSeeAgencySpecific = agencyIds.length > 0;
      query += ' AND (';
      if (canSeeAgencySpecific) {
        query += ` agency_id IN (${agencyIds.map(() => '?').join(', ')}) OR `;
        params.push(...agencyIds);
      }
      query += ' (agency_id IS NULL AND is_shared = TRUE) ';
      query += ')';
    }

    query += ' ORDER BY created_at DESC';

    const [rows] = await pool.execute(query, params);
    return rows.map((row) => ({
      ...row,
      icon_data: typeof row.icon_data === 'string' ? JSON.parse(row.icon_data) : row.icon_data
    }));
  }

  static async update(id, updates) {
    const {
      name,
      description,
      isShared,
      iconData
    } = updates;

    const set = [];
    const params = [];

    if (name !== undefined) {
      set.push('name = ?');
      params.push(name);
    }
    if (description !== undefined) {
      set.push('description = ?');
      params.push(description);
    }
    if (isShared !== undefined) {
      set.push('is_shared = ?');
      params.push(isShared);
    }
    if (iconData !== undefined) {
      set.push('icon_data = ?');
      params.push(JSON.stringify(iconData || {}));
    }

    if (set.length === 0) return this.findById(id);

    params.push(id);
    await pool.execute(`UPDATE icon_templates SET ${set.join(', ')} WHERE id = ?`, params);
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await pool.execute('DELETE FROM icon_templates WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }
}

export default IconTemplate;

