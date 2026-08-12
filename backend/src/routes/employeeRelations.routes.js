import express from 'express';
import { authenticate, requireCapability } from '../middleware/auth.middleware.js';
import {
  listMilestones,
  syncFromStartDates,
  updateMilestone
} from '../controllers/employeeRelations.controller.js';

const router = express.Router();

router.use(authenticate, requireCapability('canManageHiring'));

router.get('/', listMilestones);
router.post('/sync-from-start-dates', syncFromStartDates);
router.patch('/:id', updateMilestone);

export default router;
