import pool from '../config/database.js';

class TaskProject {
  static mapRow(r) {
    if (!r) return null;
    return {
      id: r.id,
      agency_id: r.agency_id,
      name: r.name,
      description: r.description,
      created_by_user_id: r.created_by_user_id,
      due_date: r.due_date,
      status: r.status,
      is_starred: !!Number(r.is_starred),
      created_at: r.created_at,
      updated_at: r.updated_at,
      my_role: r.my_role || null,
      agency_name: r.agency_name || null,
      member_count: r.member_count != null ? Number(r.member_count) : undefined,
      list_count: r.list_count != null ? Number(r.list_count) : undefined,
      open_task_count: r.open_task_count != null ? Number(r.open_task_count) : undefined,
      completed_task_count: r.completed_task_count != null ? Number(r.completed_task_count) : undefined
    };
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT tp.*, a.name AS agency_name
       FROM task_projects tp
       LEFT JOIN agencies a ON a.id = tp.agency_id
       WHERE tp.id = ?`,
      [parseInt(id, 10)]
    );
    return this.mapRow(rows[0]);
  }

  static async findMembership(projectId, userId) {
    const [rows] = await pool.execute(
      `SELECT * FROM task_project_members WHERE project_id = ? AND user_id = ?`,
      [parseInt(projectId, 10), parseInt(userId, 10)]
    );
    return rows[0] || null;
  }

  static async canView(projectId, userId, { canViewAll = false, agencyId = null } = {}) {
    const project = await this.findById(projectId);
    if (!project) return { ok: false, project: null };
    if (canViewAll && agencyId && Number(project.agency_id) === Number(agencyId)) {
      return { ok: true, project, role: 'admin' };
    }
    if (canViewAll && !agencyId) {
      return { ok: true, project, role: 'admin' };
    }
    const m = await this.findMembership(projectId, userId);
    if (m) return { ok: true, project, role: m.role };
    if (Number(project.created_by_user_id) === Number(userId)) {
      return { ok: true, project, role: 'admin' };
    }
    return { ok: false, project };
  }

  static async listForUser(userId, { agencyId = null, teamBrowse = false } = {}) {
    const uid = parseInt(userId, 10);
    let query;
    const params = [];
    if (teamBrowse && agencyId) {
      query = `
        SELECT tp.*, a.name AS agency_name,
          (SELECT COUNT(*) FROM task_project_members tpm WHERE tpm.project_id = tp.id) AS member_count,
          (SELECT COUNT(*) FROM task_project_lists tpl WHERE tpl.project_id = tp.id) AS list_count,
          COALESCE(tpm.role, IF(tp.created_by_user_id = ?, 'admin', NULL)) AS my_role
        FROM task_projects tp
        LEFT JOIN agencies a ON a.id = tp.agency_id
        LEFT JOIN task_project_members tpm ON tpm.project_id = tp.id AND tpm.user_id = ?
        WHERE tp.agency_id = ? AND tp.status != 'archived'
        ORDER BY tp.is_starred DESC, tp.name ASC`;
      params.push(uid, uid, parseInt(agencyId, 10));
    } else {
      query = `
        SELECT tp.*, a.name AS agency_name,
          (SELECT COUNT(*) FROM task_project_members tpm2 WHERE tpm2.project_id = tp.id) AS member_count,
          (SELECT COUNT(*) FROM task_project_lists tpl WHERE tpl.project_id = tp.id) AS list_count,
          COALESCE(tpm.role, 'admin') AS my_role
        FROM task_projects tp
        LEFT JOIN agencies a ON a.id = tp.agency_id
        LEFT JOIN task_project_members tpm ON tpm.project_id = tp.id AND tpm.user_id = ?
        WHERE (tpm.user_id IS NOT NULL OR tp.created_by_user_id = ?)
          AND tp.status != 'archived'`;
      params.push(uid, uid);
      if (agencyId) {
        query += ' AND tp.agency_id = ?';
        params.push(parseInt(agencyId, 10));
      }
      query += ' ORDER BY tp.is_starred DESC, tp.name ASC';
    }
    const [rows] = await pool.execute(query, params);
    // Self-heal creator membership
    await Promise.all(
      (rows || [])
        .filter((r) => !r.my_role && Number(r.created_by_user_id) === uid)
        .map(async (r) => {
          try {
            await this.addMember(r.id, uid, 'admin');
          } catch { /* ignore */ }
        })
    );
    return (rows || []).map((r) => this.mapRow(r));
  }

  static async create({ agencyId, name, description = null, createdByUserId, dueDate = null }) {
    const [result] = await pool.execute(
      `INSERT INTO task_projects (agency_id, name, description, created_by_user_id, due_date)
       VALUES (?, ?, ?, ?, ?)`,
      [
        parseInt(agencyId, 10),
        String(name || '').trim(),
        description,
        createdByUserId,
        dueDate || null
      ]
    );
    await this.addMember(result.insertId, createdByUserId, 'admin');
    return this.findById(result.insertId);
  }

  static async update(id, { name, description, dueDate, status, isStarred }) {
    const parts = [];
    const params = [];
    if (name !== undefined) {
      parts.push('name = ?');
      params.push(String(name).trim());
    }
    if (description !== undefined) {
      parts.push('description = ?');
      params.push(description);
    }
    if (dueDate !== undefined) {
      parts.push('due_date = ?');
      params.push(dueDate || null);
    }
    if (status !== undefined) {
      parts.push('status = ?');
      params.push(status);
    }
    if (isStarred !== undefined) {
      parts.push('is_starred = ?');
      params.push(isStarred ? 1 : 0);
    }
    if (!parts.length) return this.findById(id);
    params.push(parseInt(id, 10));
    await pool.execute(`UPDATE task_projects SET ${parts.join(', ')} WHERE id = ?`, params);
    return this.findById(id);
  }

  static async addMember(projectId, userId, role = 'viewer') {
    try {
      await pool.execute(
        `INSERT INTO task_project_members (project_id, user_id, role) VALUES (?, ?, ?)`,
        [parseInt(projectId, 10), parseInt(userId, 10), role]
      );
    } catch (e) {
      if (e?.code !== 'ER_DUP_ENTRY') throw e;
      await pool.execute(
        `UPDATE task_project_members SET role = ? WHERE project_id = ? AND user_id = ?`,
        [role, parseInt(projectId, 10), parseInt(userId, 10)]
      );
    }
    return this.findMembership(projectId, userId);
  }

  static async listMembers(projectId) {
    const [rows] = await pool.execute(
      `SELECT tpm.*, u.first_name, u.last_name, u.email
       FROM task_project_members tpm
       JOIN users u ON u.id = tpm.user_id
       WHERE tpm.project_id = ?
       ORDER BY tpm.role DESC, u.first_name`,
      [parseInt(projectId, 10)]
    );
    return rows || [];
  }

  /** First project this shared list is attached to (lists are expected to belong to at most one project). */
  static async findLinkedProjectForList(taskListId) {
    const lid = parseInt(taskListId, 10);
    if (!Number.isFinite(lid) || lid <= 0) return null;
    const [rows] = await pool.execute(
      `SELECT tp.id AS project_id, tp.name
       FROM task_project_lists tpl
       JOIN task_projects tp ON tp.id = tpl.project_id
       WHERE tpl.task_list_id = ?
       ORDER BY tpl.id ASC
       LIMIT 1`,
      [lid]
    );
    return rows[0] || null;
  }

  static async attachList(projectId, taskListId) {
    try {
      await pool.execute(
        `INSERT INTO task_project_lists (project_id, task_list_id) VALUES (?, ?)`,
        [parseInt(projectId, 10), parseInt(taskListId, 10)]
      );
    } catch (e) {
      if (e?.code !== 'ER_DUP_ENTRY') throw e;
    }
  }

  static async detachList(projectId, taskListId) {
    await pool.execute(
      `DELETE FROM task_project_lists WHERE project_id = ? AND task_list_id = ?`,
      [parseInt(projectId, 10), parseInt(taskListId, 10)]
    );
  }

  static async removeMember(projectId, userId) {
    const [result] = await pool.execute(
      `DELETE FROM task_project_members WHERE project_id = ? AND user_id = ?`,
      [parseInt(projectId, 10), parseInt(userId, 10)]
    );
    return result.affectedRows > 0;
  }

  static async listAttachedLists(projectId) {
    const [rows] = await pool.execute(
      `SELECT tl.*,
        (SELECT COUNT(*) FROM tasks t
          WHERE t.task_list_id = tl.id AND t.status NOT IN ('completed','overridden')
            AND COALESCE(t.is_private, 0) = 0) AS open_task_count,
        (SELECT COUNT(*) FROM tasks t WHERE t.task_list_id = tl.id) AS total_task_count
       FROM task_project_lists tpl
       JOIN task_lists tl ON tl.id = tpl.task_list_id
       WHERE tpl.project_id = ?
       ORDER BY tl.name`,
      [parseInt(projectId, 10)]
    );
    return rows || [];
  }

  static async getOverview(projectId, viewerUserId) {
    const pid = parseInt(projectId, 10);
    const uid = parseInt(viewerUserId, 10);
    const privateClause = `(COALESCE(t.is_private, 0) = 0 OR t.assigned_to_user_id = ? OR t.assigned_by_user_id = ?)`;

    const [[taskStats]] = await pool.execute(
      `SELECT
         SUM(CASE WHEN t.status NOT IN ('completed','overridden') THEN 1 ELSE 0 END) AS open_count,
         SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) AS completed_count,
         COUNT(*) AS total_count
       FROM tasks t
       WHERE t.project_id = ? AND ${privateClause}`,
      [pid, uid, uid]
    ).catch(() => [[{ open_count: 0, completed_count: 0, total_count: 0 }]]);

    let actionOpen = 0;
    try {
      const [[ai]] = await pool.execute(
        `SELECT COUNT(*) AS c FROM task_action_items tai
         WHERE tai.project_id = ?
           AND tai.status NOT IN ('completed','cancelled')
           AND (COALESCE(tai.is_private, 0) = 0 OR tai.assignee_user_id = ? OR tai.created_by_user_id = ?)`,
        [pid, uid, uid]
      );
      actionOpen = Number(ai?.c || 0);
    } catch {
      actionOpen = 0;
    }

    const lists = await this.listAttachedLists(pid);
    const members = await this.listMembers(pid);

    let docCount = 0;
    try {
      const [[d]] = await pool.execute(
        `SELECT COUNT(*) AS c FROM task_attachments ta
         JOIN tasks t ON t.id = ta.task_id
         WHERE t.project_id = ? AND ${privateClause}`,
        [pid, uid, uid]
      );
      docCount = Number(d?.c || 0);
    } catch {
      docCount = 0;
    }

    const open = Number(taskStats?.open_count || 0);
    const completed = Number(taskStats?.completed_count || 0);
    const total = Number(taskStats?.total_count || 0);
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      open_task_count: open,
      completed_task_count: completed,
      total_task_count: total,
      progress_pct: progress,
      open_action_item_count: actionOpen,
      list_count: lists.length,
      document_count: docCount,
      lists,
      members
    };
  }

  static async listTasks(projectId, viewerUserId) {
    const uid = parseInt(viewerUserId, 10);
    const [rows] = await pool.execute(
      `SELECT t.*, tl.name AS task_list_name, tp.name AS project_name,
              assignee.first_name AS assignee_first_name,
              assignee.last_name AS assignee_last_name
       FROM tasks t
       LEFT JOIN task_lists tl ON tl.id = t.task_list_id
       LEFT JOIN task_projects tp ON tp.id = t.project_id
       LEFT JOIN users assignee ON assignee.id = t.assigned_to_user_id
       WHERE t.project_id = ?
         AND (COALESCE(t.is_private, 0) = 0 OR t.assigned_to_user_id = ? OR t.assigned_by_user_id = ?)
       ORDER BY (t.due_date IS NULL), t.due_date ASC`,
      [parseInt(projectId, 10), uid, uid]
    );
    return rows || [];
  }
}

export default TaskProject;
