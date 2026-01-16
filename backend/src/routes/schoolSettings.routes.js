import express from 'express';
import { body } from 'express-validator';
import { authenticate, requireAgencyAdmin } from '../middleware/auth.middleware.js';
import {
  listPaperworkDeliveryMethods,
  upsertPaperworkDeliveryMethod
} from '../controllers/schoolSettings.controller.js';

const router = express.Router();

router.get('/:schoolId/paperwork-delivery-methods', authenticate, requireAgencyAdmin, listPaperworkDeliveryMethods);
router.post(
  '/:schoolId/paperwork-delivery-methods',
  authenticate,
  requireAgencyAdmin,
  [
    body('methodKey').isString().isLength({ min: 1, max: 64 }),
    body('label').isString().isLength({ min: 1, max: 255 }),
    body('isActive').optional()
  ],
  upsertPaperworkDeliveryMethod
);
router.put(
  '/:schoolId/paperwork-delivery-methods/:id',
  authenticate,
  requireAgencyAdmin,
  [
    body('methodKey').isString().isLength({ min: 1, max: 64 }),
    body('label').isString().isLength({ min: 1, max: 255 }),
    body('isActive').optional()
  ],
  (req, res, next) => {
    req.body.id = req.params.id;
    next();
  },
  upsertPaperworkDeliveryMethod
);

export default router;

