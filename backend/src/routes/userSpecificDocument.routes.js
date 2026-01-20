import express from 'express';
import {
  createUserSpecificDocument,
  getUserSpecificDocument,
  getUserSpecificDocuments,
  updateUserSpecificDocument,
  deleteUserSpecificDocument,
  upload
} from '../controllers/userSpecificDocument.controller.js';
import { authenticate, requireBackofficeAdmin } from '../middleware/auth.middleware.js';

const router = express.Router();

// All routes require authentication and admin access
router.use(authenticate);
router.use(requireBackofficeAdmin);

router.post('/upload', upload.single('file'), createUserSpecificDocument);
router.post('/', createUserSpecificDocument); // For HTML content
router.get('/user/:userId', getUserSpecificDocuments);
router.get('/:id', getUserSpecificDocument);
router.put('/:id', upload.single('file'), updateUserSpecificDocument);
router.delete('/:id', deleteUserSpecificDocument);

export default router;

