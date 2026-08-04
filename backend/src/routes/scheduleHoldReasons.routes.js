import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  listHoldReasons,
  hideHoldReason,
  addCustomHoldReason,
  saveHoldReasonToAgency
} from '../controllers/scheduleHoldReasons.controller.js';

const router = express.Router();
router.use(authenticate);

router.get('/', listHoldReasons);
router.post('/hide', hideHoldReason);
router.post('/custom', addCustomHoldReason);
router.post('/agency', saveHoldReasonToAgency);

export default router;
