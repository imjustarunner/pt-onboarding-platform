import express from 'express';
import { authenticate, requireAgencyAccess } from '../middleware/auth.middleware.js';
import { getSnapshot } from '../controllers/schoolReports.controller.js';

const router = express.Router();

router.get('/snapshot', authenticate, requireAgencyAccess, getSnapshot);

export default router;
