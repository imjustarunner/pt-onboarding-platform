import express from 'express';
import {
  bulkImportClients,
  bulkImportClientsOneTime,
  bulkImportClientsOneTimePreview,
  listClientsOneTimePreviewJobs,
  applyBulkImportJobRow,
  applyBulkImportJobAll,
  rollbackBulkImportJob
} from '../controllers/bulkImport.controller.js';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';

const router = express.Router();

// Bulk import routes (admin only)
// POST /api/bulk-import/clients
router.post('/clients', authenticate, requireAdmin, bulkImportClients);

// One-time bulk import routes (admin only)
// POST /api/bulk-import/clients-one-time
router.post('/clients-one-time', authenticate, requireAdmin, bulkImportClientsOneTime);

// Preview (no writes)
router.post('/clients-one-time/preview', authenticate, requireAdmin, bulkImportClientsOneTimePreview);

// Recent preview jobs list
router.get('/jobs/clients-one-time/previews', authenticate, requireAdmin, listClientsOneTimePreviewJobs);

// Approve/apply preview jobs
router.post('/jobs/:jobId/rows/:rowId/apply', authenticate, requireAdmin, applyBulkImportJobRow);
router.post('/jobs/:jobId/apply', authenticate, requireAdmin, applyBulkImportJobAll);

// Rollback applied rows (best-effort undo)
router.post('/jobs/:jobId/rollback', authenticate, requireAdmin, rollbackBulkImportJob);

export default router;
