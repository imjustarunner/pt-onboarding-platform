import { withOfficeDecisionLock } from '../services/officeApprovalWorkflow.service.js';
import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { requirePhysicalOffice } from '../middleware/physicalOffice.middleware.js';
import {
  setBookingPlan,
  setAssignmentRecurrence,
  keepAvailable,
  snoozeStandingReview,
  downgradeStandingAssignment,
  setTemporary,
  extendTemporary,
  forfeitAssignment,
  staffBookEvent,
  setEventBookingPlan,
  setEventRecurrence,
  setEventVirtualIntakeAvailability,
  setEventInPersonIntakeAvailability,
  setEventOutcome,
  getEventContext,
  forfeitEvent,
  cancelEvent,
  deleteEventFromGoogleNow,
  superAdminPurgeFutureBookedSlot,
  cancelAssignment,
  rescheduleStandingAssignment,
  rescheduleOfficeEvent,
  staffAssignOpenSlot
} from '../controllers/officeSlotActions.controller.js';

const router = express.Router();
const serializeOfficeWrite = handler => async (req,res,next) => {
  try { await withOfficeDecisionLock(() => handler(req,res,error=>{throw error;})); } catch(error) { next(error); }
};

router.use(authenticate);
router.param('officeId', requirePhysicalOffice);

router.post('/:officeId/assignments/:assignmentId/booking-plan', serializeOfficeWrite(setBookingPlan));
router.post('/:officeId/assignments/:assignmentId/recurrence', setAssignmentRecurrence);
router.post('/:officeId/events/:eventId/booking-plan', serializeOfficeWrite(setEventBookingPlan));
router.post('/:officeId/events/:eventId/recurrence', setEventRecurrence);
router.post('/:officeId/assignments/:assignmentId/keep-available', keepAvailable);
router.post('/:officeId/assignments/:assignmentId/snooze-review', snoozeStandingReview);
router.post('/:officeId/assignments/:assignmentId/downgrade', downgradeStandingAssignment);
router.post('/:officeId/assignments/:assignmentId/temporary', setTemporary);
router.post('/:officeId/assignments/:assignmentId/extend-temporary', extendTemporary);
router.post('/:officeId/assignments/:assignmentId/forfeit', forfeitAssignment);
router.post('/:officeId/events/:eventId/book', serializeOfficeWrite(staffBookEvent));
router.post('/:officeId/events/:eventId/reschedule', serializeOfficeWrite(rescheduleOfficeEvent));
router.get('/:officeId/events/:eventId/context', getEventContext);
router.post('/:officeId/events/:eventId/virtual-intake', setEventVirtualIntakeAvailability);
router.post('/:officeId/events/:eventId/in-person-intake', setEventInPersonIntakeAvailability);
router.post('/:officeId/events/:eventId/outcome', setEventOutcome);
router.post('/:officeId/events/:eventId/forfeit', forfeitEvent);
router.post('/:officeId/events/:eventId/cancel', cancelEvent);
router.post('/:officeId/events/:eventId/google-delete-now', deleteEventFromGoogleNow);
router.post('/:officeId/events/:eventId/purge-future-slot', superAdminPurgeFutureBookedSlot);
router.post('/:officeId/assignments/:assignmentId/cancel', cancelAssignment);
router.post('/:officeId/assignments/:assignmentId/reschedule', serializeOfficeWrite(rescheduleStandingAssignment));
router.post('/:officeId/open-slots/assign', serializeOfficeWrite(staffAssignOpenSlot));

export default router;
