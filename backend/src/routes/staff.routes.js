import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { getCoworkers } from '../controllers/staff.controller.js';

const router = express.Router();
router.use(authenticate);

router.get('/coworkers', getCoworkers);

export default router;
