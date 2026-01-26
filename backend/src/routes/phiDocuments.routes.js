import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { listClientPhiDocuments, viewPhiDocument, uploadClientPhiDocument } from '../controllers/phiDocuments.controller.js';

const router = express.Router();

// List PHI docs for a client
router.get('/clients/:clientId', authenticate, listClientPhiDocuments);

// Upload a PHI doc for a client (authenticated)
router.post('/clients/:clientId/upload', authenticate, uploadClientPhiDocument);

// Get signed URL to view a PHI doc (also logs access)
router.get('/:docId/view', authenticate, viewPhiDocument);

export default router;

