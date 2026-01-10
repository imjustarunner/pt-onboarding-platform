import express from 'express';
import { body } from 'express-validator';
import {
  recordAcknowledgment,
  getAcknowledgment,
  getAcknowledgmentStatus,
  viewAcknowledgedDocument
} from '../controllers/documentAcknowledgment.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

router.post('/:taskId', authenticate, recordAcknowledgment);
router.get('/:taskId', authenticate, getAcknowledgment);
router.get('/:taskId/status', authenticate, getAcknowledgmentStatus);
router.get('/:taskId/view', authenticate, viewAcknowledgedDocument);

export default router;

