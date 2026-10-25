import { excludeSupportSettings } from '../middleware/supportContentAccess.middleware.js';
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
  createLanguageOption,
  getPacketOcrConfig,
  updatePacketOcrConfig
} from '../controllers/clientSettings.controller.js';

const router = express.Router();

// Read-only lists should be available to agency members (including providers) for workflows like client creation.
// Writes remain admin-only.
router.get('/client-statuses', authenticate, requireAgencyAccess, listClientStatuses);
router.post(
  '/client-statuses',
  authenticate, excludeSupportSettings,
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
  authenticate, excludeSupportSettings,
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
  authenticate, excludeSupportSettings,
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
  authenticate, excludeSupportSettings,
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
  authenticate, excludeSupportSettings,
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
  authenticate, excludeSupportSettings,
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
  authenticate, excludeSupportSettings,
  [body('label').isString().isLength({ min: 1, max: 128 })],
  createLanguageOption
);

// Packet OCR configuration (agency-scoped)
router.get('/packet-ocr-config', authenticate, requireAgencyAccess, getPacketOcrConfig);
router.put(
  '/packet-ocr-config',
  authenticate, excludeSupportSettings,
  requireAgencyAdmin,
  [
    body('questions').optional().isArray(),
    body('ignore').optional().isArray(),
    body('languageHint').optional().isString()
  ],
  updatePacketOcrConfig
);

export default router;

