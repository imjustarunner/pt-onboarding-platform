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
  postQuickTaskStatus
} from '../controllers/quickView.controller.js';

const router = express.Router();

// Authenticated: Account Info → Privacy credential management
router.get('/me/status', authenticate, getMyQuickViewStatus);
router.post('/me/regenerate-token', authenticate, postRegenerateToken);
router.post('/me/reset-passcode', authenticate, postResetPasscode);
router.post('/me/reveal-token', authenticate, postRevealToken);

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
router.patch('/tasks/:id/status', requireQuickViewSession, postQuickTaskStatus);
router.get('/calendar/day', requireQuickViewSession, getQuickDayCalendar);
router.get('/office', requireQuickViewSession, getQuickOfficeAvailability);
router.get('/conversations/:id', requireQuickViewSession, getQuickConversation);
router.post('/conversations/:id/reply', requireQuickViewSession, postQuickReply);
router.get('/contacts', requireQuickViewSession, getQuickContacts);

export default router;
