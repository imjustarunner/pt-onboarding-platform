import express from 'express';
import {
  bulkImportClients,
  listClientsOneTimePreviewJobs,
  rollbackClientsOneTimeJob
} from '../controllers/bulkImport.controller.js';
import { authenticate, requireBackofficeAdmin } from '../middleware/auth.middleware.js';

const router = express.Router();

// Bulk import routes (admin only)
// POST /api/bulk-import/clients
router.post('/clients', authenticate, requireBackofficeAdmin, bulkImportClients);

// One-time clients import preview jobs
router.get('/jobs/clients-one-time/previews', authenticate, requireBackofficeAdmin, listClientsOneTimePreviewJobs);
router.post('/jobs/:jobId/rollback', authenticate, requireBackofficeAdmin, rollbackClientsOneTimeJob);

export default router;
