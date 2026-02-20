import pool from '../config/database.js';

class TaskListMember {
  static async findByListAndUser(taskListId, userId) {
    const [rows] = await pool.execute(
      'SELECT * FROM task_list_members WHERE task_list_id = ? AND user_id = ?',
      [taskListId, userId]
    );
    return rows[0] || null;
  }

  static async listByTaskList(taskListId) {
    const [rows] = await pool.execute(
      `SELECT tlm.*, u.first_name, u.last_name, u.email
       FROM task_list_members tlm
       JOIN users u ON u.id = tlm.user_id
       WHERE tlm.task_list_id = ?
       ORDER BY tlm.role DESC, u.first_name, u.last_name`,
      [taskListId]
    );
    return rows.map((r) => ({
      id: r.id,
      task_list_id: r.task_list_id,
      user_id: r.user_id,
      role: r.role,
      first_name: r.first_name,
      last_name: r.last_name,
      email: r.email
    }));
  }

  static async add(taskListId, userId, role = 'viewer') {
    const [result] = await pool.execute(
      'INSERT INTO task_list_members (task_list_id, user_id, role) VALUES (?, ?, ?)',
      [taskListId, userId, role]
    );
    return this.findByListAndUser(taskListId, userId);
  }

  static async updateRole(taskListId, userId, role) {
    const [result] = await pool.execute(
      'UPDATE task_list_members SET role = ? WHERE task_list_id = ? AND user_id = ?',
      [role, taskListId, userId]
    );
    return result.affectedRows > 0;
  }

  static async remove(taskListId, userId) {
    const [result] = await pool.execute(
      'DELETE FROM task_list_members WHERE task_list_id = ? AND user_id = ?',
      [taskListId, userId]
    );
    return result.affectedRows > 0;
  }

  static canEdit(role) {
    return role === 'editor' || role === 'admin';
  }

  static canAdmin(role) {
    return role === 'admin';
  }
}

export default TaskListMember;
