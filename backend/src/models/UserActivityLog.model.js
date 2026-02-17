import pool from '../config/database.js';

class UserActivityLog {
  static parseMetadata(raw) {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  static async logActivity(activityData) {
    const {
      actionType,
      userId,
      ipAddress,
      userAgent,
      sessionId,
      agencyId,
      metadata,
      durationSeconds,
      moduleId
    } = activityData;

    const [result] = await pool.execute(
      `INSERT INTO user_activity_log (
        action_type, user_id, ip_address, user_agent, session_id, agency_id, metadata, duration_seconds, module_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        actionType,
        userId || null,
        ipAddress || null,
        userAgent || null,
        sessionId || null,
        agencyId || null,
        metadata ? JSON.stringify(metadata) : null,
        durationSeconds || null,
        moduleId || null
      ]
    );

    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM user_activity_log WHERE id = ?',
      [id]
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      ...row,
      metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : null
    };
  }

  static async getActivityLog(filters = {}) {
    try {
      const {
        userId,
        agencyId,
        actionType,
        sessionId,
        startDate,
        endDate,
        limit = 100
      } = filters;

      let query = `
        SELECT ual.id,
               ual.action_type,
               ual.user_id,
               ual.ip_address,
               ual.user_agent,
               ual.session_id,
               ual.agency_id,
               ual.metadata,
               ual.created_at,
               ual.duration_seconds,
               ual.module_id,
               u.email as user_email,
               u.first_name as user_first_name,
               u.last_name as user_last_name,
               a.name as agency_name,
               m.title as module_title
        FROM user_activity_log ual
        LEFT JOIN users u ON ual.user_id = u.id
        LEFT JOIN agencies a ON ual.agency_id = a.id
        LEFT JOIN modules m ON ual.module_id = m.id
        WHERE 1=1
      `;
      const params = [];

      // Use explicit null/undefined checks to avoid adding null values
      if (userId !== null && userId !== undefined) {
        query += ' AND ual.user_id = ?';
        params.push(userId);
      }

      if (agencyId !== null && agencyId !== undefined) {
        query += ' AND ual.agency_id = ?';
        params.push(agencyId);
      }

      if (actionType !== null && actionType !== undefined && actionType !== '') {
        query += ' AND ual.action_type = ?';
        params.push(actionType);
      }

      if (sessionId !== null && sessionId !== undefined && sessionId !== '') {
        query += ' AND ual.session_id = ?';
        params.push(sessionId);
      }

      if (startDate !== null && startDate !== undefined && startDate !== '') {
        // Start date: include from beginning of the day (00:00:00 UTC)
        // Format: YYYY-MM-DD -> YYYY-MM-DD 00:00:00
        const startDateTime = startDate.includes(' ') ? startDate : `${startDate} 00:00:00`;
        query += ' AND ual.created_at >= ?';
        params.push(startDateTime);
      }

      if (endDate !== null && endDate !== undefined && endDate !== '') {
        // End date: include until end of the day (23:59:59 UTC)
        // Format: YYYY-MM-DD -> YYYY-MM-DD 23:59:59
        const endDateTime = endDate.includes(' ') ? endDate : `${endDate} 23:59:59`;
        query += ' AND ual.created_at <= ?';
        params.push(endDateTime);
      }

      // LIMIT cannot be a parameter in MySQL prepared statements, so we need to use string interpolation
      // But we sanitize it to ensure it's a safe integer
      const limitValue = parseInt(limit) || 100;
      if (limitValue < 1 || limitValue > 10000) {
        throw new Error('Invalid limit value');
      }
      query += ` ORDER BY ual.created_at DESC LIMIT ${limitValue}`;

      const [rows] = await pool.execute(query, params);
      return rows.map(row => ({
        ...row,
        metadata: this.parseMetadata(row.metadata)
      }));
    } catch (error) {
      console.error('Error in getActivityLog:', error);
      console.error('Error details:', {
        code: error.code,
        errno: error.errno,
        sqlState: error.sqlState,
        sqlMessage: error.sqlMessage,
        sql: error.sql
      });
      throw error;
    }
  }

  static async getActivityForUser(userId, filters = {}) {
    try {
      return await this.getActivityLog({ ...filters, userId });
    } catch (error) {
      console.error('Error in getActivityForUser:', error);
      // If columns don't exist, return empty array instead of crashing
      if (error.code === 'ER_BAD_FIELD_ERROR') {
        console.warn('Activity log columns may not exist yet. Returning empty log.');
        return [];
      }
      throw error;
    }
  }

  static async getRecentActivity(limit = 50) {
    return this.getActivityLog({ limit });
  }

  static async getActivityForAgency(agencyId, filters = {}) {
    return this.getActivityLog({ ...filters, agencyId });
  }

  static normalizeSort(sortBy, sortOrder) {
    const allowlist = {
      createdAt: 'ual.created_at',
      actionType: 'ual.action_type',
      userEmail: 'u.email',
      userName: 'u.last_name',
      ipAddress: 'ual.ip_address'
    };
    const field = allowlist[String(sortBy || '').trim()] || allowlist.createdAt;
    const order = String(sortOrder || '').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    return { field, order };
  }

  static buildAgencyActivityWhere(filters = {}) {
    const {
      agencyId,
      userId,
      actionType,
      startDate,
      endDate,
      search
    } = filters;
    const where = ['ual.agency_id = ?'];
    const params = [agencyId];

    if (userId) {
      where.push('ual.user_id = ?');
      params.push(userId);
    }
    if (actionType) {
      where.push('ual.action_type = ?');
      params.push(String(actionType));
    }
    if (startDate) {
      const startDateTime = String(startDate).includes(' ') ? String(startDate) : `${startDate} 00:00:00`;
      where.push('ual.created_at >= ?');
      params.push(startDateTime);
    }
    if (endDate) {
      const endDateTime = String(endDate).includes(' ') ? String(endDate) : `${endDate} 23:59:59`;
      where.push('ual.created_at <= ?');
      params.push(endDateTime);
    }
    if (search) {
      const like = `%${String(search).trim().toLowerCase()}%`;
      where.push(`(
        LOWER(COALESCE(u.email, '')) LIKE ? OR
        LOWER(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) LIKE ? OR
        LOWER(COALESCE(ual.action_type, '')) LIKE ? OR
        LOWER(COALESCE(CAST(ual.metadata AS CHAR), '')) LIKE ? OR
        LOWER(COALESCE(ual.ip_address, '')) LIKE ? OR
        LOWER(COALESCE(ual.session_id, '')) LIKE ?
      )`);
      params.push(like, like, like, like, like, like);
    }

    return { where: where.join(' AND '), params };
  }

  static async getAgencyActivityLog(filters = {}) {
    const {
      agencyId,
      limit = 50,
      offset = 0,
      sortBy = 'createdAt',
      sortOrder = 'DESC'
    } = filters;
    const limitValue = Math.max(1, Math.min(parseInt(limit, 10) || 50, 500));
    const offsetValue = Math.max(0, parseInt(offset, 10) || 0);
    const { field, order } = this.normalizeSort(sortBy, sortOrder);
    const { where, params } = this.buildAgencyActivityWhere(filters);

    const [rows] = await pool.execute(
      `SELECT ual.id,
              ual.action_type,
              ual.user_id,
              ual.ip_address,
              ual.user_agent,
              ual.session_id,
              ual.agency_id,
              ual.metadata,
              ual.created_at,
              ual.duration_seconds,
              ual.module_id,
              u.email as user_email,
              u.first_name as user_first_name,
              u.last_name as user_last_name,
              a.name as agency_name,
              m.title as module_title
       FROM user_activity_log ual
       LEFT JOIN users u ON ual.user_id = u.id
       LEFT JOIN agencies a ON ual.agency_id = a.id
       LEFT JOIN modules m ON ual.module_id = m.id
       WHERE ${where}
       ORDER BY ${field} ${order}, ual.id DESC
       LIMIT ${limitValue}
       OFFSET ${offsetValue}`,
      params
    );

    return (rows || []).map((row) => ({
      ...row,
      metadata: this.parseMetadata(row.metadata)
    }));
  }

  static async countAgencyActivityLog(filters = {}) {
    const { where, params } = this.buildAgencyActivityWhere(filters);
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM user_activity_log ual
       LEFT JOIN users u ON ual.user_id = u.id
       WHERE ${where}`,
      params
    );
    return Number(rows?.[0]?.total || 0);
  }

  /**
   * Calculate session duration from login to logout
   * @param {string} sessionId - Session ID
   * @returns {Promise<number|null>} - Duration in seconds or null if session not complete
   */
  static async calculateSessionDuration(sessionId) {
    const [loginRows] = await pool.execute(
      `SELECT created_at FROM user_activity_log 
       WHERE session_id = ? AND action_type = 'login' 
       ORDER BY created_at ASC LIMIT 1`,
      [sessionId]
    );

    const [logoutRows] = await pool.execute(
      `SELECT created_at FROM user_activity_log 
       WHERE session_id = ? AND action_type = 'logout' 
       ORDER BY created_at DESC LIMIT 1`,
      [sessionId]
    );

    if (loginRows.length === 0 || logoutRows.length === 0) {
      return null;
    }

    const loginTime = new Date(loginRows[0].created_at);
    const logoutTime = new Date(logoutRows[0].created_at);
    return Math.floor((logoutTime - loginTime) / 1000);
  }

  /**
   * Get activity summary for a user
   * @param {number} userId - User ID
   * @returns {Promise<Object>} - Summary statistics
   */
  static async getActivitySummary(userId) {
    try {
      // Get total logins
      const [loginCount] = await pool.execute(
        `SELECT COUNT(*) as count FROM user_activity_log 
         WHERE user_id = ? AND action_type = 'login'`,
        [userId]
      );

      // Get first login
      const [firstLogin] = await pool.execute(
        `SELECT created_at FROM user_activity_log 
         WHERE user_id = ? AND action_type = 'login' 
         ORDER BY created_at ASC LIMIT 1`,
        [userId]
      );

      // Get last login
      const [lastLogin] = await pool.execute(
        `SELECT created_at FROM user_activity_log 
         WHERE user_id = ? AND action_type = 'login' 
         ORDER BY created_at DESC LIMIT 1`,
        [userId]
      );

      // Get total time in modules (sum of duration_seconds for module activities)
      // Check if duration_seconds column exists first
      let moduleTime = [{ total_seconds: 0 }];
      let sessionTime = [{ total_seconds: 0 }];
      
      try {
        [moduleTime] = await pool.execute(
          `SELECT COALESCE(SUM(duration_seconds), 0) as total_seconds 
           FROM user_activity_log 
           WHERE user_id = ? AND action_type IN ('module_start', 'module_end', 'module_complete') 
           AND duration_seconds IS NOT NULL`,
          [userId]
        );
      } catch (err) {
        if (err.code === 'ER_BAD_FIELD_ERROR') {
          console.warn('duration_seconds column does not exist yet');
        } else {
          throw err;
        }
      }

      // Get total session time (sum of duration_seconds for logout activities)
      try {
        [sessionTime] = await pool.execute(
          `SELECT COALESCE(SUM(duration_seconds), 0) as total_seconds 
           FROM user_activity_log 
           WHERE user_id = ? AND action_type = 'logout' 
           AND duration_seconds IS NOT NULL`,
          [userId]
        );
      } catch (err) {
        if (err.code === 'ER_BAD_FIELD_ERROR') {
          console.warn('duration_seconds column does not exist yet');
        } else {
          throw err;
        }
      }

      return {
        totalLogins: parseInt(loginCount[0]?.count || 0),
        firstLogin: firstLogin[0]?.created_at || null,
        lastLogin: lastLogin[0]?.created_at || null,
        totalModuleTimeSeconds: parseInt(moduleTime[0]?.total_seconds || 0),
        totalSessionTimeSeconds: parseInt(sessionTime[0]?.total_seconds || 0)
      };
    } catch (error) {
      console.error('Error in getActivitySummary:', error);
      throw error;
    }
  }

  /**
   * Get module time breakdown for a user
   * @param {number} userId - User ID
   * @returns {Promise<Array>} - Array of module time entries
   */
  static async getModuleTimeBreakdown(userId) {
    try {
      const [rows] = await pool.execute(
        `SELECT 
           ual.module_id,
           MAX(m.title) as module_title,
           COUNT(*) as activity_count,
           COALESCE(SUM(ual.duration_seconds), 0) as total_seconds,
           MIN(ual.created_at) as first_access,
           MAX(ual.created_at) as last_access
         FROM user_activity_log ual
         LEFT JOIN modules m ON ual.module_id = m.id
         WHERE ual.user_id = ? 
         AND ual.action_type IN ('module_start', 'module_end', 'module_complete')
         AND ual.module_id IS NOT NULL
         GROUP BY ual.module_id
         ORDER BY COALESCE(SUM(ual.duration_seconds), 0) DESC`,
        [userId]
      );

      return rows.map(row => ({
        moduleId: row.module_id,
        moduleTitle: row.module_title || 'Unknown Module',
        activityCount: parseInt(row.activity_count),
        totalSeconds: parseInt(row.total_seconds),
        firstAccess: row.first_access,
        lastAccess: row.last_access
      }));
    } catch (error) {
      console.error('Error in getModuleTimeBreakdown:', error);
      console.error('Error details:', {
        code: error.code,
        errno: error.errno,
        sqlState: error.sqlState,
        sqlMessage: error.sqlMessage,
        sql: error.sql
      });
      // If columns don't exist, return empty array instead of crashing
      if (error.code === 'ER_BAD_FIELD_ERROR') {
        console.warn('Activity log columns may not exist yet. Returning empty breakdown.');
        return [];
      }
      throw error;
    }
  }

  /**
   * Check if this is the user's first login
   * @param {number} userId - User ID
   * @returns {Promise<boolean>} - True if this is the first login
   */
  static async isFirstLogin(userId) {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) as count FROM user_activity_log 
       WHERE user_id = ? AND action_type = 'login'`,
      [userId]
    );
    return parseInt(rows[0]?.count || 0) === 1;
  }
}

export default UserActivityLog;

