import express from 'express';
import { authenticate, requireBackofficeAdmin } from '../middleware/auth.middleware.js';
import { getEmailSettings, updateEmailSettings } from '../controllers/emailSettings.controller.js';

const router = express.Router();

router.get('/', authenticate, requireBackofficeAdmin, getEmailSettings);
router.put('/', authenticate, requireBackofficeAdmin, updateEmailSettings);

export default router;
