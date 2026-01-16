import express from 'express';
import { authenticate, requireAgencyAdmin } from '../middleware/auth.middleware.js';
import {
  bulkClientUpload,
  listBulkClientUploadJobs,
  getBulkClientUploadJob,
  listBulkClientUploadJobRows
} from '../controllers/bulkClientUpload.controller.js';

const router = express.Router();

const requireAdminOrSuperAdminOnly = (req, res, next) => {
  if (!['admin', 'super_admin'].includes(req.user?.role)) {
    return res.status(403).json({ error: { message: 'Admin access required' } });
  }
  next();
};

// POST /api/bulk-client-upload (multipart/form-data: file, agencyId)
router.post('/', authenticate, requireAgencyAdmin, requireAdminOrSuperAdminOnly, bulkClientUpload);

// Jobs + results
router.get('/jobs', authenticate, requireAgencyAdmin, requireAdminOrSuperAdminOnly, listBulkClientUploadJobs);
router.get('/jobs/:jobId', authenticate, requireAgencyAdmin, requireAdminOrSuperAdminOnly, getBulkClientUploadJob);
router.get('/jobs/:jobId/rows', authenticate, requireAgencyAdmin, requireAdminOrSuperAdminOnly, listBulkClientUploadJobRows);

export default router;

