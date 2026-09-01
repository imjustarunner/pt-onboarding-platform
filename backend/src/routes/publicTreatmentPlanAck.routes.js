import express from 'express';
import { body, param } from 'express-validator';
import {
  getPublicTreatmentPlanAck,
  viewPublicTreatmentPlanAck,
  signPublicTreatmentPlanAck
} from '../controllers/treatmentPlanAck.controller.js';

const router = express.Router();

router.get(
  '/:publicKey',
  [param('publicKey').isString().isLength({ min: 16, max: 128 })],
  getPublicTreatmentPlanAck
);

router.post(
  '/:publicKey/viewed',
  [param('publicKey').isString().isLength({ min: 16, max: 128 })],
  viewPublicTreatmentPlanAck
);

router.post(
  '/:publicKey/sign',
  [
    param('publicKey').isString().isLength({ min: 16, max: 128 }),
    body('signedByName').optional().isString(),
    body('name').optional().isString(),
    body('signatureDataUrl').optional().isString(),
    body('signature').optional().isString()
  ],
  signPublicTreatmentPlanAck
);

export default router;
