import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  listPendingComplianceClients,
  listRoiRenewalCandidates,
  queueBulkRoiRenewalEmails,
  sendProviderRoiReminders
} from '../controllers/complianceCorner.controller.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// GET /api/compliance-corner/pending-clients
router.get('/pending-clients', listPendingComplianceClients);
router.get('/roi-renewals', listRoiRenewalCandidates);
router.post('/roi-renewals/bulk-email', queueBulkRoiRenewalEmails);
router.post('/roi-provider-reminders', sendProviderRoiReminders);

export default router;
