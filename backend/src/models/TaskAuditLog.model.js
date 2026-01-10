import pool from '../config/database.js';

class TaskAuditLog {
  static async logAction(actionData) {
    const {
      taskId,
      actionType,
      actorUserId,
      targetUserId,
      metadata
    } = actionData;

    const [result] = await pool.execute(
      `INSERT INTO task_audit_log (
        task_id, action_type, actor_user_id, target_user_id, metadata
      ) VALUES (?, ?, ?, ?, ?)`,
      [
        taskId,
        actionType,
        actorUserId,
        targetUserId,
        metadata ? JSON.stringify(metadata) : null
      ]
    );

    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM task_audit_log WHERE id = ?',
      [id]
    );
    if (rows[0]) {
      return {
        ...rows[0],
        metadata: this.parseMetadata(rows[0].metadata)
      };
    }
    return null;
  }

  static parseMetadata(metadata) {
    if (!metadata) return null;
    if (typeof metadata === 'object') return metadata; // Already parsed
    if (typeof metadata === 'string') {
      try {
        return JSON.parse(metadata);
      } catch (e) {
        // If it's "[object Object]" or invalid JSON, return null
        return null;
      }
    }
    return null;
  }

  static async getAuditLog(taskId) {
    const [rows] = await pool.execute(
      `SELECT tal.*, 
              u1.first_name as actor_first_name, 
              u1.last_name as actor_last_name,
              u2.first_name as target_first_name,
              u2.last_name as target_last_name
       FROM task_audit_log tal
       LEFT JOIN users u1 ON tal.actor_user_id = u1.id
       LEFT JOIN users u2 ON tal.target_user_id = u2.id
       WHERE tal.task_id = ?
       ORDER BY tal.created_at DESC`,
      [taskId]
    );
    return rows.map(row => ({
      ...row,
      metadata: this.parseMetadata(row.metadata)
    }));
  }

  static async getAuditLogForUser(userId) {
    const [rows] = await pool.execute(
      `SELECT tal.*, 
              u1.first_name as actor_first_name, 
              u1.last_name as actor_last_name,
              u2.first_name as target_first_name,
              u2.last_name as target_last_name
       FROM task_audit_log tal
       LEFT JOIN users u1 ON tal.actor_user_id = u1.id
       LEFT JOIN users u2 ON tal.target_user_id = u2.id
       WHERE tal.target_user_id = ?
       ORDER BY tal.created_at DESC`,
      [userId]
    );
    return rows.map(row => ({
      ...row,
      metadata: this.parseMetadata(row.metadata)
    }));
  }
}

export default TaskAuditLog;

