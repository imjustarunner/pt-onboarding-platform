import pool from '../config/database.js';

// Training Focus (formerly Track) - represents role/function/authorization-based training requirements
class TrainingFocus {
  static async findAll(filters = {}) {
    // Check if icon_id column exists
    let hasIconColumn = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'training_tracks' AND COLUMN_NAME = 'icon_id'"
      );
      hasIconColumn = columns.length > 0;
    } catch (err) {
      console.error('Error checking for icon_id column:', err);
    }

    const { agencyId, assignmentLevel, role, includeInactive, isTemplate, includeArchived } = filters;
    const moduleCountSql = `(
      SELECT COUNT(DISTINCT m.id)
      FROM modules m
      LEFT JOIN track_modules tm ON tm.module_id = m.id
      WHERE (m.track_id = tt.id OR tm.track_id = tt.id)
        AND (m.is_archived = FALSE OR m.is_archived IS NULL)
    ) AS module_count`;

    let query;
    if (hasIconColumn) {
      query = `SELECT tt.*, i.file_path as icon_file_path, i.name as icon_name, ${moduleCountSql}
        FROM training_tracks tt
        LEFT JOIN icons i ON tt.icon_id = i.id`;
    } else {
      query = `SELECT tt.*, ${moduleCountSql} FROM training_tracks tt`;
    }
    const params = [];
    const conditions = [];

    if (agencyId !== undefined) {
      if (agencyId === null) {
        conditions.push(hasIconColumn ? 'tt.agency_id IS NULL' : 'agency_id IS NULL');
      } else {
        conditions.push(hasIconColumn ? 'tt.agency_id = ?' : 'agency_id = ?');
        params.push(agencyId);
      }
    }
    if (assignmentLevel) {
      conditions.push(hasIconColumn ? 'tt.assignment_level = ?' : 'assignment_level = ?');
      params.push(assignmentLevel);
    }
    if (role) {
      conditions.push(hasIconColumn ? 'tt.role = ?' : 'role = ?');
      params.push(role);
    }
    if (isTemplate !== undefined) {
      conditions.push(hasIconColumn ? 'tt.is_template = ?' : 'is_template = ?');
      params.push(isTemplate);
    }
    if (!includeInactive) {
      conditions.push(hasIconColumn ? 'tt.is_active = TRUE' : 'is_active = TRUE');
    }
    if (!includeArchived) {
      conditions.push(hasIconColumn ? '(tt.is_archived = FALSE OR tt.is_archived IS NULL)' : '(is_archived = FALSE OR is_archived IS NULL)');
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += hasIconColumn ? ' ORDER BY tt.order_index ASC, tt.name ASC' : ' ORDER BY order_index ASC, name ASC';
    
    const [rows] = await pool.execute(query, params);
    
    // If icon_id column doesn't exist, set icon fields to null for all rows
    if (!hasIconColumn) {
      rows.forEach(row => {
        row.icon_id = null;
        row.icon_file_path = null;
        row.icon_name = null;
      });
    }
    
    return rows;
  }

  static async findById(id) {
    // Check if icon_id column exists
    let hasIconColumn = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'training_tracks' AND COLUMN_NAME = 'icon_id'"
      );
      hasIconColumn = columns.length > 0;
    } catch (err) {
      console.error('Error checking for icon_id column:', err);
    }

    let query;
    if (hasIconColumn) {
      query = 'SELECT tt.*, i.file_path as icon_file_path, i.name as icon_name FROM training_tracks tt LEFT JOIN icons i ON tt.icon_id = i.id WHERE tt.id = ?';
    } else {
      query = 'SELECT * FROM training_tracks WHERE id = ?';
    }
    
    const [rows] = await pool.execute(query, [id]);
    
    // If icon_id column doesn't exist, set icon fields to null
    if (rows[0] && !hasIconColumn) {
      rows[0].icon_id = null;
      rows[0].icon_file_path = null;
      rows[0].icon_name = null;
    }
    
    return rows[0] || null;
  }

  static async create(trackData) {
    const { name, description, orderIndex, assignmentLevel, agencyId, role, isActive, sourceTrackId, isTemplate, iconId } = trackData;
    const [result] = await pool.execute(
      'INSERT INTO training_tracks (name, description, order_index, assignment_level, agency_id, role, is_active, source_track_id, is_template, icon_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [name, description || null, orderIndex || 0, assignmentLevel || 'platform', agencyId || null, role || null, isActive !== undefined ? isActive : true, sourceTrackId || null, isTemplate !== undefined ? isTemplate : false, iconId || null]
    );
    return this.findById(result.insertId);
  }

  static async update(id, trackData) {
    const { name, description, orderIndex, assignmentLevel, agencyId, role, isActive, sourceTrackId, isTemplate, iconId } = trackData;
    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }
    if (orderIndex !== undefined) {
      updates.push('order_index = ?');
      values.push(orderIndex);
    }
    if (assignmentLevel !== undefined) {
      updates.push('assignment_level = ?');
      values.push(assignmentLevel);
    }
    if (agencyId !== undefined) {
      updates.push('agency_id = ?');
      values.push(agencyId);
    }
    if (role !== undefined) {
      updates.push('role = ?');
      values.push(role);
    }
    if (isActive !== undefined) {
      updates.push('is_active = ?');
      values.push(isActive);
    }
    if (sourceTrackId !== undefined) {
      updates.push('source_track_id = ?');
      values.push(sourceTrackId);
    }
    if (isTemplate !== undefined) {
      updates.push('is_template = ?');
      values.push(isTemplate);
    }
    if (iconId !== undefined) {
      updates.push('icon_id = ?');
      values.push(iconId);
    }
    if (iconId !== undefined) {
      updates.push('icon_id = ?');
      values.push(iconId);
    }

    if (updates.length === 0) return this.findById(id);

    values.push(id);
    await pool.execute(
      `UPDATE training_tracks SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    return this.findById(id);
  }

  static async addModule(trackId, moduleId, orderIndex) {
    await pool.execute(
      'INSERT INTO track_modules (track_id, module_id, order_index) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE order_index = ?',
      [trackId, moduleId, orderIndex || 0, orderIndex || 0]
    );

    // Keep legacy one-to-many linkage in sync (modules.track_id)
    // This codebase historically uses modules.track_id for association.
    await pool.execute(
      'UPDATE modules SET track_id = ? WHERE id = ?',
      [trackId, moduleId]
    );
  }

  static async removeModule(trackId, moduleId) {
    await pool.execute(
      'DELETE FROM track_modules WHERE track_id = ? AND module_id = ?',
      [trackId, moduleId]
    );

    // Keep legacy linkage in sync (only clear if it matches this track)
    await pool.execute(
      'UPDATE modules SET track_id = NULL WHERE id = ? AND track_id = ?',
      [moduleId, trackId]
    );
  }

  static async getModules(trackId) {
    // Check if icon_id column exists
    let hasIconColumn = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modules' AND COLUMN_NAME = 'icon_id'"
      );
      hasIconColumn = columns.length > 0;
    } catch (err) {
      console.error('Error checking for icon_id column:', err);
    }

    // Support both linkage styles:
    // - Newer: track_modules pivot table
    // - Legacy: modules.track_id FK
    // Prefer ordering from track_modules when present; otherwise fall back to modules.order_index.
    let query;
    if (hasIconColumn) {
      query = `
        SELECT
          m.*,
          tm.order_index as track_order,
          i.file_path as icon_file_path,
          i.name as icon_name
        FROM modules m
        LEFT JOIN track_modules tm
          ON tm.track_id = ? AND tm.module_id = m.id
        LEFT JOIN icons i
          ON m.icon_id = i.id
        WHERE (m.track_id = ? OR tm.track_id = ?)
        ORDER BY COALESCE(tm.order_index, m.order_index) ASC
      `;
    } else {
      query = `
        SELECT
          m.*,
          tm.order_index as track_order
        FROM modules m
        LEFT JOIN track_modules tm
          ON tm.track_id = ? AND tm.module_id = m.id
        WHERE (m.track_id = ? OR tm.track_id = ?)
        ORDER BY COALESCE(tm.order_index, m.order_index) ASC
      `;
    }
    
    const [rows] = await pool.execute(query, [trackId, trackId, trackId]);
    
    // If icon_id column doesn't exist, set icon fields to null for all rows
    if (!hasIconColumn) {
      rows.forEach(row => {
        row.icon_id = null;
        row.icon_file_path = null;
        row.icon_name = null;
      });
    }
    
    return rows;
  }

  static async archive(id, archivedByUserId, archivedByAgencyId = null) {
    // Check if archived_by_agency_id column exists
    let hasAgencyColumn = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'training_tracks' AND COLUMN_NAME = 'archived_by_agency_id'"
      );
      hasAgencyColumn = columns.length > 0;
    } catch (err) {
      console.error('Error checking for archived_by_agency_id column:', err);
    }

    if (hasAgencyColumn) {
      const [result] = await pool.execute(
        'UPDATE training_tracks SET is_archived = TRUE, archived_at = NOW(), archived_by_user_id = ?, archived_by_agency_id = ? WHERE id = ?',
        [archivedByUserId, archivedByAgencyId, id]
      );
      return result.affectedRows > 0;
    } else {
      const [result] = await pool.execute(
        'UPDATE training_tracks SET is_archived = TRUE, archived_at = NOW(), archived_by_user_id = ? WHERE id = ?',
        [archivedByUserId, id]
      );
      return result.affectedRows > 0;
    }
  }

  static async restore(id, userAgencyIds = []) {
    // Check if archived_by_agency_id column exists
    let hasAgencyColumn = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'training_tracks' AND COLUMN_NAME = 'archived_by_agency_id'"
      );
      hasAgencyColumn = columns.length > 0;
    } catch (err) {
      console.error('Error checking for archived_by_agency_id column:', err);
    }

    if (hasAgencyColumn && userAgencyIds.length > 0) {
      // Only restore if user's agency matches archived_by_agency_id
      const placeholders = userAgencyIds.map(() => '?').join(',');
      const [result] = await pool.execute(
        `UPDATE training_tracks SET is_archived = FALSE, archived_at = NULL, archived_by_user_id = NULL, archived_by_agency_id = NULL WHERE id = ? AND is_archived = TRUE AND archived_by_agency_id IN (${placeholders})`,
        [id, ...userAgencyIds]
      );
      return result.affectedRows > 0;
    } else {
      const [result] = await pool.execute(
        'UPDATE training_tracks SET is_archived = FALSE, archived_at = NULL, archived_by_user_id = NULL WHERE id = ? AND is_archived = TRUE',
        [id]
      );
      return result.affectedRows > 0;
    }
  }

  static async delete(id, userAgencyIds = []) {
    // Check if archived_by_agency_id column exists
    let hasAgencyColumn = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'training_tracks' AND COLUMN_NAME = 'archived_by_agency_id'"
      );
      hasAgencyColumn = columns.length > 0;
    } catch (err) {
      console.error('Error checking for archived_by_agency_id column:', err);
    }

    if (hasAgencyColumn && userAgencyIds.length > 0) {
      // Only delete if user's agency matches archived_by_agency_id
      const placeholders = userAgencyIds.map(() => '?').join(',');
      const [result] = await pool.execute(
        `DELETE FROM training_tracks WHERE id = ? AND is_archived = TRUE AND archived_by_agency_id IN (${placeholders})`,
        [id, ...userAgencyIds]
      );
      return result.affectedRows > 0;
    } else {
      const [result] = await pool.execute(
        'DELETE FROM training_tracks WHERE id = ? AND is_archived = TRUE',
        [id]
      );
      return result.affectedRows > 0;
    }
  }

  static async findAllArchived(filters = {}) {
    const { agencyIds, userRole } = filters;
    
    // Check if archived_by_agency_id column exists
    let hasAgencyColumn = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'training_tracks' AND COLUMN_NAME = 'archived_by_agency_id'"
      );
      hasAgencyColumn = columns.length > 0;
    } catch (err) {
      console.error('Error checking for archived_by_agency_id column:', err);
    }

    let query = 'SELECT * FROM training_tracks WHERE is_archived = TRUE';
    const params = [];

    // Filter by archived_by_agency_id
    // - If agencyIds is null (super_admin, no filter), don't filter
    // - If agencyIds is an array, filter by those agencies
    if (hasAgencyColumn && agencyIds !== null && agencyIds !== undefined && agencyIds.length > 0) {
      const placeholders = agencyIds.map(() => '?').join(',');
      query += ` AND archived_by_agency_id IN (${placeholders})`;
      params.push(...agencyIds);
    } else if (hasAgencyColumn && userRole !== 'super_admin') {
      // For non-super_admin users, if no agencyIds provided, return empty (they shouldn't see anything)
      query += ' AND 1=0'; // Always false condition
    }

    query += ' ORDER BY archived_at DESC';
    const [rows] = await pool.execute(query, params);
    return rows;
  }
}

// Export as both names for backward compatibility during transition
export default TrainingFocus;
export { TrainingFocus as TrainingTrack };

