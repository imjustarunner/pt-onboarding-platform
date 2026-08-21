import express from 'express';
import * as ctrl from '../controllers/publicClientRenewal.controller.js';

const router = express.Router();

router.get('/:token', ctrl.getPublicRenewal);
router.post('/:token/verify-contact', ctrl.postVerifyContact);
router.post('/:token/opt-out', ctrl.postOptOut);
router.post('/:token/mark-step', ctrl.postMarkStep);
router.post('/:token/support-tickets', ctrl.postSupportTicket);

export default router;
