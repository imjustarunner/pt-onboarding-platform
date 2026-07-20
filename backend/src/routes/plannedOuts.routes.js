import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireAgencyAccess } from '../middleware/agencyAccess.middleware.js';
import {
  listPlannedOuts,
  createPlannedOut,
  deletePlannedOut,
  reviewPlannedOut,
  updatePlannedOut
} from '../controllers/plannedOuts.controller.js';

const router = express.Router();
router.use(authenticate);

router.get('/', requireAgencyAccess, listPlannedOuts);
router.post('/', requireAgencyAccess, createPlannedOut);
router.patch('/:id', updatePlannedOut);
router.post('/:id/review', reviewPlannedOut);
router.delete('/:id', deletePlannedOut);

export default router;
