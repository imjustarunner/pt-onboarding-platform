import express from 'express';
import { receiveClientDocument } from '../middleware/clientDocumentUpload.middleware.js';
import { sessionMaterialAccess } from '../services/sessionSupportingMaterials.service.js';
import { list, recipients, upload, download, share, scan, revoke } from '../controllers/sessionSupportingMaterials.controller.js';
const router = express.Router({ mergeParams: true });
// Scope the session before accepting an in-memory upload.
router.use(async (req, res, next) => { try { await sessionMaterialAccess(req.user, req.params.sessionId, { write: ['POST', 'PUT', 'DELETE'].includes(req.method) }); next(); } catch (error) { next(error); } });
router.get('/', list);
router.get('/recipients', recipients);
router.post('/', receiveClientDocument, upload);
router.get('/:documentId/download', download);
router.put('/:documentId/sharing', share);
router.delete('/:documentId/sharing/:recipientId', revoke);
router.post('/:documentId/scan', scan);
export default router;
