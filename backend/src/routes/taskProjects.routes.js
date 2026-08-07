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
  listProjectActivity,
  listProjectExtras,
  updateProjectMemberRole,
  getProjectWhiteboard,
  saveProjectWhiteboard,
  listProjectWhiteboards,
  createProjectWhiteboard,
  getProjectWhiteboardById,
  saveProjectWhiteboardById,
  deleteProjectWhiteboardById,
  addProjectMember,
  removeProjectMember
} from '../controllers/taskProjects.controller.js';

const router = express.Router();

router.get('/', authenticate, listProjects);
router.post('/', authenticate, createProject);
router.get('/:id', authenticate, getProject);
router.put('/:id', authenticate, updateProject);
router.get('/:id/tasks', authenticate, listProjectTasks);
router.get('/:id/activity', authenticate, listProjectActivity);
router.get('/:id/extras', authenticate, listProjectExtras);
router.get('/:id/whiteboard', authenticate, getProjectWhiteboard);
router.put('/:id/whiteboard', authenticate, saveProjectWhiteboard);
router.get('/:id/whiteboards', authenticate, listProjectWhiteboards);
router.post('/:id/whiteboards', authenticate, createProjectWhiteboard);
router.get('/:id/whiteboards/:wbId', authenticate, getProjectWhiteboardById);
router.put('/:id/whiteboards/:wbId', authenticate, saveProjectWhiteboardById);
router.delete('/:id/whiteboards/:wbId', authenticate, deleteProjectWhiteboardById);
router.post('/:id/lists', authenticate, attachList);
router.delete('/:id/lists/:listId', authenticate, detachList);
router.post('/:id/members', authenticate, addProjectMember);
router.put('/:id/members/:userId/role', authenticate, updateProjectMemberRole);
router.delete('/:id/members/:userId', authenticate, removeProjectMember);

export default router;
