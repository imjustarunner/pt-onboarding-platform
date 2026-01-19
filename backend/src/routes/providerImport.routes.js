import express from 'express';
import { body } from 'express-validator';
import { authenticate, requireSuperAdmin } from '../middleware/auth.middleware.js';
import { previewProviderImport, applyProviderImport, bulkCreateProvidersFromSchoolList, bulkUpdateProviderEmails } from '../controllers/providerImport.controller.js';

const router = express.Router();

router.use(authenticate, requireSuperAdmin);

router.post('/preview', previewProviderImport);
router.post(
  '/apply',
  [
    body('agencyId').isInt({ min: 1 }),
    body('matchEmailColumn').isString().isLength({ min: 1, max: 255 }),
    body('mapping').optional(),
    body('dryRun').optional()
  ],
  applyProviderImport
);

// Bulk create/update providers from in-school provider list (CSV/XLSX)
// NOTE: This endpoint is multipart/form-data. Multer runs inside the controller middleware,
// so we cannot validate agencyId with express-validator here (body parsers won't read multipart).
// The controller performs manual validation instead.
router.post('/bulk-create', bulkCreateProvidersFromSchoolList);
router.post('/email-update', bulkUpdateProviderEmails);

export default router;

