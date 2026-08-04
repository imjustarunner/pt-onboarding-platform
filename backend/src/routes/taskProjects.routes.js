import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  listProjects,
  createProject,
  getProject,
  updateProject,
  attachList,
  detachList,
  listProjectTasks,
  addProjectMember,
  removeProjectMember
} from '../controllers/taskProjects.controller.js';

const router = express.Router();

router.get('/', authenticate, listProjects);
router.post('/', authenticate, createProject);
router.get('/:id', authenticate, getProject);
router.put('/:id', authenticate, updateProject);
router.get('/:id/tasks', authenticate, listProjectTasks);
router.post('/:id/lists', authenticate, attachList);
router.delete('/:id/lists/:listId', authenticate, detachList);
router.post('/:id/members', authenticate, addProjectMember);
router.delete('/:id/members/:userId', authenticate, removeProjectMember);

export default router;
