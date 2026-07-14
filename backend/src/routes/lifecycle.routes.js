import express from 'express';
import { authenticate, requireBackofficeAdminOrCpa } from '../middleware/auth.middleware.js';
import { listChecklistDefinitions } from '../controllers/lifecycle.controller.js';

const router = express.Router();

router.get(
  '/checklist-definitions',
  authenticate,
  requireBackofficeAdminOrCpa,
  listChecklistDefinitions
);

export default router;
