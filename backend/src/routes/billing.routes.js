import express from 'express';
import { authenticate, requireAgencyAccess, requireAgencyAdmin } from '../middleware/auth.middleware.js';
import { getAgencyBillingEstimate } from '../controllers/billing.controller.js';
import { disconnectQuickBooks, getQuickBooksConnectUrl, getQuickBooksStatus, quickBooksOAuthCallback } from '../controllers/quickbooks.controller.js';
import { downloadInvoicePdf, generateAgencyInvoice, listAgencyInvoices } from '../controllers/billingInvoices.controller.js';
import { billingSettingsValidators, getBillingSettings, updateBillingSettings } from '../controllers/billingSettings.controller.js';
import { runMonthlyBilling } from '../controllers/billingJobs.controller.js';

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

// Billing estimate + usage breakdown
router.get('/:agencyId/estimate', authenticate, requireAgencyAccess, getAgencyBillingEstimate);

// Billing settings
router.get('/:agencyId/settings', authenticate, requireAgencyAccess, getBillingSettings);
router.put('/:agencyId/settings', authenticate, requireAgencyAdmin, billingSettingsValidators, updateBillingSettings);

// Invoices
router.get('/:agencyId/invoices', authenticate, requireAgencyAccess, listAgencyInvoices);
router.post('/:agencyId/invoices/generate', authenticate, requireAgencyAdmin, generateAgencyInvoice);
router.get('/invoices/:invoiceId/pdf', authenticate, downloadInvoicePdf);

// QuickBooks Online (per-agency OAuth)
router.get('/:agencyId/quickbooks/connect', authenticate, requireAgencyAdmin, getQuickBooksConnectUrl);
router.get('/:agencyId/quickbooks/status', authenticate, requireAgencyAccess, getQuickBooksStatus);
router.post('/:agencyId/quickbooks/disconnect', authenticate, requireAgencyAdmin, disconnectQuickBooks);

// OAuth callback from Intuit (public, verified via signed state)
router.get('/quickbooks/callback', quickBooksOAuthCallback);

export default router;

