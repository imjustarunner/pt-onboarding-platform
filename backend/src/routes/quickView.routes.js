import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  getMyQuickViewStatus,
  postRegenerateToken,
  postResetPasscode,
  postRevealToken,
  getTokenInfo,
  getDeliveryTokenInfo,
  postUnlock,
  postDeliveryUnlock,
  getTenantQuickViewInfo,
  postTenantUnlock,
  postHeartbeat,
  postLogout,
  requireQuickViewSession,
  getQuickHome,
  getQuickTasks,
  getQuickDayCalendar,
  getQuickOfficeAvailability,
  getQuickConversation,
  getQuickContacts,
  postQuickReply,
  postQuickCompose,
  postQuickContact,
  postQuickTask,
  postQuickTaskStatus,
  getQuickViewPwaManifest
} from '../controllers/quickView.controller.js';

const router = express.Router();

// Authenticated: Account Info → Privacy credential management
router.get('/me/status', authenticate, getMyQuickViewStatus);
router.post('/me/regenerate-token', authenticate, postRegenerateToken);
router.post('/me/reset-passcode', authenticate, postResetPasscode);
router.post('/me/reveal-token', authenticate, postRevealToken);

// Public PWA manifest (absolute start_url for iOS Add to Home Screen)
router.get('/pwa-manifest', getQuickViewPwaManifest);

// Tenant home: PIN-only (no setup-link bind required)
router.get('/tenant', getTenantQuickViewInfo);
router.post('/tenant/unlock', postTenantUnlock);

// Public token landing + unlock
router.get('/t/:token', getTokenInfo);
router.post('/t/:token/unlock', postUnlock);
router.get('/d/:token', getDeliveryTokenInfo);
router.post('/d/:token/unlock', postDeliveryUnlock);

// Session
router.post('/session/heartbeat', postHeartbeat);
router.post('/session/logout', postLogout);

// Scoped Quick View data
router.get('/home', requireQuickViewSession, getQuickHome);
router.get('/tasks', requireQuickViewSession, getQuickTasks);
router.post('/tasks', requireQuickViewSession, postQuickTask);
router.patch('/tasks/:id/status', requireQuickViewSession, postQuickTaskStatus);
router.get('/calendar/day', requireQuickViewSession, getQuickDayCalendar);
router.get('/office', requireQuickViewSession, getQuickOfficeAvailability);
router.get('/conversations/:id', requireQuickViewSession, getQuickConversation);
router.post('/conversations/:id/reply', requireQuickViewSession, postQuickReply);
router.post('/compose', requireQuickViewSession, postQuickCompose);
router.get('/contacts', requireQuickViewSession, getQuickContacts);
router.post('/contacts', requireQuickViewSession, postQuickContact);

export default router;
