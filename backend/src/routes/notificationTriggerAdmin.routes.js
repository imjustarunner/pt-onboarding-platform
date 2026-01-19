import express from 'express';
import { body } from 'express-validator';
import { authenticate, requireSuperAdmin } from '../middleware/auth.middleware.js';
import { listNotificationTriggers, updateTriggerDefaultSenderIdentity } from '../controllers/notificationTriggerAdmin.controller.js';

const router = express.Router();

router.get('/', authenticate, requireSuperAdmin, listNotificationTriggers);

router.put(
  '/:triggerKey/default-sender',
  authenticate,
  requireSuperAdmin,
  [
    body('defaultSenderIdentityId')
      .optional({ nullable: true })
      .custom((v) => v === null || v === '' || (Number.isFinite(Number(v)) && Number(v) >= 1))
      .withMessage('defaultSenderIdentityId must be null or a positive integer')
  ],
  updateTriggerDefaultSenderIdentity
);

export default router;

