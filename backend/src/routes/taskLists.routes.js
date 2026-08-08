import express from 'express';
import {
  listTaskLists,
  listTeamTaskLists,
  createTaskList,
  getTaskList,
  updateTaskList,
  deleteTaskList,
  addMember,
  removeMember,
  listTasks,
  listTeamListTasks,
  createTaskInList,
  listAgencyUsers
} from '../controllers/taskLists.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import TaskListMember from '../models/TaskListMember.model.js';
import pool from '../config/database.js';

const router = express.Router();

const withAuth = [authenticate];

function isPlatformManager(req) {
  const role = String(req.user?.role || '').toLowerCase();
  return ['admin', 'super_admin', 'support', 'supervisor'].includes(role);
}

// A list attached to a project grants list access to that project's members
// (mapped to the equivalent list role), so people don't need to be added to
// both the project and the list separately.
async function projectRoleForList(listId, userId) {
  const [rows] = await pool.execute(
    `SELECT tpm.role
     FROM task_project_lists tpl
     JOIN task_project_members tpm ON tpm.project_id = tpl.project_id AND tpm.user_id = ?
     WHERE tpl.task_list_id = ?
     ORDER BY CASE tpm.role WHEN 'admin' THEN 1 WHEN 'editor' THEN 2 ELSE 3 END
     LIMIT 1`,
    [userId, listId]
  );
  return rows[0]?.role || null;
}

async function requireMembership(req, res, next) {
  const listId = parseInt(req.params.listId || req.params.id, 10);
  const userId = req.user?.id;
  if (!userId || !listId) {
    return res.status(400).json({ error: { message: 'Invalid request' } });
  }
  let membership = await TaskListMember.findByListAndUser(listId, userId);
  if (!membership) {
    if (isPlatformManager(req)) {
      membership = { role: 'admin' };
    } else {
      const projectRole = await projectRoleForList(listId, userId);
      if (projectRole) {
        membership = { role: projectRole === 'admin' ? 'admin' : projectRole === 'editor' ? 'editor' : 'viewer' };
      }
    }
  }
  if (!membership) {
    return res.status(403).json({ error: { message: 'You are not a member of this list' } });
  }
  req.taskListMembership = membership;
  req.taskListId = listId;
  next();
}

function requireEditor(req, res, next) {
  if (!TaskListMember.canEdit(req.taskListMembership?.role)) {
    return res.status(403).json({ error: { message: 'You need editor or admin role to perform this action' } });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!TaskListMember.canAdmin(req.taskListMembership?.role)) {
    return res.status(403).json({ error: { message: 'You need admin role to perform this action' } });
  }
  next();
}

router.get('/task-lists', ...withAuth, listTaskLists);
router.get('/task-lists/team', ...withAuth, listTeamTaskLists);
router.get('/task-lists/:id/team-tasks', ...withAuth, listTeamListTasks);
router.post('/task-lists', ...withAuth, createTaskList);

router.get(
  '/task-lists/:id',
  ...withAuth,
  (req, res, next) => {
    req.params.listId = req.params.id;
    next();
  },
  requireMembership,
  getTaskList
);
router.patch(
  '/task-lists/:id',
  ...withAuth,
  (req, res, next) => {
    req.params.listId = req.params.id;
    next();
  },
  requireMembership,
  requireAdmin,
  updateTaskList
);
router.delete(
  '/task-lists/:id',
  ...withAuth,
  (req, res, next) => {
    req.params.listId = req.params.id;
    next();
  },
  requireMembership,
  requireAdmin,
  deleteTaskList
);

router.get(
  '/task-lists/:id/agency-users',
  ...withAuth,
  (req, res, next) => {
    req.params.listId = req.params.id;
    next();
  },
  requireMembership,
  requireAdmin,
  listAgencyUsers
);
router.post(
  '/task-lists/:id/members',
  ...withAuth,
  (req, res, next) => {
    req.params.listId = req.params.id;
    next();
  },
  requireMembership,
  requireAdmin,
  addMember
);
router.delete(
  '/task-lists/:id/members/:userId',
  ...withAuth,
  (req, res, next) => {
    req.params.listId = req.params.id;
    next();
  },
  requireMembership,
  requireAdmin,
  removeMember
);

router.get(
  '/task-lists/:id/tasks',
  ...withAuth,
  (req, res, next) => {
    req.params.listId = req.params.id;
    next();
  },
  requireMembership,
  listTasks
);
router.post(
  '/task-lists/:id/tasks',
  ...withAuth,
  (req, res, next) => {
    req.params.listId = req.params.id;
    next();
  },
  requireMembership,
  requireEditor,
  createTaskInList
);

export default router;
