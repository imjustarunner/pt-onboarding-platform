import express from 'express';
import {
  listStickies,
  getSticky,
  createSticky,
  updateSticky,
  updateStickyPosition,
  deleteSticky,
  addEntry,
  updateEntry,
  deleteEntry,
  promoteEntryToTask,
  ensureOwnUser
} from '../controllers/momentumStickies.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

const ownStickies = [authenticate, ensureOwnUser];

router.get('/users/:userId/momentum-stickies', ...ownStickies, listStickies);
router.get('/users/:userId/momentum-stickies/:stickyId', ...ownStickies, getSticky);
router.post('/users/:userId/momentum-stickies', ...ownStickies, createSticky);
router.patch('/users/:userId/momentum-stickies/:stickyId', ...ownStickies, updateSticky);
router.patch('/users/:userId/momentum-stickies/:stickyId/position', ...ownStickies, updateStickyPosition);
router.delete('/users/:userId/momentum-stickies/:stickyId', ...ownStickies, deleteSticky);

router.post('/users/:userId/momentum-stickies/:stickyId/entries', ...ownStickies, addEntry);
router.patch('/users/:userId/momentum-stickies/:stickyId/entries/:entryId', ...ownStickies, updateEntry);
router.delete('/users/:userId/momentum-stickies/:stickyId/entries/:entryId', ...ownStickies, deleteEntry);
router.post('/users/:userId/momentum-stickies/:stickyId/entries/:entryId/promote-to-task', ...ownStickies, promoteEntryToTask);

export default router;
