import express from 'express';
import { authenticate, requireCapability } from '../middleware/auth.middleware.js';
import {
  listMilestones,
  syncFromStartDates,
  updateMilestone, saveGift, listNotes, addNote, createDinner, updateAttendance, recordDinnerOffer
} from '../controllers/employeeRelations.controller.js';

const router = express.Router();

router.use(authenticate, requireCapability('canManageHiring'));

router.get('/', listMilestones);
router.post('/sync-from-start-dates', syncFromStartDates);
router.put('/gifts/:years', saveGift);
router.post('/dinners', createDinner);
router.patch('/dinners/:dinnerId/attendees/:id', updateAttendance);
router.get('/:id/notes', listNotes);
router.post('/:id/notes', addNote);
router.post('/:id/dinner-offers', recordDinnerOffer);
router.patch('/:id', updateMilestone);

export default router;
