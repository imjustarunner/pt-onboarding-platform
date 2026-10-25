import express from 'express';
import { authenticate, requireActiveStatus } from '../middleware/auth.middleware.js';
import { getCoworkers, getStaffDirectory } from '../controllers/staff.controller.js';

const router = express.Router();
router.use(authenticate);

router.get('/directory', requireActiveStatus, getStaffDirectory);

router.get('/coworkers', getCoworkers);

export default router;
