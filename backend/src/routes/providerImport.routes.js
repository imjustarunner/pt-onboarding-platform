import express from 'express';
import { body } from 'express-validator';
import { authenticate, requireBackofficeAdmin } from '../middleware/auth.middleware.js';
import { previewProviderImport, applyProviderImport, bulkCreateProvidersFromSchoolList, bulkUpdateProviderEmails, importEmployeeInfo, importKvPaste } from '../controllers/providerImport.controller.js';

const router = express.Router();

router.use(authenticate, requireBackofficeAdmin);

router.post('/preview', previewProviderImport);
// NOTE: This endpoint is multipart/form-data. Multer runs inside the controller middleware,
// so express-validator would execute before multer and may see an empty req.body.
// The controller performs manual validation instead.
router.post('/apply', applyProviderImport);

// Bulk create/update providers from in-school provider list (CSV/XLSX)
// NOTE: This endpoint is multipart/form-data. Multer runs inside the controller middleware,
// so we cannot validate agencyId with express-validator here (body parsers won't read multipart).
// The controller performs manual validation instead.
router.post('/bulk-create', bulkCreateProvidersFromSchoolList);
router.post('/email-update', bulkUpdateProviderEmails);
router.post('/employee-info', importEmployeeInfo);
router.post(
  '/kv-paste',
  [
    body('agencyId').isInt({ min: 1 }),
    body('userId').optional().isInt({ min: 1 }),
    body('personalEmail').optional().isString().isLength({ min: 3, max: 255 }),
    body('kvText').isString().isLength({ min: 1, max: 20000 })
  ],
  importKvPaste
);

export default router;

