import express from 'express';
import {
  generateUserDocument,
  getUserDocument,
  getUserDocuments,
  previewUserDocument,
  regenerateUserDocument
} from '../controllers/userDocument.controller.js';
import { authenticate, requireCapability } from '../middleware/auth.middleware.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate, requireCapability('canSignDocuments'));

router.post('/generate', generateUserDocument);
router.get('/user/:userId', getUserDocuments);
router.get('/:id/preview', previewUserDocument);
router.get('/:id', getUserDocument);
router.post('/:id/regenerate', regenerateUserDocument);

export default router;

