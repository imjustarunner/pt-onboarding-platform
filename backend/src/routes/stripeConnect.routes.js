import express from 'express';
import { authenticate, requireAgencyAdmin, requireAgencyAccess } from '../middleware/auth.middleware.js';
import {
  startConnect,
  getStripeStatus,
  getStripeDashboardLink,
  disconnectStripe
} from '../controllers/stripeConnect.controller.js';

const router = express.Router({ mergeParams: true });

// All routes require authentication. Status is readable by any agency member;
// connect/disconnect/dashboard-link require admin.
router.post('/connect', authenticate, requireAgencyAdmin, startConnect);
router.get('/status', authenticate, requireAgencyAccess, getStripeStatus);
router.get('/dashboard-link', authenticate, requireAgencyAdmin, getStripeDashboardLink);
router.delete('/disconnect', authenticate, requireAgencyAdmin, disconnectStripe);

export default router;
