import TaskProject from '../models/TaskProject.model.js';
import TaskList from '../models/TaskList.model.js';
import User from '../models/User.model.js';
import pool from '../config/database.js';

function canManageRole(role) {
  return ['admin', 'super_admin', 'support', 'supervisor'].includes(String(role || '').toLowerCase())
    || !!role; // capabilities checked separately
}

function isManager(req) {
  const role = String(req.user?.role || '').toLowerCase();
  return ['admin', 'super_admin', 'support', 'supervisor'].includes(role)
    || !!req.user?.capabilities?.canManageHiring;
}

async function ensureInAgency(userId, agencyId) {
  const agencies = await User.getAgencies(userId);
  return (agencies || []).some((a) => Number(a?.id) === Number(agencyId));
}

export const listProjects = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: { message: 'Unauthorized' } });
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    const teamBrowse = String(req.query.teamBrowse || '') === '1' && isManager(req);
    const projects = await TaskProject.listForUser(userId, { agencyId, teamBrowse });
    res.json(projects);
  } catch (err) {
    next(err);
  }
};

export const createProject = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { agencyId, name, description, dueDate } = req.body || {};
    if (!userId) return res.status(401).json({ error: { message: 'Unauthorized' } });
    const aid = parseInt(agencyId, 10);
    if (!aid) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const nameStr = String(name || '').trim();
    if (!nameStr) return res.status(400).json({ error: { message: 'name is required' } });
    if (!(await ensureInAgency(userId, aid)) && !isManager(req)) {
      return res.status(403).json({ error: { message: 'You must be in this agency' } });
    }
    const project = await TaskProject.create({
      agencyId: aid,
      name: nameStr,
      description: description || null,
      createdByUserId: userId,
      dueDate: dueDate || null
    });
    res.status(201).json(project);
  } catch (err) {
    next(err);
  }
};

export const getProject = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const id = parseInt(req.params.id, 10);
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    const access = await TaskProject.canView(id, userId, {
      canViewAll: isManager(req),
      agencyId
    });
    if (!access.ok) return res.status(403).json({ error: { message: 'Forbidden' } });
    const overview = await TaskProject.getOverview(id, userId);
    res.json({ ...access.project, my_role: access.role, overview });
  } catch (err) {
    next(err);
  }
};

export const updateProject = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const id = parseInt(req.params.id, 10);
    const access = await TaskProject.canView(id, userId, { canViewAll: isManager(req) });
    if (!access.ok) return res.status(403).json({ error: { message: 'Forbidden' } });
    if (!['admin', 'editor'].includes(access.role) && !isManager(req)) {
      return res.status(403).json({ error: { message: 'Editor access required' } });
    }
    const { name, description, dueDate, status, isStarred } = req.body || {};
    const updated = await TaskProject.update(id, { name, description, dueDate, status, isStarred });
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

export const attachList = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const id = parseInt(req.params.id, 10);
    const taskListId = parseInt(req.body?.taskListId, 10);
    if (!taskListId) return res.status(400).json({ error: { message: 'taskListId required' } });
    const access = await TaskProject.canView(id, userId, { canViewAll: isManager(req) });
    if (!access.ok || (!['admin', 'editor'].includes(access.role) && !isManager(req))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const list = await TaskList.findById(taskListId);
    if (!list) return res.status(404).json({ error: { message: 'List not found' } });
    await TaskProject.attachList(id, taskListId);
    res.json({ ok: true, lists: await TaskProject.listAttachedLists(id) });
  } catch (err) {
    next(err);
  }
};

export const detachList = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const id = parseInt(req.params.id, 10);
    const taskListId = parseInt(req.params.listId, 10);
    const access = await TaskProject.canView(id, userId, { canViewAll: isManager(req) });
    if (!access.ok || (!['admin', 'editor'].includes(access.role) && !isManager(req))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    await TaskProject.detachList(id, taskListId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

export const listProjectTasks = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const id = parseInt(req.params.id, 10);
    const access = await TaskProject.canView(id, userId, {
      canViewAll: isManager(req),
      agencyId: req.query.agencyId ? parseInt(req.query.agencyId, 10) : null
    });
    if (!access.ok) return res.status(403).json({ error: { message: 'Forbidden' } });
    const tasks = await TaskProject.listTasks(id, userId);
    res.json(tasks);
  } catch (err) {
    next(err);
  }
};

export const addProjectMember = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const id = parseInt(req.params.id, 10);
    const targetUserId = parseInt(req.body?.userId, 10);
    const role = req.body?.role || 'viewer';
    const access = await TaskProject.canView(id, userId, { canViewAll: isManager(req) });
    if (!access.ok || (access.role !== 'admin' && !isManager(req))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    if (!targetUserId) return res.status(400).json({ error: { message: 'userId required' } });
    await TaskProject.addMember(id, targetUserId, role);
    res.json({ members: await TaskProject.listMembers(id) });
  } catch (err) {
    next(err);
  }
};

