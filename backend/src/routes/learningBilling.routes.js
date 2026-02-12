import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  getGuardianBillingSummary,
  getClientBillingLedger,
  createSessionFromOfficeEvent,
  getBookingEligibility,
  listLearningServices,
  listPaymentMethods,
  createPlaceholderPaymentMethod,
  setDefaultPaymentMethod,
  creditClientTokens,
  getClientTokenBalance,
  listClientTokenLedger,
  listSubscriptionPlans,
  createSubscriptionPlan,
  listClientSubscriptions,
  createClientSubscription,
  updateSubscriptionStatus,
  replenishSubscriptionTokens,
  runSubscriptionRenewals,
  runSubscriptionRenewalsInternal,
  createPaymentIntentPlaceholder,
  recordPaymentAttemptPlaceholder,
  listFrontDeskParticipants
} from '../controllers/learningBilling.controller.js';

const router = express.Router();

const requireInternalRenewalSecret = (req, res, next) => {
  const configured = String(process.env.LEARNING_BILLING_RENEWAL_SECRET || '').trim();
  if (!configured) {
    return res.status(503).json({ error: { message: 'Internal renewal secret is not configured' } });
  }
  const provided = String(req.get('x-learning-renewal-secret') || req.query?.secret || '').trim();
  if (!provided || provided !== configured) {
    return res.status(403).json({ error: { message: 'Forbidden' } });
  }
  next();
};

router.post('/internal/run-renewals', requireInternalRenewalSecret, runSubscriptionRenewalsInternal);

router.use(authenticate);

router.get('/guardian/summary', getGuardianBillingSummary);
router.get('/clients/:clientId/ledger', getClientBillingLedger);
router.get('/clients/:clientId/tokens', getClientTokenBalance);
router.get('/clients/:clientId/token-ledger', listClientTokenLedger);
router.get('/clients/:clientId/subscriptions', listClientSubscriptions);
router.get('/services', listLearningServices);
router.get('/subscription-plans', listSubscriptionPlans);
router.post('/subscription-plans', createSubscriptionPlan);
router.post('/subscriptions', createClientSubscription);
router.post('/subscriptions/:subscriptionId/status', updateSubscriptionStatus);
router.post('/subscriptions/:subscriptionId/replenish', replenishSubscriptionTokens);
router.post('/subscriptions/run-renewals', runSubscriptionRenewals);
router.get('/payment-methods', listPaymentMethods);
router.post('/payment-methods/placeholder', createPlaceholderPaymentMethod);
router.post('/payment-methods/:paymentMethodId/default', setDefaultPaymentMethod);
router.post('/tokens/credit', creditClientTokens);
router.get('/booking-eligibility', getBookingEligibility);
router.post('/sessions/from-office-event', createSessionFromOfficeEvent);
router.post('/payments/intent', createPaymentIntentPlaceholder);
router.post('/payments/:paymentId/attempts', recordPaymentAttemptPlaceholder);
router.get('/front-desk/participants', listFrontDeskParticipants);

export default router;
