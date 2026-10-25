import { fileShareRecipients,setFileShare } from '../services/guardianFileShares.service.js';
import express from 'express';
import { excludeSupportClinicalContent } from '../middleware/supportContentAccess.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  listClientPhiDocuments,
  listClientIntakeResponses,
  listClientChartArtifacts,
  viewClientChartArtifact,
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
// These are completed PHI records and medical attachments. Blank-document and
// questionnaire dispatch use their existing operational routes.
router.use(authenticate, excludeSupportClinicalContent);

// List PHI docs for a client
router.get('/clients/:clientId',  listClientPhiDocuments);
router.get('/clients/:clientId/audit',  listClientPhiDocumentAudit);
router.get('/clients/:clientId/intake-responses',  listClientIntakeResponses);
router.get('/clients/:clientId/chart-artifacts',  listClientChartArtifacts);
router.get('/clients/:clientId/chart-artifacts/:viewKey/view',  viewClientChartArtifact);
router.get('/clients/:clientId/signed-school-packets',  listClientSignedSchoolPackets);
router.get('/signed-school-packets/:packetId',  getClientSignedSchoolPacket);

// Upload a PHI doc for a client (authenticated)
router.post('/clients/:clientId/upload',  uploadClientPhiDocument);

router.get('/:docId/portal-shares',async(req,res,next)=>{try{res.set('Cache-Control','no-store').json(await fileShareRecipients(req.user,Number(req.params.docId)));}catch(e){next(e);}});
router.put('/:docId/portal-shares',async(req,res,next)=>{try{res.json(await setFileShare(req.user,Number(req.params.docId),req.body));}catch(e){next(e);}});

// Get signed URL to view a PHI doc (also logs access)
router.get('/:docId/view',  viewPhiDocument);
router.post('/:docId/export',  markPhiDocumentExported);
router.delete('/:docId',  removePhiDocument);

export default router;
