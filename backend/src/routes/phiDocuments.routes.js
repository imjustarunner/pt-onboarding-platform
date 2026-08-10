import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  listClientPhiDocuments,
  listClientIntakeResponses,
  listClientPhiDocumentAudit,
  markPhiDocumentExported,
  removePhiDocument,
  viewPhiDocument,
  uploadClientPhiDocument
} from '../controllers/phiDocuments.controller.js';
import {
  listClientSignedSchoolPackets,
  getClientSignedSchoolPacket
} from '../controllers/agencySchoolIntakeMaster.controller.js';

const router = express.Router();

// List PHI docs for a client
router.get('/clients/:clientId', authenticate, listClientPhiDocuments);
router.get('/clients/:clientId/audit', authenticate, listClientPhiDocumentAudit);
router.get('/clients/:clientId/intake-responses', authenticate, listClientIntakeResponses);
router.get('/clients/:clientId/signed-school-packets', authenticate, listClientSignedSchoolPackets);
router.get('/signed-school-packets/:packetId', authenticate, getClientSignedSchoolPacket);

// Upload a PHI doc for a client (authenticated)
router.post('/clients/:clientId/upload', authenticate, uploadClientPhiDocument);

// Get signed URL to view a PHI doc (also logs access)
router.get('/:docId/view', authenticate, viewPhiDocument);
router.post('/:docId/export', authenticate, markPhiDocumentExported);
router.delete('/:docId', authenticate, removePhiDocument);

export default router;

