import StorageService from '../services/storage.service.js';
import BillingInvoiceService from '../services/billingInvoice.service.js';
import AgencyBillingInvoice from '../models/AgencyBillingInvoice.model.js';
import User from '../models/User.model.js';

async function ensureInvoiceAccess(req, invoice) {
  if (!invoice) return false;
  if (req.user?.role === 'super_admin') return true;
  const agencies = await User.getAgencies(req.user.id);
  const ids = agencies.map(a => a.id);
  return ids.includes(parseInt(invoice.agency_id, 10));
}

export const listAgencyInvoices = async (req, res, next) => {
  try {
    const { agencyId } = req.params;
    const invoices = await AgencyBillingInvoice.listByAgency(agencyId, { limit: 100 });
    res.json(invoices);
  } catch (error) {
    next(error);
  }
};

export const generateAgencyInvoice = async (req, res, next) => {
  try {
    const { agencyId } = req.params;
    const invoice = await BillingInvoiceService.generateForAgency(agencyId, {
      syncToQuickBooks: req.query.syncToQuickBooks !== 'false'
    });
    res.status(201).json(invoice);
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

