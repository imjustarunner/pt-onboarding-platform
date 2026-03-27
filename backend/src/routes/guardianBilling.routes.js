import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  listGuardianPaymentCards,
  removeGuardianPaymentCard,
  listGuardianInsurance,
  getDependentsSummary
} from '../controllers/guardianBilling.controller.js';

const router = express.Router();

router.use(authenticate);

router.get('/payment-cards', listGuardianPaymentCards);
router.delete('/payment-cards/:cardId', removeGuardianPaymentCard);
router.get('/insurance', listGuardianInsurance);
router.get('/dependents-summary', getDependentsSummary);

export default router;
