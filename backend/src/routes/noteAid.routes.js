import express from 'express';
import { body, query } from 'express-validator';
import { authenticate, requireActiveStatus } from '../middleware/auth.middleware.js';
import { noteAidLimiter } from '../middleware/rateLimiter.middleware.js';
import { listNoteAidTools, executeNoteAidTool } from '../controllers/noteAid.controller.js';

const router = express.Router();

// Note Aid is a logged-in tool; also block archived/expired users.
router.use(authenticate, requireActiveStatus);

router.get('/tools', [query('agencyId').isInt({ min: 1 })], listNoteAidTools);

router.post(
  '/execute',
  noteAidLimiter,
  [
    body('agencyId').isInt({ min: 1 }),
    body('toolId').isString().isLength({ min: 1, max: 64 }),
    body('inputText').isString().isLength({ min: 1, max: 12000 })
  ],
  executeNoteAidTool
);

export default router;

