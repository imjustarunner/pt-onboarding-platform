import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  upload,
  listMyComplianceDocuments,
  getMyComplianceStatus,
  createComplianceDocument,
  updateComplianceDocument,
  deleteComplianceDocument
} from '../controllers/userComplianceDocument.controller.js';

const router = express.Router();

router.get('/me', authenticate, listMyComplianceDocuments);
router.get('/me/compliance-status', authenticate, getMyComplianceStatus);

router.post('/', authenticate, upload.single('file'), createComplianceDocument);
router.put('/:id', authenticate, upload.single('file'), updateComplianceDocument);
router.delete('/:id', authenticate, deleteComplianceDocument);

export default router;

