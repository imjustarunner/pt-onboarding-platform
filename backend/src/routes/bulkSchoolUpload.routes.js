import express from 'express';
import { authenticate, requireAgencyAdmin } from '../middleware/auth.middleware.js';
import {
  bulkSchoolUpload,
  listBulkSchoolUploadJobs,
  getBulkSchoolUploadJob,
  listBulkSchoolUploadJobRows
} from '../controllers/bulkSchoolUpload.controller.js';

const router = express.Router();

const requireAdminOrSuperAdminOnly = (req, res, next) => {
  if (!['admin', 'super_admin'].includes(req.user?.role)) {
    return res.status(403).json({ error: { message: 'Admin access required' } });
  }
  next();
};

// POST /api/bulk-school-upload (multipart/form-data: file, agencyId)
router.post('/', authenticate, requireAgencyAdmin, requireAdminOrSuperAdminOnly, bulkSchoolUpload);

// Jobs + results (school import only)
router.get('/jobs', authenticate, requireAgencyAdmin, requireAdminOrSuperAdminOnly, listBulkSchoolUploadJobs);
router.get('/jobs/:jobId', authenticate, requireAgencyAdmin, requireAdminOrSuperAdminOnly, getBulkSchoolUploadJob);
router.get('/jobs/:jobId/rows', authenticate, requireAgencyAdmin, requireAdminOrSuperAdminOnly, listBulkSchoolUploadJobRows);

export default router;

