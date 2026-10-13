import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { getMyEventParticipation, checkInToMyEvent, checkOutOfMyEvent, getMyEventTravelContext } from '../controllers/companyEventParticipation.controller.js';

const router = express.Router();
router.use(authenticate);
router.get('/:eventId/participation', getMyEventParticipation);
router.post('/:eventId/check-in', checkInToMyEvent);
router.post('/:eventId/check-out', checkOutOfMyEvent);
router.post('/:eventId/travel-context', getMyEventTravelContext);
export default router;
