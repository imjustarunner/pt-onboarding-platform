import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  uploadPsychotherapyComplianceReport,
  getPsychotherapyComplianceSummary,
  getSuperviseeClients24Plus,
  matchPsychotherapyComplianceClient
} from '../controllers/psychotherapyCompliance.controller.js';

const router = express.Router();

router.use(authenticate);

router.post('/uploads', ...uploadPsychotherapyComplianceReport);
router.get('/summary', getPsychotherapyComplianceSummary);
router.get('/supervisee/:superviseeId/clients-24-plus', getSuperviseeClients24Plus);
router.post('/match', matchPsychotherapyComplianceClient);

export default router;

