import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  setBookingPlan,
  setAssignmentRecurrence,
  keepAvailable,
  setTemporary,
  forfeitAssignment,
  staffBookEvent,
  setEventBookingPlan,
  setEventRecurrence,
  setEventVirtualIntakeAvailability,
  setEventInPersonIntakeAvailability,
  forfeitEvent,
  cancelEvent,
  cancelAssignment,
  staffAssignOpenSlot
} from '../controllers/officeSlotActions.controller.js';

const router = express.Router();

router.use(authenticate);

router.post('/:officeId/assignments/:assignmentId/booking-plan', setBookingPlan);
router.post('/:officeId/assignments/:assignmentId/recurrence', setAssignmentRecurrence);
router.post('/:officeId/events/:eventId/booking-plan', setEventBookingPlan);
router.post('/:officeId/events/:eventId/recurrence', setEventRecurrence);
router.post('/:officeId/assignments/:assignmentId/keep-available', keepAvailable);
router.post('/:officeId/assignments/:assignmentId/temporary', setTemporary);
router.post('/:officeId/assignments/:assignmentId/forfeit', forfeitAssignment);
router.post('/:officeId/events/:eventId/book', staffBookEvent);
router.post('/:officeId/events/:eventId/virtual-intake', setEventVirtualIntakeAvailability);
router.post('/:officeId/events/:eventId/in-person-intake', setEventInPersonIntakeAvailability);
router.post('/:officeId/events/:eventId/forfeit', forfeitEvent);
router.post('/:officeId/events/:eventId/cancel', cancelEvent);
router.post('/:officeId/assignments/:assignmentId/cancel', cancelAssignment);
router.post('/:officeId/open-slots/assign', staffAssignOpenSlot);

export default router;

