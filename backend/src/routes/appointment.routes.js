import officeReservations from '../services/appointmentOfficeReservation.service.js';
import {previewProviderAccountConversion,captureProviderAccountConversion,prepareProviderAccountConversion,activateProviderAccountConversion} from '../controllers/providerAccountConversion.controller.js';
import { getClientSessionBookingAccess, getClientSessionBookingRollout, putClientSessionBookingRollout } from '../controllers/clientSessionBookingRollout.controller.js';
import { getAppointmentStaffTools, saveAppointmentStaffAlert, listAppointmentStaffAlerts, openAppointmentLearningWorkspace } from '../controllers/appointmentStaffTools.controller.js';
import Appointment from '../models/Appointment.model.js';
import appointmentStaffTools from '../services/appointmentStaffTools.service.js';
import { resolveAppointmentServiceSetting } from '../services/appointmentServiceSetting.service.js';
import { recordStaffAppointmentConfirmation } from '../services/staffAppointmentConfirmation.service.js';
import { rescheduleContext, rescheduleOptions, rescheduleAppointment } from '../controllers/appointmentReschedule.controller.js';
import { options as replacementOptions, release as releaseReplacementSlot, custom as customReplacementSlot, openingWindow as replacementOpeningWindow, requestOffice as requestReplacementOffice, details as replacementSlotDetails, history as replacementHistory } from '../controllers/appointmentReplacementOffer.controller.js';
import { hasSchedulingBillingAccess, stripSchedulingFinancials } from '../services/schedulingBillingAccess.service.js';
import express from 'express';
import { authenticate, requireActiveStatus } from '../middleware/auth.middleware.js';
import {
  listAppointments,
  assertAppointmentChangeAccess,
  getAppointment,
  getAppointmentContext,
  createAppointmentHandler,
  updateAppointmentHandler,
  cancelAppointmentHandler,
  settleAppointmentHandler,
  getAppointmentSchoolSupportHandler,
  previewAppointmentChangeHandler,
  completeAppointmentChangeHandler,
  retryCancellationNotificationHandler,
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

import * as guardianAppointments from '../controllers/guardianAppointments.controller.js';
import { appointmentCancellationOptions, listAppointmentSeriesCancellations, appointmentSeriesCancellationStatus, retryAppointmentSeriesCancellation } from '../controllers/appointmentSeriesCancellation.controller.js';
const router = express.Router();

router.use(authenticate, requireActiveStatus);
router.use((req,res,next)=>{if(req.method!=='GET'&&['client_guardian','guardian'].includes(req.user?.role))return res.status(403).json({error:{message:'Please request appointment changes through your guardian portal for provider approval.'}});next();});
router.get('/booking-access', getClientSessionBookingAccess);
router.get('/booking-rollout', getClientSessionBookingRollout);
router.put('/booking-rollout', putClientSessionBookingRollout);
router.get('/booking-rollout/providers/:providerUserId/conversion',previewProviderAccountConversion);
router.post('/booking-rollout/providers/:providerUserId/conversion/capture',captureProviderAccountConversion);
router.post('/booking-rollout/providers/:providerUserId/conversion/prepare',prepareProviderAccountConversion);
router.post('/booking-rollout/providers/:providerUserId/conversion/activate',activateProviderAccountConversion);
router.get('/waiver-reviews', listAppointmentWaiversHandler);
router.get('/staff-alerts', listAppointmentStaffAlerts);
router.get('/cancellation-operations', listAppointmentSeriesCancellations);
router.post('/replacement-slots/:slotId/release', releaseReplacementSlot);
router.get('/replacement-slots/:slotId', replacementSlotDetails);

// This endpoint exposes only the authenticated provider's own benefit balance,
// with agency and assignment checks in the handler; client billing redaction does not apply.
router.get('/:id/change/school-support', getAppointmentSchoolSupportHandler);
router.post('/:id/qa-billing-reconcile', async(req,res,next)=>{
  try{
    const appointment=await Appointment.findById(Number(req.params.id));
    const {canSetTutoringSessionPrice}=await import('../services/tutoringSessionPrice.service.js');
    if(!appointment||![453,454].includes(appointment.agencyId)||appointment.businessType!=='tutoring'||!await canSetTutoringSessionPrice(req.user,appointment.agencyId,appointment.providerUserId))return res.status(403).json({error:{message:'Scoped NLU QA pricing access is required.'}});
    const {qaPaymentSimulationConfig}=await import('../services/qaPaymentSimulator.service.js');
    if(!(await qaPaymentSimulationConfig(appointment.agencyId)).enabled)throw Object.assign(new Error('Enable the isolated QA payment simulator for this exact organization before reconciling its test balance.'),{status:409});
    const {syncQaAppointmentBalance}=await import('../services/qaAppointmentBilling.service.js');
    const balance=await syncQaAppointmentBalance(appointment,req.user.id,{repair:true});
    if(!balance)throw Object.assign(new Error('This appointment has no payable tutoring outcome. Check its attendance, package and fee status.'),{status:409});
    res.json({ok:true,balanceId:balance.id,status:balance.status,holdReason:balance.hold_reason||null});
  }catch(error){next(error);}
});

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
router.get('/:id/guardian-requests', guardianAppointments.providerList);
router.post('/:id/guardian-requests/:requestId/decline', guardianAppointments.providerDecline);
router.get('/:id', getAppointment);
router.post('/:id/staff-confirmation', async (req, res, next) => {
  try {
    const appointment = await appointmentStaffTools.authorizeEdit(req.user, Number(req.params.id));
    await assertAppointmentChangeAccess(req, appointment);
    res.set('Cache-Control', 'no-store');
    if (req.body?.clientConfirmedWithStaff !== true) {
      return res.status(400).json({ error: { message: 'Verify that the client confirmed the appointment with you.' } });
    }
    if ((await resolveAppointmentServiceSetting(appointment)).isSchool) {
      return res.status(409).json({ error: { message: 'School visits do not require a family RSVP.' } });
    }
    res.json(await recordStaffAppointmentConfirmation(appointment, req.user.id));
  } catch (error) {
    next(error);
  }
});
router.get('/:id/office-reservations', async (req,res,next) => {
  try { res.set('Cache-Control','no-store'); res.json(await officeReservations.get(req.user,Number(req.params.id))); }
  catch(error) { if(error.status)return res.status(error.status).json({error:{message:error.message}}); next(error); }
});
router.post('/:id/office-reservations/link', async (req,res,next) => {
  try { res.json({ok:true,...await officeReservations.link(req.user,Number(req.params.id),req.body||{})}); }
  catch(error) { if(error.status)return res.status(error.status).json({error:{message:error.message},linkedAppointmentIds:error.linkedAppointmentIds||[]}); next(error); }
});
router.get('/:id/staff-tools', getAppointmentStaffTools);
router.post('/:id/learning-workspace', openAppointmentLearningWorkspace);
router.put('/:id/staff-alert', saveAppointmentStaffAlert);
router.post('/:id/context', getAppointmentContext);
router.patch('/:id', updateAppointmentHandler);
router.get('/:id/reschedule', rescheduleContext);
router.post('/:id/reschedule/options', rescheduleOptions);
router.post('/:id/reschedule', rescheduleAppointment);
router.post('/:id/cancel', cancelAppointmentHandler);
router.post('/:id/settle', settleAppointmentHandler);
router.post('/:id/change/waiver-decision', decideAppointmentWaiverHandler);
router.get('/:id/change', getAppointmentChangeHandler);
router.get('/:id/change/replacement-options', replacementOptions);
router.get('/:id/change/cancellation-options', appointmentCancellationOptions);
router.get('/:id/change/cancellations/:operationId', appointmentSeriesCancellationStatus);
router.post('/:id/change/cancellations/:operationId/retry', retryAppointmentSeriesCancellation);
router.get('/:id/replacement-history', replacementHistory);
router.post('/:id/change/replacement-options/check', customReplacementSlot);
router.post('/:id/change/replacement-options/range', replacementOpeningWindow);
router.post('/:id/change/replacement-options/office-request', requestReplacementOffice);
router.put('/:id/change/draft', saveAppointmentChangeDraftHandler);
router.post('/:id/change/preview', previewAppointmentChangeHandler);
router.post('/:id/change/complete', completeAppointmentChangeHandler);
router.get('/:id/no-show-review',async(req,res,next)=>{try{const appointment=await Appointment.findById(Number(req.params.id));if(!appointment)return res.status(404).json({error:{message:'Appointment not found'}});await assertAppointmentChangeAccess(req,appointment);const {getAppointmentNoShowReview,listAppointmentNoShowHistory}=await import('../services/appointmentNoShowReview.service.js');res.json({review:await getAppointmentNoShowReview(appointment.id),history:await listAppointmentNoShowHistory(appointment.id)});}catch(error){next(error);}});
router.post('/:id/no-show-review/undo',async(req,res,next)=>{try{const appointment=await Appointment.findById(Number(req.params.id));if(!appointment)return res.status(404).json({error:{message:'Appointment not found'}});await assertAppointmentChangeAccess(req,appointment);const {undoAppointmentNoShow}=await import('../services/appointmentNoShowReview.service.js');res.json(await undoAppointmentNoShow(appointment.id,req.user.id,req.body.reason));}catch(error){next(error);}});

router.post('/:id/cancellation-notifications/:deliveryId/retry', retryCancellationNotificationHandler);
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
