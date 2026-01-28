import express from 'express';
import {
  getPublicProviderAvailability,
  createPublicAppointmentRequest
} from '../controllers/publicProviderAvailability.controller.js';

const router = express.Router();

// Public provider availability feed + intake (token via ?key=...).
router.get('/:agencyId/providers/:providerId', getPublicProviderAvailability);
router.post('/:agencyId/requests', createPublicAppointmentRequest);

export default router;

