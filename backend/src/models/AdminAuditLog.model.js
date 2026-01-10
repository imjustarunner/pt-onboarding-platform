import pool from '../config/database.js';

class AdminAuditLog {
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
      metadata: row.metadata ? JSON.parse(row.metadata) : null
    }));
  }

  static async getAuditLogForUser(userId, agencyId) {
    return this.getAuditLog(agencyId, { userId });
  }
}

export default AdminAuditLog;

