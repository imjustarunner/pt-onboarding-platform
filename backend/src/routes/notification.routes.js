import express from 'express';
import {
  getNotifications,
  getNotificationCounts,
  markAsRead,
  markAsResolved,
  markAllAsRead,
  markAllAsResolved,
  getSupervisorNotifications,
  syncNotifications,
  deleteNotification
} from '../controllers/notification.controller.js';
import { getMySmsLogs, getSmsLogs } from '../controllers/notificationSmsLog.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get notifications with optional filters
router.get('/', getNotifications);

// Get notification counts per agency
router.get('/counts', getNotificationCounts);

// SMS logs for notification-dispatched texts
router.get('/sms-logs/me', getMySmsLogs);
router.get('/sms-logs', getSmsLogs);

// Get supervisor-specific notifications
router.get('/supervisor', getSupervisorNotifications);

// Sync/generate notifications (admin/super_admin only)
router.post('/sync', syncNotifications);

// Mark notification as read
router.put('/:id/read', markAsRead);

// Mark notification as resolved
router.put('/:id/resolved', markAsResolved);

// Mark all notifications as read for an agency
router.put('/read-all', markAllAsRead);

// Mark all notifications as resolved for an agency
router.put('/resolve-all', markAllAsResolved);

// Delete notification (permanently removes it)
router.delete('/:id', deleteNotification);

export default router;
