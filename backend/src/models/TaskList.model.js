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

  /**
   * Lists the user can see: explicit membership OR lists they created.
   * Agency filter is optional; when omitted, returns all memberships across orgs.
   * Self-heals missing creator membership rows.
   */
  static async listByUserMembership(userId, { agencyId = null } = {}) {
    const uid = parseInt(userId, 10);
    let query = `
      SELECT tl.*,
        COALESCE(tlm.role, 'admin') AS role,
        tlm.user_id AS member_user_id
      FROM task_lists tl
      LEFT JOIN task_list_members tlm
        ON tlm.task_list_id = tl.id AND tlm.user_id = ?
      WHERE (tlm.user_id IS NOT NULL OR tl.created_by_user_id = ?)
    `;
    const params = [uid, uid];
    if (agencyId) {
      query += ' AND tl.agency_id = ?';
      params.push(parseInt(agencyId, 10));
    }
    query += ' ORDER BY tl.name ASC';
    const [rows] = await pool.execute(query, params);

    // Ensure creators always have a membership row so future lookups stay consistent.
    await Promise.all(
      rows
        .filter((r) => !r.member_user_id && Number(r.created_by_user_id) === uid)
        .map(async (r) => {
          try {
            await TaskListMember.add(r.id, uid, 'admin');
          } catch {
            // ignore duplicate / race
          }
        })
    );

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
