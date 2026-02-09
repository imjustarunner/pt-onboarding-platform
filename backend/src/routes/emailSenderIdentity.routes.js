import express from 'express';
import { body } from 'express-validator';
import { authenticate, requireBackofficeAdmin, requireSuperAdmin } from '../middleware/auth.middleware.js';
import {
  listEmailSenderIdentities,
  createEmailSenderIdentity,
  updateEmailSenderIdentity,
  sendTestEmailFromIdentity
} from '../controllers/emailSenderIdentity.controller.js';

const router = express.Router();

router.get('/', authenticate, requireBackofficeAdmin, listEmailSenderIdentities);

router.post(
  '/',
  authenticate,
  requireBackofficeAdmin,
  [
    body('agencyId').optional().custom((v) => v === null || v === '' || (Number.isFinite(Number(v)) && Number(v) >= 1)).withMessage('agencyId must be null or a positive integer'),
    body('identityKey').trim().notEmpty().withMessage('identityKey is required'),
    body('fromEmail').trim().isEmail().withMessage('fromEmail must be a valid email'),
    body('displayName').optional(),
    body('replyTo').optional().custom((v) => v === null || v === '' || /^\S+@\S+\.\S+$/.test(String(v))).withMessage('replyTo must be a valid email'),
    body('inboundAddresses').optional().isArray().withMessage('inboundAddresses must be an array'),
    body('isActive').optional().isBoolean().withMessage('isActive must be a boolean')
  ],
  createEmailSenderIdentity
);

router.put(
  '/:id',
  authenticate,
  requireBackofficeAdmin,
  [
    body('identityKey').optional(),
    body('fromEmail').optional().custom((v) => v === null || v === '' || /^\S+@\S+\.\S+$/.test(String(v))).withMessage('fromEmail must be a valid email'),
    body('displayName').optional(),
    body('replyTo').optional().custom((v) => v === null || v === '' || /^\S+@\S+\.\S+$/.test(String(v))).withMessage('replyTo must be a valid email'),
    body('inboundAddresses').optional().isArray().withMessage('inboundAddresses must be an array'),
    body('isActive').optional().isBoolean().withMessage('isActive must be a boolean')
  ],
  updateEmailSenderIdentity
);

router.post(
  '/:id/test',
  authenticate,
  requireBackofficeAdmin,
  [
    body('toEmail').optional().custom((v) => v === null || v === '' || /^\S+@\S+\.\S+$/.test(String(v))).withMessage('toEmail must be a valid email'),
    body('subject').optional(),
    body('text').optional()
  ],
  sendTestEmailFromIdentity
);

export default router;

