import express from 'express';
import {
  createUserSpecificDocument,
  getUserSpecificDocument,
  getUserSpecificDocuments,
  updateUserSpecificDocument,
  deleteUserSpecificDocument,
  upload
} from '../controllers/userSpecificDocument.controller.js';
import { authenticate, requireAdmin, requireBackofficeAdmin } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(authenticate);

// Create (upload): allow admin/support/super_admin or supervisors (controller enforces supervisee access for supervisors)
router.post('/upload', requireAdmin, upload.single('file'), createUserSpecificDocument);
router.post('/', requireAdmin, createUserSpecificDocument); // For HTML content

// Read/update/delete: backoffice admin only
router.get('/user/:userId', requireBackofficeAdmin, getUserSpecificDocuments);
router.get('/:id', requireBackofficeAdmin, getUserSpecificDocument);
router.put('/:id', requireBackofficeAdmin, upload.single('file'), updateUserSpecificDocument);
router.delete('/:id', requireBackofficeAdmin, deleteUserSpecificDocument);

export default router;

