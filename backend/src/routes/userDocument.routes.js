import express from 'express';
import {
  generateUserDocument,
  getUserDocument,
  getUserDocuments,
  regenerateUserDocument
} from '../controllers/userDocument.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

router.post('/generate', generateUserDocument);
router.get('/user/:userId', getUserDocuments);
router.get('/:id', getUserDocument);
router.post('/:id/regenerate', regenerateUserDocument);

export default router;

