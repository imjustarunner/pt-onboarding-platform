import pool from '../config/database.js';

class TaskCollaborator {
  static async listForTask(taskId) {
    const [rows] = await pool.execute(
      `SELECT tc.*, u.first_name, u.last_name, u.email
       FROM task_collaborators tc
       JOIN users u ON u.id = tc.user_id
       WHERE tc.task_id = ?
       ORDER BY u.first_name, u.last_name`,
      [parseInt(taskId, 10)]
    );
    return rows || [];
  }

  static async setForTask(taskId, userIds = []) {
    const tid = parseInt(taskId, 10);
    const ids = [...new Set((userIds || []).map((n) => parseInt(n, 10)).filter((n) => n > 0))];
    await pool.execute('DELETE FROM task_collaborators WHERE task_id = ?', [tid]);
    for (const uid of ids) {
      await pool.execute(
        `INSERT INTO task_collaborators (task_id, user_id) VALUES (?, ?)`,
        [tid, uid]
      );
    }
    return this.listForTask(tid);
  }

  static async clearForTask(taskId) {
    await pool.execute('DELETE FROM task_collaborators WHERE task_id = ?', [parseInt(taskId, 10)]);
  }

  static async pruneToAllowed(taskId, allowedUserIds) {
    const allowed = new Set(
      (allowedUserIds || []).map((n) => parseInt(n, 10)).filter((n) => n > 0)
    );
    const current = await this.listForTask(taskId);
    const keep = current
      .map((r) => Number(r.user_id))
      .filter((uid) => allowed.has(uid));
    return this.setForTask(taskId, keep);
  }

  static async removeUser(taskId, userId) {
    await pool.execute(
      'DELETE FROM task_collaborators WHERE task_id = ? AND user_id = ?',
      [parseInt(taskId, 10), parseInt(userId, 10)]
    );
  }
}

export default TaskCollaborator;
