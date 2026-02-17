import pool from '../config/database.js';

class AdminAuditLog {
  static parseMetadata(raw) {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  static async logAction(actionData) {
    const { actionType, actorUserId, targetUserId, moduleId, trackId, agencyId, metadata } = actionData;
    
    const [result] = await pool.execute(
      'INSERT INTO admin_audit_log (action_type, actor_user_id, target_user_id, module_id, track_id, agency_id, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [actionType, actorUserId, targetUserId, moduleId || null, trackId || null, agencyId, metadata ? JSON.stringify(metadata) : null]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM admin_audit_log WHERE id = ?',
      [id]
    );
    return rows[0] || null;
  }

  static async getAuditLog(agencyId, filters = {}) {
    const { userId, actionType, startDate, endDate, limit = 100 } = filters;
    let query = `
      SELECT aal.*, 
             actor.first_name as actor_first_name, 
             actor.last_name as actor_last_name,
             actor.email as actor_email,
             target.first_name as target_first_name,
             target.last_name as target_last_name,
             target.email as target_email,
             m.title as module_title,
             t.name as track_name
      FROM admin_audit_log aal
      LEFT JOIN users actor ON aal.actor_user_id = actor.id
      LEFT JOIN users target ON aal.target_user_id = target.id
      LEFT JOIN modules m ON aal.module_id = m.id
      LEFT JOIN training_tracks t ON aal.track_id = t.id
      WHERE aal.agency_id = ?
    `;
    const params = [agencyId];

    // Use explicit null/undefined checks to avoid adding null values
    if (userId !== null && userId !== undefined) {
      query += ' AND aal.target_user_id = ?';
      params.push(userId);
    }

    if (actionType !== null && actionType !== undefined && actionType !== '') {
      query += ' AND aal.action_type = ?';
      params.push(actionType);
    }

    if (startDate !== null && startDate !== undefined && startDate !== '') {
      query += ' AND aal.created_at >= ?';
      params.push(startDate);
    }

    if (endDate !== null && endDate !== undefined && endDate !== '') {
      query += ' AND aal.created_at <= ?';
      params.push(endDate);
    }

    query += ' ORDER BY aal.created_at DESC LIMIT ?';
    params.push(parseInt(limit) || 100);

    const [rows] = await pool.execute(query, params);
    return rows.map(row => ({
      ...row,
      metadata: this.parseMetadata(row.metadata)
    }));
  }

  static async getAuditLogForUser(userId, agencyId) {
    return this.getAuditLog(agencyId, { userId });
  }

  static normalizeSort(sortBy, sortOrder) {
    const allowlist = {
      createdAt: 'aal.created_at',
      actionType: 'aal.action_type',
      userEmail: 'target.email',
      userName: 'target.last_name'
    };
    const field = allowlist[String(sortBy || '').trim()] || allowlist.createdAt;
    const order = String(sortOrder || '').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    return { field, order };
  }

  static buildWhere(filters = {}) {
    const {
      agencyId,
      userId,
      actionType,
      startDate,
      endDate,
      search
    } = filters;
    const where = ['aal.agency_id = ?'];
    const params = [agencyId];

    if (userId) {
      where.push('(aal.target_user_id = ? OR aal.actor_user_id = ?)');
      params.push(userId, userId);
    }
    if (actionType) {
      where.push('aal.action_type = ?');
      params.push(String(actionType));
    }
    if (startDate) {
      const startDateTime = String(startDate).includes(' ') ? String(startDate) : `${startDate} 00:00:00`;
      where.push('aal.created_at >= ?');
      params.push(startDateTime);
    }
    if (endDate) {
      const endDateTime = String(endDate).includes(' ') ? String(endDate) : `${endDate} 23:59:59`;
      where.push('aal.created_at <= ?');
      params.push(endDateTime);
    }
    if (search) {
      const like = `%${String(search).trim().toLowerCase()}%`;
      where.push(`(
        LOWER(COALESCE(aal.action_type, '')) LIKE ? OR
        LOWER(COALESCE(actor.email, '')) LIKE ? OR
        LOWER(COALESCE(target.email, '')) LIKE ? OR
        LOWER(CONCAT(COALESCE(actor.first_name, ''), ' ', COALESCE(actor.last_name, ''))) LIKE ? OR
        LOWER(CONCAT(COALESCE(target.first_name, ''), ' ', COALESCE(target.last_name, ''))) LIKE ? OR
        LOWER(COALESCE(CAST(aal.metadata AS CHAR), '')) LIKE ?
      )`);
      params.push(like, like, like, like, like, like);
    }
    return { where: where.join(' AND '), params };
  }

  static async getAgencyAuditLogPaged(filters = {}) {
    const {
      limit = 50,
      offset = 0,
      sortBy = 'createdAt',
      sortOrder = 'DESC'
    } = filters;
    const limitValue = Math.max(1, Math.min(parseInt(limit, 10) || 50, 500));
    const offsetValue = Math.max(0, parseInt(offset, 10) || 0);
    const { field, order } = this.normalizeSort(sortBy, sortOrder);
    const { where, params } = this.buildWhere(filters);

    const [rows] = await pool.execute(
      `SELECT aal.*,
              actor.first_name as actor_first_name,
              actor.last_name as actor_last_name,
              actor.email as actor_email,
              target.first_name as target_first_name,
              target.last_name as target_last_name,
              target.email as target_email,
              m.title as module_title,
              t.name as track_name
       FROM admin_audit_log aal
       LEFT JOIN users actor ON aal.actor_user_id = actor.id
       LEFT JOIN users target ON aal.target_user_id = target.id
       LEFT JOIN modules m ON aal.module_id = m.id
       LEFT JOIN training_tracks t ON aal.track_id = t.id
       WHERE ${where}
       ORDER BY ${field} ${order}, aal.id DESC
       LIMIT ${limitValue}
       OFFSET ${offsetValue}`,
      params
    );

    return (rows || []).map((row) => ({
      ...row,
      metadata: this.parseMetadata(row.metadata)
    }));
  }

  static async countAgencyAuditLog(filters = {}) {
    const { where, params } = this.buildWhere(filters);
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM admin_audit_log aal
       LEFT JOIN users actor ON aal.actor_user_id = actor.id
       LEFT JOIN users target ON aal.target_user_id = target.id
       WHERE ${where}`,
      params
    );
    return Number(rows?.[0]?.total || 0);
  }
}

export default AdminAuditLog;

