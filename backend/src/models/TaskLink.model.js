import pool from '../config/database.js';

class TaskLink {
  static mapRow(r) {
    if (!r) return null;
    return {
      id: r.id,
      task_id: r.task_id,
      action_item_id: r.action_item_id,
      url: r.url,
      label: r.label,
      created_by_user_id: r.created_by_user_id,
      created_at: r.created_at
    };
  }

  static async listForTask(taskId) {
    const [rows] = await pool.execute(
      'SELECT * FROM task_links WHERE task_id = ? ORDER BY created_at ASC',
      [parseInt(taskId, 10)]
    );
    return (rows || []).map((r) => this.mapRow(r));
  }

  static async listForActionItem(actionItemId) {
    const [rows] = await pool.execute(
      'SELECT * FROM task_links WHERE action_item_id = ? ORDER BY created_at ASC',
      [parseInt(actionItemId, 10)]
    );
    return (rows || []).map((r) => this.mapRow(r));
  }

  static async create({ taskId = null, actionItemId = null, url, label = null, createdByUserId }) {
    const [result] = await pool.execute(
      `INSERT INTO task_links (task_id, action_item_id, url, label, created_by_user_id)
       VALUES (?, ?, ?, ?, ?)`,
      [
        taskId ? parseInt(taskId, 10) : null,
        actionItemId ? parseInt(actionItemId, 10) : null,
        String(url || '').trim(),
        label ? String(label).trim() : null,
        createdByUserId
      ]
    );
    const [rows] = await pool.execute('SELECT * FROM task_links WHERE id = ?', [result.insertId]);
    return this.mapRow(rows[0]);
  }

  static async delete(id) {
    const [result] = await pool.execute('DELETE FROM task_links WHERE id = ?', [parseInt(id, 10)]);
    return result.affectedRows > 0;
  }
}

export default TaskLink;
