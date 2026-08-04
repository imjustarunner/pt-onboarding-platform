import pool from '../config/database.js';

class TaskAssignee {
  static async listForTask(taskId) {
    const [rows] = await pool.execute(
      `SELECT ta.*, u.first_name, u.last_name, u.email
       FROM task_assignees ta
       JOIN users u ON u.id = ta.user_id
       WHERE ta.task_id = ?
       ORDER BY ta.is_primary DESC, u.first_name`,
      [parseInt(taskId, 10)]
    );
    return rows || [];
  }

  static async listForActionItem(actionItemId) {
    const [rows] = await pool.execute(
      `SELECT ta.*, u.first_name, u.last_name, u.email
       FROM task_assignees ta
       JOIN users u ON u.id = ta.user_id
       WHERE ta.action_item_id = ?
       ORDER BY ta.is_primary DESC, u.first_name`,
      [parseInt(actionItemId, 10)]
    );
    return rows || [];
  }

  static async setForTask(taskId, userIds = [], primaryUserId = null) {
    const tid = parseInt(taskId, 10);
    const ids = [...new Set((userIds || []).map((n) => parseInt(n, 10)).filter((n) => n > 0))];
    await pool.execute('DELETE FROM task_assignees WHERE task_id = ?', [tid]);
    if (!ids.length) return [];
    const primary = primaryUserId ? parseInt(primaryUserId, 10) : ids[0];
    for (const uid of ids) {
      await pool.execute(
        `INSERT INTO task_assignees (task_id, user_id, is_primary) VALUES (?, ?, ?)`,
        [tid, uid, uid === primary ? 1 : 0]
      );
    }
    // Keep legacy single-assignee column in sync
    await pool.execute('UPDATE tasks SET assigned_to_user_id = ? WHERE id = ?', [primary, tid]);
    return this.listForTask(tid);
  }

  static async setForActionItem(actionItemId, userIds = [], primaryUserId = null) {
    const aid = parseInt(actionItemId, 10);
    const ids = [...new Set((userIds || []).map((n) => parseInt(n, 10)).filter((n) => n > 0))];
    await pool.execute('DELETE FROM task_assignees WHERE action_item_id = ?', [aid]);
    if (!ids.length) return [];
    const primary = primaryUserId ? parseInt(primaryUserId, 10) : ids[0];
    for (const uid of ids) {
      await pool.execute(
        `INSERT INTO task_assignees (action_item_id, user_id, is_primary) VALUES (?, ?, ?)`,
        [aid, uid, uid === primary ? 1 : 0]
      );
    }
    await pool.execute('UPDATE task_action_items SET assignee_user_id = ? WHERE id = ?', [primary, aid]);
    return this.listForActionItem(aid);
  }
}

export default TaskAssignee;
