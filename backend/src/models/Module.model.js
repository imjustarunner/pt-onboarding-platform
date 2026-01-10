import pool from '../config/database.js';

class Module {
  static async findAll(includeInactive = false, filters = {}) {
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

    let query;
    if (hasIconColumn) {
      query = 'SELECT m.*, i.file_path as icon_file_path, i.name as icon_name FROM modules m LEFT JOIN icons i ON m.icon_id = i.id';
    } else {
      query = 'SELECT * FROM modules';
    }
    
    const params = [];
    const conditions = [];
    
    if (!includeInactive) {
      conditions.push(hasIconColumn ? 'm.is_active = TRUE' : 'is_active = TRUE');
    }
    
    // Exclude archived by default
    if (!filters.includeArchived) {
      conditions.push(hasIconColumn ? '(m.is_archived = FALSE OR m.is_archived IS NULL)' : '(is_archived = FALSE OR is_archived IS NULL)');
    }
    
    if (filters.agencyId !== undefined) {
      if (filters.agencyId === null) {
        conditions.push(hasIconColumn ? 'm.agency_id IS NULL' : 'agency_id IS NULL');
      } else {
        conditions.push(hasIconColumn ? 'm.agency_id = ?' : 'agency_id = ?');
        params.push(filters.agencyId);
      }
    }
    
    if (filters.trackId !== undefined) {
      conditions.push(hasIconColumn ? 'm.track_id = ?' : 'track_id = ?');
      params.push(filters.trackId);
    }
    
    if (filters.isShared !== undefined) {
      conditions.push(hasIconColumn ? 'm.is_shared = ?' : 'is_shared = ?');
      params.push(filters.isShared);
    }
    
    if (filters.isAlwaysAccessible !== undefined) {
      conditions.push(hasIconColumn ? 'm.is_always_accessible = ?' : 'is_always_accessible = ?');
      params.push(filters.isAlwaysAccessible);
    }
    
    if (filters.isPublic !== undefined) {
      conditions.push(hasIconColumn ? 'm.is_public = ?' : 'is_public = ?');
      params.push(filters.isPublic);
    }
    
    if (filters.isStandalone !== undefined) {
      conditions.push(hasIconColumn ? 'm.is_standalone = ?' : 'is_standalone = ?');
      params.push(filters.isStandalone);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += hasIconColumn ? ' ORDER BY m.order_index ASC, m.created_at ASC' : ' ORDER BY order_index ASC, created_at ASC';
    
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
  
  static async findShared() {
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

    let query;
    if (hasIconColumn) {
      query = 'SELECT m.*, i.file_path as icon_file_path, i.name as icon_name FROM modules m LEFT JOIN icons i ON m.icon_id = i.id WHERE m.is_shared = TRUE AND m.is_active = TRUE ORDER BY m.order_index ASC, m.created_at ASC';
    } else {
      query = 'SELECT * FROM modules WHERE is_shared = TRUE AND is_active = TRUE ORDER BY order_index ASC, created_at ASC';
    }
    
    const [rows] = await pool.execute(query);
    
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
  
  static async findByAgency(agencyId, includeInactive = false) {
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

    let query;
    if (hasIconColumn) {
      query = 'SELECT m.*, i.file_path as icon_file_path, i.name as icon_name FROM modules m LEFT JOIN icons i ON m.icon_id = i.id WHERE m.agency_id = ?';
    } else {
      query = 'SELECT * FROM modules WHERE agency_id = ?';
    }
    const params = [agencyId];
    
    if (!includeInactive) {
      query += hasIconColumn ? ' AND m.is_active = TRUE' : ' AND is_active = TRUE';
    }
    query += hasIconColumn ? ' ORDER BY m.order_index ASC, m.created_at ASC' : ' ORDER BY order_index ASC, created_at ASC';
    
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
  
  static async findByTrack(trackId, includeInactive = false) {
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

    let query;
    if (hasIconColumn) {
      query = 'SELECT m.*, i.file_path as icon_file_path, i.name as icon_name FROM modules m LEFT JOIN icons i ON m.icon_id = i.id WHERE m.track_id = ?';
    } else {
      query = 'SELECT * FROM modules WHERE track_id = ?';
    }
    const params = [trackId];
    
    if (!includeInactive) {
      query += hasIconColumn ? ' AND m.is_active = TRUE' : ' AND is_active = TRUE';
    }
    query += hasIconColumn ? ' ORDER BY m.order_index ASC, m.created_at ASC' : ' ORDER BY order_index ASC, created_at ASC';
    
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
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modules' AND COLUMN_NAME = 'icon_id'"
      );
      hasIconColumn = columns.length > 0;
    } catch (err) {
      console.error('Error checking for icon_id column:', err);
    }

    let query;
    if (hasIconColumn) {
      query = 'SELECT m.*, i.file_path as icon_file_path, i.name as icon_name FROM modules m LEFT JOIN icons i ON m.icon_id = i.id WHERE m.id = ?';
    } else {
      query = 'SELECT * FROM modules WHERE id = ?';
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

  static async create(moduleData) {
    const { 
      title, 
      description, 
      orderIndex, 
      isActive, 
      agencyId, 
      trackId, 
      isShared, 
      sourceModuleId, 
      createdByUserId,
      isAlwaysAccessible,
      isPublic,
      isStandalone,
      standaloneCategory,
      iconId
    } = moduleData;
    
    const [result] = await pool.execute(
      `INSERT INTO modules (
        title, description, order_index, is_active, 
        agency_id, track_id, is_shared, source_module_id, created_by_user_id,
        is_always_accessible, is_public, is_standalone, standalone_category, icon_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title, 
        description || null, 
        orderIndex || 0, 
        isActive !== undefined ? isActive : true,
        agencyId || null,
        trackId || null,
        isShared !== undefined ? isShared : false,
        sourceModuleId || null,
        createdByUserId || null,
        isAlwaysAccessible !== undefined ? isAlwaysAccessible : false,
        isPublic !== undefined ? isPublic : false,
        isStandalone !== undefined ? isStandalone : false,
        standaloneCategory || null,
        iconId || null
      ]
    );
    return this.findById(result.insertId);
  }

  static async update(id, moduleData) {
    const { 
      title, 
      description, 
      orderIndex, 
      isActive, 
      agencyId, 
      trackId, 
      isShared, 
      sourceModuleId,
      isAlwaysAccessible,
      isPublic,
      isStandalone,
      standaloneCategory,
      iconId
    } = moduleData;
    const updates = [];
    const values = [];

    if (title !== undefined) {
      updates.push('title = ?');
      values.push(title);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }
    if (orderIndex !== undefined) {
      updates.push('order_index = ?');
      values.push(orderIndex);
    }
    if (isActive !== undefined) {
      updates.push('is_active = ?');
      values.push(isActive);
    }
    if (agencyId !== undefined) {
      updates.push('agency_id = ?');
      values.push(agencyId);
    }
    if (trackId !== undefined) {
      updates.push('track_id = ?');
      values.push(trackId);
    }
    if (isShared !== undefined) {
      updates.push('is_shared = ?');
      values.push(isShared);
    }
    if (sourceModuleId !== undefined) {
      updates.push('source_module_id = ?');
      values.push(sourceModuleId);
    }
    if (isAlwaysAccessible !== undefined) {
      updates.push('is_always_accessible = ?');
      values.push(isAlwaysAccessible);
    }
    if (isPublic !== undefined) {
      updates.push('is_public = ?');
      values.push(isPublic);
    }
    if (isStandalone !== undefined) {
      updates.push('is_standalone = ?');
      values.push(isStandalone);
    }
    if (standaloneCategory !== undefined) {
      updates.push('standalone_category = ?');
      values.push(standaloneCategory);
    }
    if (iconId !== undefined) {
      updates.push('icon_id = ?');
      values.push(iconId);
    }

    if (updates.length === 0) return this.findById(id);

    values.push(id);
    await pool.execute(
      `UPDATE modules SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    return this.findById(id);
  }
  
  static async findPublicModules() {
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

    let query;
    if (hasIconColumn) {
      query = `SELECT m.*, i.file_path as icon_file_path, i.name as icon_name FROM modules m LEFT JOIN icons i ON m.icon_id = i.id 
               WHERE (m.is_always_accessible = TRUE OR m.is_public = TRUE) 
               AND m.is_active = TRUE 
               ORDER BY m.order_index ASC, m.created_at ASC`;
    } else {
      query = `SELECT * FROM modules 
               WHERE (is_always_accessible = TRUE OR is_public = TRUE) 
               AND is_active = TRUE 
               ORDER BY order_index ASC, created_at ASC`;
    }
    
    const [rows] = await pool.execute(query);
    
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
  
  static async findStandaloneModules(category = null) {
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

    let query;
    if (hasIconColumn) {
      query = `SELECT m.*, i.file_path as icon_file_path, i.name as icon_name FROM modules m LEFT JOIN icons i ON m.icon_id = i.id 
               WHERE m.is_standalone = TRUE AND m.is_active = TRUE`;
    } else {
      query = `SELECT * FROM modules 
               WHERE is_standalone = TRUE AND is_active = TRUE`;
    }
    const params = [];
    
    if (category) {
      query += hasIconColumn ? ' AND m.standalone_category = ?' : ' AND standalone_category = ?';
      params.push(category);
    }
    
    query += hasIconColumn ? ' ORDER BY m.order_index ASC, m.created_at ASC' : ' ORDER BY order_index ASC, created_at ASC';
    
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

  static async archive(id, archivedByUserId, archivedByAgencyId = null) {
    // Check if archived_by_agency_id column exists
    let hasAgencyColumn = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modules' AND COLUMN_NAME = 'archived_by_agency_id'"
      );
      hasAgencyColumn = columns.length > 0;
    } catch (err) {
      console.error('Error checking for archived_by_agency_id column:', err);
    }

    if (hasAgencyColumn) {
      const [result] = await pool.execute(
        'UPDATE modules SET is_archived = TRUE, archived_at = NOW(), archived_by_user_id = ?, archived_by_agency_id = ? WHERE id = ?',
        [archivedByUserId, archivedByAgencyId, id]
      );
      return result.affectedRows > 0;
    } else {
      const [result] = await pool.execute(
        'UPDATE modules SET is_archived = TRUE, archived_at = NOW(), archived_by_user_id = ? WHERE id = ?',
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
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modules' AND COLUMN_NAME = 'archived_by_agency_id'"
      );
      hasAgencyColumn = columns.length > 0;
    } catch (err) {
      console.error('Error checking for archived_by_agency_id column:', err);
    }

    if (hasAgencyColumn && userAgencyIds.length > 0) {
      // Only restore if user's agency matches archived_by_agency_id
      const placeholders = userAgencyIds.map(() => '?').join(',');
      const [result] = await pool.execute(
        `UPDATE modules SET is_archived = FALSE, archived_at = NULL, archived_by_user_id = NULL, archived_by_agency_id = NULL WHERE id = ? AND is_archived = TRUE AND archived_by_agency_id IN (${placeholders})`,
        [id, ...userAgencyIds]
      );
      return result.affectedRows > 0;
    } else {
      const [result] = await pool.execute(
        'UPDATE modules SET is_archived = FALSE, archived_at = NULL, archived_by_user_id = NULL WHERE id = ? AND is_archived = TRUE',
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
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modules' AND COLUMN_NAME = 'archived_by_agency_id'"
      );
      hasAgencyColumn = columns.length > 0;
    } catch (err) {
      console.error('Error checking for archived_by_agency_id column:', err);
    }

    if (hasAgencyColumn && userAgencyIds.length > 0) {
      // Only delete if user's agency matches archived_by_agency_id
      const placeholders = userAgencyIds.map(() => '?').join(',');
      const [result] = await pool.execute(
        `DELETE FROM modules WHERE id = ? AND is_archived = TRUE AND archived_by_agency_id IN (${placeholders})`,
        [id, ...userAgencyIds]
      );
      return result.affectedRows > 0;
    } else {
      const [result] = await pool.execute(
        'DELETE FROM modules WHERE id = ? AND is_archived = TRUE',
        [id]
      );
      return result.affectedRows > 0;
    }
  }

  static async findAllArchived(filters = {}) {
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

    // Check if archived_by_agency_id column exists
    let hasAgencyColumn = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modules' AND COLUMN_NAME = 'archived_by_agency_id'"
      );
      hasAgencyColumn = columns.length > 0;
    } catch (err) {
      console.error('Error checking for archived_by_agency_id column:', err);
    }

    const { agencyIds, userRole } = filters;
    let query;
    if (hasIconColumn) {
      query = 'SELECT m.*, i.file_path as icon_file_path, i.name as icon_name FROM modules m LEFT JOIN icons i ON m.icon_id = i.id WHERE m.is_archived = TRUE';
    } else {
      query = 'SELECT * FROM modules WHERE is_archived = TRUE';
    }
    const params = [];

    // Filter by archived_by_agency_id
    // - If agencyIds is null (super_admin, no filter), don't filter
    // - If agencyIds is an array, filter by those agencies
    if (hasAgencyColumn && agencyIds !== null && agencyIds !== undefined && agencyIds.length > 0) {
      const placeholders = agencyIds.map(() => '?').join(',');
      query += hasIconColumn ? ` AND m.archived_by_agency_id IN (${placeholders})` : ` AND archived_by_agency_id IN (${placeholders})`;
      params.push(...agencyIds);
    } else if (hasAgencyColumn && userRole !== 'super_admin') {
      // For non-super_admin users, if no agencyIds provided, return empty (they shouldn't see anything)
      query += hasIconColumn ? ' AND 1=0' : ' AND 1=0'; // Always false condition
    }

    query += hasIconColumn ? ' ORDER BY m.archived_at DESC' : ' ORDER BY archived_at DESC';
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
}

export default Module;

