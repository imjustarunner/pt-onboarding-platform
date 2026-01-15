import pool from '../config/database.js';
import BillingInvoiceService from '../services/billingInvoice.service.js';
import { getPreviousBillingPeriod } from '../utils/billingPeriod.js';

export const runMonthlyBilling = async (req, res, next) => {
  try {
    const period = getPreviousBillingPeriod(new Date());
    const periodStart = period.periodStart.toISOString().slice(0, 10);
    const periodEnd = period.periodEnd.toISOString().slice(0, 10);

    const [rows] = await pool.execute(
      `SELECT agency_id FROM agency_billing_accounts WHERE is_qbo_connected = TRUE`
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

