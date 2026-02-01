import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  createSupervisionSession,
  createSupervisionSessionValidators,
  patchSupervisionSession,
  patchSupervisionSessionValidators,
  cancelSupervisionSession,
  getSuperviseeHoursSummary
} from '../controllers/supervisionSessions.controller.js';

const router = express.Router();
router.use(authenticate);

router.get('/supervisee/:superviseeId/hours-summary', getSuperviseeHoursSummary);
router.post('/sessions', createSupervisionSessionValidators, createSupervisionSession);
router.patch('/sessions/:id', patchSupervisionSessionValidators, patchSupervisionSession);
router.post('/sessions/:id/cancel', cancelSupervisionSession);

export default router;

