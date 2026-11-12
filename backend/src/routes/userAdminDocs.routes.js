import express from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  listUserAdminDocs,
  createUserAdminDocNote,
  createUserAdminDocUpload,
  viewUserAdminDoc,
  deleteUserAdminDoc,
  restoreUserAdminDoc,
  setUserAdminDocLegalHold,
  releaseUserAdminDocLegalHold,
  createAdminDocAccessRequest,
  listAdminDocAccessRequests,
  approveAdminDocAccessRequest,
  denyAdminDocAccessRequest,
  listAdminDocAccessGrants,
  revokeAdminDocAccessGrant
} from '../controllers/userAdminDocs.controller.js';

const router = express.Router();

// Authenticate only matched routes: this router is mounted at /api.

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (req, file, cb) => {
    // Allow common doc types; stored in GCS and served via signed URL.
    const okTypes = new Set([
      'application/pdf',
      'text/plain',
      'image/png',
      'image/jpeg',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]);
    if (okTypes.has(file.mimetype)) return cb(null, true);
    return cb(new Error('Unsupported file type'), false);
  }
});

router.get('/users/:userId/admin-docs', authenticate, listUserAdminDocs);
router.post('/users/:userId/admin-docs', authenticate, createUserAdminDocNote);
router.post('/users/:userId/admin-docs/upload', authenticate, upload.single('file'), createUserAdminDocUpload);
router.get('/users/:userId/admin-docs/:docId/view', authenticate, viewUserAdminDoc);
router.delete('/users/:userId/admin-docs/:docId', authenticate, deleteUserAdminDoc);
router.post('/users/:userId/admin-docs/:docId/restore', authenticate, restoreUserAdminDoc);
router.post('/users/:userId/admin-docs/:docId/legal-hold', authenticate, setUserAdminDocLegalHold);
router.post('/users/:userId/admin-docs/:docId/legal-hold/release', authenticate, releaseUserAdminDocLegalHold);

router.post('/users/:userId/admin-docs/access-requests', authenticate, createAdminDocAccessRequest);
router.get('/users/:userId/admin-docs/access-requests', authenticate, listAdminDocAccessRequests);
router.post('/users/:userId/admin-docs/access-requests/:requestId/approve', authenticate, approveAdminDocAccessRequest);
router.post('/users/:userId/admin-docs/access-requests/:requestId/deny', authenticate, denyAdminDocAccessRequest);

router.get('/users/:userId/admin-docs/access-grants', authenticate, listAdminDocAccessGrants);
router.post('/users/:userId/admin-docs/access-grants/:grantId/revoke', authenticate, revokeAdminDocAccessGrant);

export default router;

