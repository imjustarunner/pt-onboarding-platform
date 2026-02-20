import express from 'express';
import {
  listTaskLists,
  createTaskList,
  getTaskList,
  updateTaskList,
  deleteTaskList,
  addMember,
  removeMember,
  listTasks,
  createTaskInList,
  listAgencyUsers
} from '../controllers/taskLists.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import TaskListMember from '../models/TaskListMember.model.js';

const router = express.Router();

const withAuth = [authenticate];

async function requireMembership(req, res, next) {
  const listId = parseInt(req.params.listId || req.params.id, 10);
  const userId = req.user?.id;
  if (!userId || !listId) {
    return res.status(400).json({ error: { message: 'Invalid request' } });
  }
  const membership = await TaskListMember.findByListAndUser(listId, userId);
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
