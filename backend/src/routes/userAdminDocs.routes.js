import express from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  listUserAdminDocs,
  createUserAdminDocNote,
  createUserAdminDocUpload,
  viewUserAdminDoc,
  createAdminDocAccessRequest,
  listAdminDocAccessRequests,
  approveAdminDocAccessRequest,
  denyAdminDocAccessRequest,
  listAdminDocAccessGrants,
  revokeAdminDocAccessGrant
} from '../controllers/userAdminDocs.controller.js';

const router = express.Router();

router.use(authenticate);

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

router.get('/users/:userId/admin-docs', listUserAdminDocs);
router.post('/users/:userId/admin-docs', createUserAdminDocNote);
router.post('/users/:userId/admin-docs/upload', upload.single('file'), createUserAdminDocUpload);
router.get('/users/:userId/admin-docs/:docId/view', viewUserAdminDoc);

router.post('/users/:userId/admin-docs/access-requests', createAdminDocAccessRequest);
router.get('/users/:userId/admin-docs/access-requests', listAdminDocAccessRequests);
router.post('/users/:userId/admin-docs/access-requests/:requestId/approve', approveAdminDocAccessRequest);
router.post('/users/:userId/admin-docs/access-requests/:requestId/deny', denyAdminDocAccessRequest);

router.get('/users/:userId/admin-docs/access-grants', listAdminDocAccessGrants);
router.post('/users/:userId/admin-docs/access-grants/:grantId/revoke', revokeAdminDocAccessGrant);

export default router;

