import express from 'express';
import { body } from 'express-validator';
import { authenticate, requireAgencyAdmin } from '../middleware/auth.middleware.js';
import {
  listClientStatuses,
  upsertClientStatus,
  listPaperworkStatuses,
  upsertPaperworkStatus,
  listInsuranceTypes,
  upsertInsuranceType
} from '../controllers/clientSettings.controller.js';

const router = express.Router();

router.get('/client-statuses', authenticate, requireAgencyAdmin, listClientStatuses);
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

router.get('/paperwork-statuses', authenticate, requireAgencyAdmin, listPaperworkStatuses);
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

router.get('/insurance-types', authenticate, requireAgencyAdmin, listInsuranceTypes);
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

export default router;

