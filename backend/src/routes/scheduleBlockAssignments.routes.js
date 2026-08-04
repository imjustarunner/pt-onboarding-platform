import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  listDayBlocks,
  listBlockAssignments,
  addBlockAssignment,
  removeBlockAssignment,
  updateBlockAssignmentNotes
} from '../controllers/scheduleBlockAssignments.controller.js';

const router = express.Router();
router.use(authenticate);

router.get('/day', listDayBlocks);
router.get('/:eventId', listBlockAssignments);
router.post('/:eventId', addBlockAssignment);
router.patch('/:eventId/:assignmentId', updateBlockAssignmentNotes);
router.delete('/:eventId/:assignmentId', removeBlockAssignment);

export default router;