export const removeProjectMember = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const id = parseInt(req.params.id, 10);
    const targetUserId = parseInt(req.params.userId, 10);
    const access = await TaskProject.canView(id, userId, { canViewAll: isManager(req) });
    if (!access.ok || (access.role !== 'admin' && !isManager(req))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    if (!targetUserId) return res.status(400).json({ error: { message: 'userId required' } });
    const project = access.project;
    if (Number(project.created_by_user_id) === targetUserId) {
      return res.status(400).json({ error: { message: 'Cannot remove project creator' } });
    }
    await TaskProject.removeMember(id, targetUserId);
    res.json({ members: await TaskProject.listMembers(id) });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /task-projects/:id/activity
 * Returns recent audit log entries for tasks in this project.
 */
export const listProjectActivity = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const id = parseInt(req.params.id, 10);
    const access = await TaskProject.canView(id, userId, { canViewAll: isManager(req) });
    if (!access.ok) return res.status(403).json({ error: { message: 'Forbidden' } });

    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);

    // Include tasks directly on the project OR tasks inside attached lists.
    const [rows] = await pool.execute(
      `SELECT tal.id, tal.task_id, tal.action_type, tal.created_at,
              t.title AS task_title,
              u.first_name AS actor_first_name, u.last_name AS actor_last_name
       FROM task_audit_log tal
       JOIN tasks t ON t.id = tal.task_id
       LEFT JOIN users u ON u.id = tal.actor_user_id
       WHERE (
         t.project_id = ?
         OR t.task_list_id IN (
           SELECT task_list_id FROM task_project_lists WHERE project_id = ?
         )
       )
       ORDER BY tal.created_at DESC
       LIMIT ?`,
      [id, id, limit]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /task-projects/:id/whiteboard
 * GET /PUT stored whiteboard JSON for this project.
 */
export const getProjectWhiteboard = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const id = parseInt(req.params.id, 10);
    const access = await TaskProject.canView(id, userId, { canViewAll: isManager(req) });
    if (!access.ok) return res.status(403).json({ error: { message: 'Forbidden' } });

    const [[row]] = await pool.execute(
      'SELECT whiteboard_data FROM task_projects WHERE id = ?',
      [id]
    );
    const data = row?.whiteboard_data;
    res.json({ data: data ? (typeof data === 'string' ? JSON.parse(data) : data) : null });
  } catch (err) {
    next(err);
  }
};

export const saveProjectWhiteboard = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const id = parseInt(req.params.id, 10);
    const access = await TaskProject.canView(id, userId, { canViewAll: isManager(req) });
    if (!access.ok) return res.status(403).json({ error: { message: 'Forbidden' } });

    const { data } = req.body || {};
    await pool.execute(
      'UPDATE task_projects SET whiteboard_data = ? WHERE id = ?',
      [data ? JSON.stringify(data) : null, id]
    ).catch(() => {
      // Column may not exist yet — silently ignore until migration runs
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /task-projects/:id/extras
 * Returns documents, links, and action-item list for the overview panel.
 */
export const listProjectExtras = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const id = parseInt(req.params.id, 10);
    const access = await TaskProject.canView(id, userId, { canViewAll: isManager(req) });
    if (!access.ok) return res.status(403).json({ error: { message: 'Forbidden' } });

    // All task IDs in this project (direct + via attached lists)
    const [taskRows] = await pool.execute(
      `SELECT DISTINCT t.id, t.title, t.status, t.urgency, t.due_date,
              t.assigned_to_user_id, u.first_name, u.last_name
       FROM tasks t
       LEFT JOIN users u ON u.id = t.assigned_to_user_id
       WHERE t.project_id = ?
         OR t.task_list_id IN (SELECT task_list_id FROM task_project_lists WHERE project_id = ?)
       LIMIT 200`,
      [id, id]
    );

    const taskIds = taskRows.map(r => r.id);

    let links = [];
    let attachments = [];
    let actionItems = [];

    if (taskIds.length) {
      const placeholders = taskIds.map(() => '?').join(',');

      const [linkRows] = await pool.execute(
        `SELECT tl.*, t.title AS task_title
         FROM task_links tl
         JOIN tasks t ON t.id = tl.task_id
         WHERE tl.task_id IN (${placeholders})
         ORDER BY tl.created_at DESC LIMIT 50`,
        taskIds
      );
      links = linkRows;

      const [attRows] = await pool.execute(
        `SELECT ta.id, ta.file_name, ta.file_size, ta.mime_type, ta.file_path, ta.created_at,
                t.id AS task_id, t.title AS task_title
         FROM task_attachments ta
         JOIN tasks t ON t.id = ta.task_id
         WHERE ta.task_id IN (${placeholders})
         ORDER BY ta.created_at DESC LIMIT 50`,
        taskIds
      );
      attachments = attRows;
    }

    // Action items for this project
    const [aiRows] = await pool.execute(
      `SELECT tai.id, tai.title, tai.status, tai.urgency, tai.due_date,
              tai.assignee_user_id, u.first_name, u.last_name
       FROM task_action_items tai
       LEFT JOIN users u ON u.id = tai.assignee_user_id
       WHERE tai.project_id = ?
       ORDER BY tai.created_at DESC LIMIT 100`,
      [id]
    );
    actionItems = aiRows;

    res.json({ tasks: taskRows, links, attachments, actionItems });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /task-projects/:id/members/:userId/role — update a member's role
 */
export const updateProjectMemberRole = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const id = parseInt(req.params.id, 10);
    const targetUserId = parseInt(req.params.userId, 10);
    const { role } = req.body || {};
    const access = await TaskProject.canView(id, userId, { canViewAll: isManager(req) });
    if (!access.ok || (access.role !== 'admin' && !isManager(req))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    if (!role) return res.status(400).json({ error: { message: 'role required' } });
    await pool.execute(
      'UPDATE task_project_members SET role = ? WHERE project_id = ? AND user_id = ?',
      [role, id, targetUserId]
    );
    res.json({ members: await TaskProject.listMembers(id) });
  } catch (err) { next(err); }
};

// ─── Multiple whiteboards ─────────────────────────────────────────────────

export const listProjectWhiteboards = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const id = parseInt(req.params.id, 10);
    const access = await TaskProject.canView(id, userId, { canViewAll: isManager(req) });
    if (!access.ok) return res.status(403).json({ error: { message: 'Forbidden' } });
    const [rows] = await pool.execute(
      'SELECT id, name, created_by, created_at, updated_at FROM project_whiteboards WHERE project_id = ? ORDER BY updated_at DESC',
      [id]
    ).catch(() => [[]]);
    res.json(rows);
  } catch (err) { next(err); }
};

