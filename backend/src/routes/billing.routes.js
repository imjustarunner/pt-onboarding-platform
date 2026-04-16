import express from 'express';
import { authenticate, requireAgencyAccess, requireAgencyAdmin, requireSuperAdmin } from '../middleware/auth.middleware.js';
import stripeConnectRoutes from './stripeConnect.routes.js';
import { getAgencyBillingEstimate, getAgencyAddons } from '../controllers/billing.controller.js';
import {
  disconnectPlatformQuickBooks,
  disconnectQuickBooks,
  getPlatformQuickBooksConnectUrl,
  getPlatformQuickBooksStatus,
  getQuickBooksConnectUrl,
  getQuickBooksStatus,
  quickBooksOAuthCallback
} from '../controllers/quickbooks.controller.js';
import { downloadInvoicePdf, generateAgencyInvoice, listAgencyInvoices, retryAgencyInvoicePayment, sendAgencyInvoice } from '../controllers/billingInvoices.controller.js';
import { billingSettingsValidators, getBillingSettings, getPlatformStripeStatus, updateBillingSettings } from '../controllers/billingSettings.controller.js';
import { runBillingPaymentReconciliation, runMonthlyBilling } from '../controllers/billingJobs.controller.js';
import { agencyPricingOverrideValidators, getAgencyPricing, getPlatformPricing, platformPricingValidators, updateAgencyPricingOverride, updatePlatformPricing } from '../controllers/billingPricing.controller.js';
import {
  createAgencyBillingPaymentMethod,
  getAgencyBillingPaymentMethodSetup,
  listAgencyBillingPaymentMethods,
  setAgencyBillingPaymentMethodDefault
} from '../controllers/agencyBillingPaymentMethods.controller.js';

const router = express.Router();

// Internal monthly billing job (Cloud Scheduler)
router.post('/run-monthly', (req, res, next) => {
  const configured = process.env.BILLING_JOB_SECRET;
  const provided = req.get('x-billing-job-secret');
  if (!configured) {
    return res.status(500).json({ error: { message: 'BILLING_JOB_SECRET not configured' } });
  }
  if (!provided || provided !== configured) {
    return res.status(401).json({ error: { message: 'Unauthorized' } });
  }
  next();
}, runMonthlyBilling);
router.post('/reconcile-payments', (req, res, next) => {
  const configured = process.env.BILLING_JOB_SECRET;
  const provided = req.get('x-billing-job-secret');
  if (!configured) {
    return res.status(500).json({ error: { message: 'BILLING_JOB_SECRET not configured' } });
  }
  if (!provided || provided !== configured) {
    return res.status(401).json({ error: { message: 'Unauthorized' } });
  }
  next();
}, runBillingPaymentReconciliation);

// Platform pricing (superadmin)
// NOTE: must be defined before '/:agencyId/*' routes to avoid route param capture.
router.get('/pricing/default', authenticate, requireSuperAdmin, getPlatformPricing);
router.put('/pricing/default', authenticate, requireSuperAdmin, platformPricingValidators, updatePlatformPricing);
router.get('/platform/quickbooks/connect', authenticate, requireSuperAdmin, getPlatformQuickBooksConnectUrl);
router.get('/platform/quickbooks/status', authenticate, requireSuperAdmin, getPlatformQuickBooksStatus);
router.post('/platform/quickbooks/disconnect', authenticate, requireSuperAdmin, disconnectPlatformQuickBooks);
router.get('/platform/stripe/status', authenticate, requireSuperAdmin, getPlatformStripeStatus);

// Billing addon status (for feature gating)
router.get('/:agencyId/addons', authenticate, requireAgencyAccess, getAgencyAddons);

// Billing estimate + usage breakdown
router.get('/:agencyId/estimate', authenticate, requireAgencyAccess, getAgencyBillingEstimate);

// Billing settings
router.get('/:agencyId/settings', authenticate, requireAgencyAccess, getBillingSettings);
router.put('/:agencyId/settings', authenticate, requireAgencyAdmin, billingSettingsValidators, updateBillingSettings);
router.get('/:agencyId/payment-methods/setup', authenticate, requireAgencyAdmin, getAgencyBillingPaymentMethodSetup);
router.get('/:agencyId/payment-methods', authenticate, requireAgencyAccess, listAgencyBillingPaymentMethods);
router.post('/:agencyId/payment-methods', authenticate, requireAgencyAdmin, createAgencyBillingPaymentMethod);
router.post('/:agencyId/payment-methods/:paymentMethodId/default', authenticate, requireAgencyAdmin, setAgencyBillingPaymentMethodDefault);

// Per-agency pricing (readable by agency access; writable by superadmin)
router.get('/:agencyId/pricing', authenticate, requireAgencyAccess, getAgencyPricing);
router.put('/:agencyId/pricing', authenticate, requireSuperAdmin, agencyPricingOverrideValidators, updateAgencyPricingOverride);

// Invoices
router.get('/:agencyId/invoices', authenticate, requireAgencyAccess, listAgencyInvoices);
router.post('/:agencyId/invoices/generate', authenticate, requireAgencyAdmin, generateAgencyInvoice);
router.get('/invoices/:invoiceId/pdf', authenticate, downloadInvoicePdf);
router.post('/:agencyId/invoices/:invoiceId/retry-payment', authenticate, requireAgencyAdmin, retryAgencyInvoicePayment);
router.post('/:agencyId/invoices/:invoiceId/send', authenticate, requireAgencyAdmin, sendAgencyInvoice);

// QuickBooks Online (per-agency OAuth when merchant mode is agency-managed)
router.get('/:agencyId/quickbooks/connect', authenticate, requireAgencyAdmin, getQuickBooksConnectUrl);
router.get('/:agencyId/quickbooks/status', authenticate, requireAgencyAccess, getQuickBooksStatus);
router.post('/:agencyId/quickbooks/disconnect', authenticate, requireAgencyAdmin, disconnectQuickBooks);

// OAuth callback from Intuit (public, verified via signed state)
router.get('/quickbooks/callback', quickBooksOAuthCallback);

// Stripe Connect per-agency routes (/:agencyId/stripe/*)
router.use('/:agencyId/stripe', stripeConnectRoutes);

export default router;
