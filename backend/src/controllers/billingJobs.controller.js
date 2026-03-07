import pool from '../config/database.js';
import BillingInvoiceService from '../services/billingInvoice.service.js';
import AgencyBillingPaymentService from '../services/agencyBillingPayment.service.js';
import { getPreviousBillingPeriod } from '../utils/billingPeriod.js';

export const runMonthlyBilling = async (req, res, next) => {
  try {
    const period = getPreviousBillingPeriod(new Date());
    const periodStart = period.periodStart.toISOString().slice(0, 10);
    const periodEnd = period.periodEnd.toISOString().slice(0, 10);

    const [rows] = await pool.execute(
      `SELECT id AS agency_id
       FROM agencies
       WHERE is_active = TRUE
         AND LOWER(COALESCE(organization_type, 'agency')) = 'agency'`
    );

    const results = [];
    for (const row of rows) {
      const agencyId = row.agency_id;
      try {
        const invoice = await BillingInvoiceService.generateForAgency(agencyId, {
          period,
          syncToQuickBooks: true
        });
        results.push({ agencyId, invoiceId: invoice.id, status: invoice.status });
      } catch (e) {
        results.push({ agencyId, error: e?.message || 'Failed' });
      }
    }

    res.json({
      period: { periodStart, periodEnd },
      processed: results.length,
      results
    });
  } catch (error) {
    next(error);
  }
};

export const runBillingPaymentReconciliation = async (req, res, next) => {
  try {
    const agencyId = Number(req.body?.agencyId || req.query?.agencyId || 0) || null;
    const limit = Math.max(1, Number(req.body?.limit || req.query?.limit || 100) || 100);
    const results = await AgencyBillingPaymentService.reconcilePendingPayments({
      agencyId,
      limit
    });
    res.json({
      processed: Array.isArray(results) ? results.length : 0,
      results
    });
  } catch (error) {
    next(error);
  }
};

