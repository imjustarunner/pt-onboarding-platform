import pool from '../config/database.js';
import TaskListMember from './TaskListMember.model.js';

class TaskList {
  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM task_lists WHERE id = ?',
      [parseInt(id)]
    );
    return rows[0] || null;
  }

  static async listByUserMembership(userId, { agencyId = null } = {}) {
    let query = `
      SELECT tl.*, tlm.role
      FROM task_lists tl
      JOIN task_list_members tlm ON tlm.task_list_id = tl.id AND tlm.user_id = ?
    `;
    const params = [userId];
    if (agencyId) {
      query += ' WHERE tl.agency_id = ?';
      params.push(agencyId);
    }
    query += ' ORDER BY tl.name ASC';
    const [rows] = await pool.execute(query, params);
    return rows.map((r) => ({
      id: r.id,
      agency_id: r.agency_id,
      name: r.name,
      created_by_user_id: r.created_by_user_id,
      created_at: r.created_at,
      updated_at: r.updated_at,
      my_role: r.role
    }));
  }

  static async create({ agencyId, name, createdByUserId }) {
    const [result] = await pool.execute(
      'INSERT INTO task_lists (agency_id, name, created_by_user_id) VALUES (?, ?, ?)',
      [agencyId, String(name || '').trim(), createdByUserId]
    );
    const list = await this.findById(result.insertId);
    if (list) {
      await TaskListMember.add(result.insertId, createdByUserId, 'admin');
    }
    return list;
  }

  static async update(id, { name }) {
    const list = await this.findById(id);
    if (!list) return null;
    if (name !== undefined) {
      await pool.execute('UPDATE task_lists SET name = ? WHERE id = ?', [
        String(name).trim(),
        id
      ]);
    }
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await pool.execute('DELETE FROM task_lists WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }
}

export default TaskList;
