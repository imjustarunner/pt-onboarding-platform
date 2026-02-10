import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  setBookingPlan,
  keepAvailable,
  setTemporary,
  forfeitAssignment,
  staffBookEvent,
  setEventBookingPlan,
  setEventVirtualIntakeAvailability,
  forfeitEvent,
  cancelEvent,
  staffAssignOpenSlot
} from '../controllers/officeSlotActions.controller.js';

const router = express.Router();

router.use(authenticate);

router.post('/:officeId/assignments/:assignmentId/booking-plan', setBookingPlan);
router.post('/:officeId/events/:eventId/booking-plan', setEventBookingPlan);
router.post('/:officeId/assignments/:assignmentId/keep-available', keepAvailable);
router.post('/:officeId/assignments/:assignmentId/temporary', setTemporary);
router.post('/:officeId/assignments/:assignmentId/forfeit', forfeitAssignment);
router.post('/:officeId/events/:eventId/book', staffBookEvent);
router.post('/:officeId/events/:eventId/virtual-intake', setEventVirtualIntakeAvailability);
router.post('/:officeId/events/:eventId/forfeit', forfeitEvent);
router.post('/:officeId/events/:eventId/cancel', cancelEvent);
router.post('/:officeId/open-slots/assign', staffAssignOpenSlot);

export default router;

