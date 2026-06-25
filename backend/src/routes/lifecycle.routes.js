import express from 'express';
import { authenticate, requireBackofficeAdmin } from '../middleware/auth.middleware.js';
import { listChecklistDefinitions } from '../controllers/lifecycle.controller.js';

const router = express.Router();

router.get(
  '/checklist-definitions',
  authenticate,
  requireBackofficeAdmin,
  listChecklistDefinitions
);

export default router;
