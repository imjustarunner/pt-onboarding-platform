import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { listPendingComplianceClients } from '../controllers/complianceCorner.controller.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// GET /api/compliance-corner/pending-clients
router.get('/pending-clients', listPendingComplianceClients);

export default router;
