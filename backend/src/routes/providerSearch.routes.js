import express from 'express';
import { body } from 'express-validator';
import { authenticate, requireBackofficeAdmin } from '../middleware/auth.middleware.js';
import { rebuildProviderSearchIndex, searchProviders, compileProviderSearch } from '../controllers/providerSearch.controller.js';

const router = express.Router();

router.use(authenticate, requireBackofficeAdmin);

router.post('/rebuild', [body('agencyId').isInt({ min: 1 })], rebuildProviderSearchIndex);

router.post(
  '/search',
  [
    body('agencyId').isInt({ min: 1 }),
    body('filters').optional().isArray(),
    body('filters.*.fieldKey').optional().isString().isLength({ min: 1, max: 191 }),
    body('filters.*.op').optional().isIn(['hasOption', 'textContains', 'equals']),
    body('filters.*.value').optional(),
    body('limit').optional().isInt({ min: 1, max: 200 }),
    body('offset').optional().isInt({ min: 0 }),
    body('textQuery').optional().isString().isLength({ max: 800 })
  ],
  searchProviders
);

router.post(
  '/compile',
  [
    body('agencyId').isInt({ min: 1 }),
    body('queryText').isString().isLength({ min: 1, max: 800 }),
    body('allowedFields').isArray(),
    body('allowedFields.*.fieldKey').isString().isLength({ min: 1, max: 191 }),
    body('allowedFields.*.fieldLabel').optional().isString().isLength({ max: 255 }),
    body('allowedFields.*.fieldType').optional().isString().isLength({ max: 32 }),
    body('allowedFields.*.options').optional()
  ],
  compileProviderSearch
);

export default router;

