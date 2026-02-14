import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { getUserPreferences, updateUserPreferences, updateKioskPin } from '../controllers/userPreferences.controller.js';
import {
  registerPushSubscription,
  unregisterPushSubscription
} from '../controllers/pushSubscription.controller.js';

const router = express.Router();

// Kiosk PIN (must be before :userId routes)
router.put('/me/kiosk-pin', authenticate, updateKioskPin);

// Get user preferences
router.get('/:userId/preferences', authenticate, getUserPreferences);

// Update user preferences
router.put('/:userId/preferences', authenticate, updateUserPreferences);

// Push subscription (for browser push notifications)
router.post('/:userId/push-subscription', authenticate, registerPushSubscription);
router.delete('/:userId/push-subscription', authenticate, unregisterPushSubscription);

export default router;
