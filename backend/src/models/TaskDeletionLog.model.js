/**
 * Log task deletions before CASCADE removes task_audit_log rows.
 * No FK to tasks so we retain a record.
 */
import pool from '../config/database.js';

class TaskDeletionLog {
  static async logDeletion({ taskId, taskTitle, actorUserId, source = 'momentum_user_request', metadata = null }) {
    const [result] = await pool.execute(
      `INSERT INTO task_deletion_log (task_id, task_title, actor_user_id, source, metadata)
       VALUES (?, ?, ?, ?, ?)`,
      [taskId, taskTitle || null, actorUserId, source || null, metadata ? JSON.stringify(metadata) : null]
    );
    return result?.insertId;
  }
}

export default TaskDeletionLog;
