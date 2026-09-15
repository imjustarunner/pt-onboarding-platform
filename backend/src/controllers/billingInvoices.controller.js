import StorageService from '../services/storage.service.js';
import BillingInvoiceService from '../services/billingInvoice.service.js';
import AgencyBillingInvoice from '../models/AgencyBillingInvoice.model.js';
import AgencyBillingPaymentService from '../services/agencyBillingPayment.service.js';
import QuickBooksBillingSyncService from '../services/quickbooksBillingSync.service.js';
import User from '../models/User.model.js';
import pool from '../config/database.js';
import { createBusinessLifecycleService } from '../services/businessLifecycle.service.js';

function hasManagementTerms(invoice) {
  const snapshot = typeof invoice?.line_items_json === 'string' ? JSON.parse(invoice.line_items_json) : invoice?.line_items_json;
  return !!snapshot?.businessAgreement;
}

async function ensureInvoiceAccess(req, invoice) {
  if (!invoice) return false;
  if (req.user?.role === 'super_admin') return true;
  if (hasManagementTerms(invoice) && req.user?.role !== 'admin') return false;
  const agencies = await User.getAgencies(req.user.id);
  const ids = agencies.map(a => a.id);
  return ids.includes(parseInt(invoice.agency_id, 10));
}

export const listAgencyInvoices = async (req, res, next) => {
  try {
    const { agencyId } = req.params;
    const invoices = await AgencyBillingInvoice.listByAgency(agencyId, { limit: 100 });
    if (!['super_admin', 'admin'].includes(req.user?.role) && invoices.some(hasManagementTerms)) return res.status(403).json({ error: { message: 'Company administrator access is required to review management invoices.' } });
    await AgencyBillingPaymentService.reconcilePendingPayments({ agencyId: Number(agencyId || 0), limit: 25 });
    res.json(await AgencyBillingInvoice.listByAgency(agencyId, { limit: 100 }));
  } catch (error) {
    next(error);
  }
};

export const generateAgencyInvoice = async (req, res, next) => {
  try {
    const { agencyId } = req.params;
    if (!['super_admin', 'admin'].includes(req.user?.role)) {
      const lifecycle = await createBusinessLifecycleService(pool).billingState(Number(agencyId));
      if (lifecycle.agreements.length) return res.status(403).json({ error: { message: 'Company administrator access is required to generate management invoices.' } });
    }
    const invoice = await BillingInvoiceService.generateForAgency(agencyId, {
      syncToQuickBooks: req.query.syncToQuickBooks !== 'false'
    });
    res.status(201).json(invoice);
  } catch (error) {
    next(error);
  }
};

export const retryAgencyInvoicePayment = async (req, res, next) => {
  try {
    const invoiceId = Number(req.params.invoiceId || 0);
    if (!invoiceId) return res.status(400).json({ error: { message: 'Invalid invoiceId' } });
    const invoice = await AgencyBillingInvoice.findById(invoiceId);
    if (!invoice) return res.status(404).json({ error: { message: 'Invoice not found' } });
    const hasAccess = await ensureInvoiceAccess(req, invoice);
    if (!hasAccess) return res.status(403).json({ error: { message: 'Access denied' } });
    const result = await AgencyBillingPaymentService.attemptAutoPay(invoiceId);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const sendAgencyInvoice = async (req, res, next) => {
  try {
    const invoiceId = Number(req.params.invoiceId || 0);
    if (!invoiceId) return res.status(400).json({ error: { message: 'Invalid invoiceId' } });
    const invoice = await AgencyBillingInvoice.findById(invoiceId);
    if (!invoice) return res.status(404).json({ error: { message: 'Invoice not found' } });
    const hasAccess = await ensureInvoiceAccess(req, invoice);
    if (!hasAccess) return res.status(403).json({ error: { message: 'Access denied' } });
    const result = await QuickBooksBillingSyncService.sendInvoiceToQuickBooks(invoiceId, {
      sendTo: req.body?.sendTo || null
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const downloadInvoicePdf = async (req, res, next) => {
  try {
    const { invoiceId } = req.params;
    const invoice = await AgencyBillingInvoice.findById(invoiceId);
    if (!invoice) return res.status(404).json({ error: { message: 'Invoice not found' } });

    const hasAccess = await ensureInvoiceAccess(req, invoice);
    if (!hasAccess) return res.status(403).json({ error: { message: 'Access denied' } });

    if (!invoice.pdf_storage_path) {
      return res.status(404).json({ error: { message: 'Invoice PDF not available' } });
    }

    const signedUrl = await StorageService.getSignedUrl(invoice.pdf_storage_path, 15);
    res.redirect(302, signedUrl);
  } catch (error) {
    next(error);
  }
};
