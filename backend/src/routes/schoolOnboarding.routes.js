import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as ctrl from '../controllers/schoolOnboarding.controller.js';

const router = express.Router();

router.get('/invites', authenticate, ctrl.listInvites);
router.post('/invites', authenticate, ctrl.createInvite);
router.post('/invites/:id/resend', authenticate, ctrl.resendInvite);
router.post('/invites/:id/revoke', authenticate, ctrl.revokeInvite);

router.get('/qr-link', authenticate, ctrl.getQrLink);
router.post('/qr-link/rotate', authenticate, ctrl.rotateQrLink);
router.post('/qr-link/revoke', authenticate, ctrl.revokeQrLink);

export default router;
