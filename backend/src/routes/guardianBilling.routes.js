import express from 'express';
import { authenticate, requireActiveStatus } from '../middleware/auth.middleware.js';
import {
  listGuardianPaymentCards,
  removeGuardianPaymentCard,
  listGuardianInsurance,
  getBillingOverview, acceptBillingResponsibility, assignBillingCard, revokeBillingRecurring, saveBillingInsurance, createPortalCardSetup, completePortalCardSetup,
  getDependentsSummary
} from '../controllers/guardianBilling.controller.js';

const router = express.Router();

router.use(authenticate, requireActiveStatus, (req,res,next)=>{res.set('Cache-Control','no-store');next();});

router.get('/overview', getBillingOverview);
router.post('/clients/:clientId/responsibility', acceptBillingResponsibility);
router.post('/clients/:clientId/payment-method', assignBillingCard);
router.delete('/clients/:clientId/recurring', revokeBillingRecurring);
router.post('/insurance', saveBillingInsurance);
router.post('/card-setup', createPortalCardSetup);
router.post('/card-setup/complete', completePortalCardSetup);

router.get('/payment-cards', listGuardianPaymentCards);
router.delete('/payment-cards/:cardId', removeGuardianPaymentCard);
router.get('/insurance', listGuardianInsurance);
router.get('/dependents-summary', getDependentsSummary);

export default router;
