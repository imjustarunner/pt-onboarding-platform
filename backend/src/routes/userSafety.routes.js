import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  submitContentReport,
  blockUser,
  unblockUser,
  listMyBlocks
} from '../controllers/userSafety.controller.js';

const router = express.Router();

router.post('/reports', authenticate, submitContentReport);
router.post('/blocks', authenticate, blockUser);
router.delete('/blocks/:userId', authenticate, unblockUser);
router.get('/blocks', authenticate, listMyBlocks);

export default router;
