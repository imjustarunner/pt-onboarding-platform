import express from 'express';
import { bulkImportClients } from '../controllers/bulkImport.controller.js';
import { authenticate, requireBackofficeAdmin } from '../middleware/auth.middleware.js';

const router = express.Router();

// Bulk import routes (admin only)
// POST /api/bulk-import/clients
router.post('/clients', authenticate, requireBackofficeAdmin, bulkImportClients);

export default router;