export const createProjectWhiteboard = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const id = parseInt(req.params.id, 10);
    const access = await TaskProject.canView(id, userId, { canViewAll: isManager(req) });
    if (!access.ok) return res.status(403).json({ error: { message: 'Forbidden' } });
    const name = (req.body?.name || 'Whiteboard').slice(0, 160);
    const [result] = await pool.execute(
      'INSERT INTO project_whiteboards (project_id, name, created_by) VALUES (?, ?, ?)',
      [id, name, userId]
    );
    const [[wb]] = await pool.execute('SELECT * FROM project_whiteboards WHERE id = ?', [result.insertId]);
    res.json(wb);
  } catch (err) { next(err); }
};

export const getProjectWhiteboardById = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const id = parseInt(req.params.id, 10);
    const wbId = parseInt(req.params.wbId, 10);
    const access = await TaskProject.canView(id, userId, { canViewAll: isManager(req) });
    if (!access.ok) return res.status(403).json({ error: { message: 'Forbidden' } });
    const [[wb]] = await pool.execute(
      'SELECT * FROM project_whiteboards WHERE id = ? AND project_id = ?',
      [wbId, id]
    ).catch(() => [[]]);
    if (!wb) return res.status(404).json({ error: { message: 'Not found' } });
    res.json({ ...wb, data: wb.data ? JSON.parse(wb.data) : null });
  } catch (err) { next(err); }
};

export const saveProjectWhiteboardById = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const id = parseInt(req.params.id, 10);
    const wbId = parseInt(req.params.wbId, 10);
    const access = await TaskProject.canView(id, userId, { canViewAll: isManager(req) });
    if (!access.ok) return res.status(403).json({ error: { message: 'Forbidden' } });
    const { data, name } = req.body || {};
    await pool.execute(
      'UPDATE project_whiteboards SET data = ?, name = COALESCE(?, name) WHERE id = ? AND project_id = ?',
      [data ? JSON.stringify(data) : null, name || null, wbId, id]
    ).catch(() => {});
    res.json({ ok: true });
  } catch (err) { next(err); }
};

export const deleteProjectWhiteboardById = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const id = parseInt(req.params.id, 10);
    const wbId = parseInt(req.params.wbId, 10);
    const access = await TaskProject.canView(id, userId, { canViewAll: isManager(req) });
    if (!access.ok || (access.role !== 'admin' && !isManager(req))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    await pool.execute(
      'DELETE FROM project_whiteboards WHERE id = ? AND project_id = ?',
      [wbId, id]
    ).catch(() => {});
    res.json({ ok: true });
  } catch (err) { next(err); }
};

// silence unused
void canManageRole;
