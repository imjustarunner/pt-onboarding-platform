import Appointment from '../models/Appointment.model.js';
import { hasSchedulingBillingAccess, stripSchedulingFinancials } from '../services/schedulingBillingAccess.service.js';
import express from 'express';
import { authenticate, requireActiveStatus } from '../middleware/auth.middleware.js';
import {
  listAppointments,
  getAppointment,
  getAppointmentContext,
  createAppointmentHandler,
  updateAppointmentHandler,
  cancelAppointmentHandler,
  settleAppointmentHandler,
  previewAppointmentChangeHandler,
  completeAppointmentChangeHandler,
  getAppointmentChangeHandler,
  saveAppointmentChangeDraftHandler,
  listAppointmentWaiversHandler,
  decideAppointmentWaiverHandler
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
router.get('/waiver-reviews', listAppointmentWaiversHandler);

// Timeline, reminders and change previews share the same financial boundary as the appointment.
router.use('/:id', async (req, res, next) => {
  try {
    const appointment = await Appointment.findById(Number(req.params.id));
    if (appointment && !(await hasSchedulingBillingAccess(req.user, appointment.agencyId))) {
      const json = res.json.bind(res);
      res.json = (body) => json(stripSchedulingFinancials(body));
    }
    next();
  } catch (error) { next(error); }
});

router.get('/', listAppointments);
router.post('/', createAppointmentHandler);
router.get('/:id', getAppointment);
router.post('/:id/context', getAppointmentContext);
router.patch('/:id', updateAppointmentHandler);
router.post('/:id/cancel', cancelAppointmentHandler);
router.post('/:id/settle', settleAppointmentHandler);
router.post('/:id/change/waiver-decision', decideAppointmentWaiverHandler);
router.get('/:id/change', getAppointmentChangeHandler);
router.put('/:id/change/draft', saveAppointmentChangeDraftHandler);
router.post('/:id/change/preview', previewAppointmentChangeHandler);
router.post('/:id/change/complete', completeAppointmentChangeHandler);
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
