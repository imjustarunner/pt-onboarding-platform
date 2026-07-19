import express from 'express';
import { authenticate, requireActiveStatus } from '../middleware/auth.middleware.js';
import {
  listAppointments,
  getAppointment,
  createAppointmentHandler,
  updateAppointmentHandler,
  cancelAppointmentHandler
} from '../controllers/appointment.controller.js';
import {
  evaluateAppointmentCancel,
  getAppointmentTimeline,
  rescheduleAppointmentReminders,
  ingestAppointmentReply
} from '../controllers/bookingPolicies.controller.js';
import {
  getAppointmentNotificationPlan,
  rescheduleSessionNotifications,
  previewAppointmentPushUpdate,
  pushAppointmentUpdate,
  getPendingAppointmentUpdate,
  patchPendingAppointmentUpdate
} from '../controllers/sessionNotification.controller.js';

const router = express.Router();

router.use(authenticate, requireActiveStatus);

router.get('/', listAppointments);
router.post('/', createAppointmentHandler);
router.get('/:id', getAppointment);
router.patch('/:id', updateAppointmentHandler);
router.post('/:id/cancel', cancelAppointmentHandler);
router.post('/:id/evaluate-cancel', evaluateAppointmentCancel);
router.get('/:id/timeline', getAppointmentTimeline);
router.post('/:id/reminders/reschedule', rescheduleAppointmentReminders);
router.post('/:id/session-notifications/reschedule', rescheduleSessionNotifications);
router.get('/:id/notification-plan', getAppointmentNotificationPlan);
router.post('/:id/replies', ingestAppointmentReply);
router.post('/:id/push-update/preview', previewAppointmentPushUpdate);
router.post('/:id/push-update', pushAppointmentUpdate);
router.get('/:id/pending-update', getPendingAppointmentUpdate);
router.patch('/:id/pending-update', patchPendingAppointmentUpdate);

export default router;
