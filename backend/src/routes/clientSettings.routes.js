import express from 'express';
import { body } from 'express-validator';
import { authenticate, requireAgencyAccess, requireAgencyAdmin } from '../middleware/auth.middleware.js';
import {
  listClientStatuses,
  upsertClientStatus,
  listPaperworkStatuses,
  upsertPaperworkStatus,
  listInsuranceTypes,
  upsertInsuranceType,
  listLanguageOptions,
  createLanguageOption
} from '../controllers/clientSettings.controller.js';

const router = express.Router();

// Read-only lists should be available to agency members (including providers) for workflows like client creation.
// Writes remain admin-only.
router.get('/client-statuses', authenticate, requireAgencyAccess, listClientStatuses);
router.post(
  '/client-statuses',
  authenticate,
  requireAgencyAdmin,
  [
    body('statusKey').isString().isLength({ min: 1, max: 64 }),
    body('label').isString().isLength({ min: 1, max: 255 }),
    body('description').optional({ nullable: true }).isString(),
    body('isActive').optional()
  ],
  upsertClientStatus
);
router.put(
  '/client-statuses/:id',
  authenticate,
  requireAgencyAdmin,
  [
    body('statusKey').isString().isLength({ min: 1, max: 64 }),
    body('label').isString().isLength({ min: 1, max: 255 }),
    body('description').optional({ nullable: true }).isString(),
    body('isActive').optional()
  ],
  (req, res, next) => {
    req.body.id = req.params.id;
    next();
  },
  upsertClientStatus
);

router.get('/paperwork-statuses', authenticate, requireAgencyAccess, listPaperworkStatuses);
router.post(
  '/paperwork-statuses',
  authenticate,
  requireAgencyAdmin,
  [
    body('statusKey').isString().isLength({ min: 1, max: 64 }),
    body('label').isString().isLength({ min: 1, max: 255 }),
    body('description').optional({ nullable: true }).isString(),
    body('isActive').optional()
  ],
  upsertPaperworkStatus
);
router.put(
  '/paperwork-statuses/:id',
  authenticate,
  requireAgencyAdmin,
  [
    body('statusKey').isString().isLength({ min: 1, max: 64 }),
    body('label').isString().isLength({ min: 1, max: 255 }),
    body('description').optional({ nullable: true }).isString(),
    body('isActive').optional()
  ],
  (req, res, next) => {
    req.body.id = req.params.id;
    next();
  },
  upsertPaperworkStatus
);

router.get('/insurance-types', authenticate, requireAgencyAccess, listInsuranceTypes);
router.post(
  '/insurance-types',
  authenticate,
  requireAgencyAdmin,
  [
    body('insuranceKey').isString().isLength({ min: 1, max: 64 }),
    body('label').isString().isLength({ min: 1, max: 255 }),
    body('isActive').optional()
  ],
  upsertInsuranceType
);
router.put(
  '/insurance-types/:id',
  authenticate,
  requireAgencyAdmin,
  [
    body('insuranceKey').isString().isLength({ min: 1, max: 64 }),
    body('label').isString().isLength({ min: 1, max: 255 }),
    body('isActive').optional()
  ],
  (req, res, next) => {
    req.body.id = req.params.id;
    next();
  },
  upsertInsuranceType
);

// Languages (global catalog; used for client/guardian primary language dropdowns)
router.get('/languages', authenticate, listLanguageOptions);
router.post(
  '/languages',
  authenticate,
  [body('label').isString().isLength({ min: 1, max: 128 })],
  createLanguageOption
);

export default router;

