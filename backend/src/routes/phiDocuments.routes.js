import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { listClientPhiDocuments, viewPhiDocument } from '../controllers/phiDocuments.controller.js';

const router = express.Router();

// List PHI docs for a client
router.get('/clients/:clientId', authenticate, listClientPhiDocuments);

// Get signed URL to view a PHI doc (also logs access)
router.get('/:docId/view', authenticate, viewPhiDocument);

export default router;

