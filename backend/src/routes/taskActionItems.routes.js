import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  listActionItems,
  createActionItem,
  updateActionItem,
  completeActionItem,
  reopenActionItem
} from '../controllers/taskActionItems.controller.js';

const router = express.Router();
router.use(authenticate);

router.get('/', listActionItems);
router.post('/', createActionItem);
router.put('/:id', updateActionItem);
router.post('/:id/complete', completeActionItem);
router.post('/:id/reopen', reopenActionItem);

export default router;
