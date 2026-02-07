import express from 'express';
import { authenticate, requireSuperAdmin } from '../middleware/auth.middleware.js';
import { getPlatformRetentionSettings, updatePlatformRetentionSettings } from '../controllers/platformRetentionSettings.controller.js';
import { body } from 'express-validator';

const router = express.Router();

router.use(authenticate, requireSuperAdmin);

router.get('/', getPlatformRetentionSettings);

router.put(
  '/',
  [
    body('defaultIntakeRetentionMode').optional().isIn(['days', 'never']),
    body('defaultIntakeRetentionDays').optional().isInt({ min: 1, max: 3650 })
  ],
  updatePlatformRetentionSettings
);

export default router;
