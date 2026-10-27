import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { getMyEventParticipation, checkInToMyEvent, checkOutOfMyEvent } from '../controllers/companyEventParticipation.controller.js';
import { getMyEventTravelOptions, previewMyEventTravelReport, submitMyEventTravelReport } from '../controllers/eventTravelReport.controller.js';

const router = express.Router();
router.use(authenticate);
router.get('/travel-options', getMyEventTravelOptions);
router.post('/:eventId/travel-report/preview', previewMyEventTravelReport);
router.post('/:eventId/travel-report', submitMyEventTravelReport);
router.get('/:eventId/participation', getMyEventParticipation);
router.post('/:eventId/check-in', checkInToMyEvent);
router.post('/:eventId/check-out', checkOutOfMyEvent);
router.post('/:eventId/travel-context', (_req, res) => res.status(410).json({ error: { message: 'Use Submit → Event travel reimbursement to report your trips.' } }));
export default router;
