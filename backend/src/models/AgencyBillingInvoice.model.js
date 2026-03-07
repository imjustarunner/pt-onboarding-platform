import pool from '../config/database.js';

class AgencyBillingInvoice {
  static async create(invoice) {
    const {
      agencyId,
      periodStart,
      periodEnd,
      schoolsUsed,
      programsUsed,
      adminsUsed,
      activeOnboardeesUsed,
      baseFeeCents,
      extraSchoolsCents,
      extraProgramsCents,
      extraAdminsCents,
      extraOnboardeesCents,
      communicationActualCostCents = 0,
      communicationMarkupCents = 0,
      communicationSubtotalCents = 0,
      totalCents,
      lineItemsJson,
      status = 'draft',
      paymentStatus = 'unpaid',
      paymentMethodId = null,
      invoiceDeliveryMode = 'manual',
      pdfStoragePath = null
    } = invoice;

    const [result] = await pool.execute(
      `INSERT INTO agency_billing_invoices
        (agency_id, period_start, period_end,
         schools_used, programs_used, admins_used, active_onboardees_used,
         base_fee_cents, extra_schools_cents, extra_programs_cents, extra_admins_cents, extra_onboardees_cents,
         communication_actual_cost_cents, communication_markup_cents, communication_subtotal_cents,
         total_cents, line_items_json, status, payment_status, payment_method_id, invoice_delivery_mode, pdf_storage_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agencyId,
        periodStart,
        periodEnd,
        schoolsUsed,
        programsUsed,
        adminsUsed,
        activeOnboardeesUsed,
        baseFeeCents,
        extraSchoolsCents,
        extraProgramsCents,
        extraAdminsCents,
        extraOnboardeesCents,
        communicationActualCostCents,
        communicationMarkupCents,
        communicationSubtotalCents,
        totalCents,
        JSON.stringify(lineItemsJson),
        status,
        paymentStatus,
        paymentMethodId ? Number(paymentMethodId) : null,
        invoiceDeliveryMode || 'manual',
        pdfStoragePath
      ]
    );

    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT * FROM agency_billing_invoices WHERE id = ? LIMIT 1`,
      [parseInt(id, 10)]
    );
    return rows[0] || null;
  }

  static async findByAgencyAndPeriod(agencyId, { periodStart, periodEnd }) {
    const [rows] = await pool.execute(
      `SELECT * FROM agency_billing_invoices
       WHERE agency_id = ? AND period_start = ? AND period_end = ?
       ORDER BY id DESC LIMIT 1`,
      [parseInt(agencyId, 10), periodStart, periodEnd]
    );
    return rows[0] || null;
  }

  static async listByAgency(agencyId, { limit = 50 } = {}) {
    const [rows] = await pool.execute(
      `SELECT * FROM agency_billing_invoices
       WHERE agency_id = ?
       ORDER BY period_start DESC, id DESC
       LIMIT ?`,
      [parseInt(agencyId, 10), parseInt(limit, 10)]
    );
    return rows;
  }

  static async setPdfPath(invoiceId, pdfStoragePath) {
    await pool.execute(
      `UPDATE agency_billing_invoices SET pdf_storage_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [pdfStoragePath, parseInt(invoiceId, 10)]
    );
    return this.findById(invoiceId);
  }

  static async markQboSynced(invoiceId, {
    qboBillId = null,
    qboInvoiceId = null,
    qboPaymentId = null,
    status = 'sent',
    errorMessage = null
  }) {
    await pool.execute(
      `UPDATE agency_billing_invoices
       SET qbo_bill_id = ?,
           qbo_invoice_id = ?,
           qbo_payment_id = ?,
           status = ?,
           error_message = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [qboBillId || null, qboInvoiceId || null, qboPaymentId || null, status, errorMessage || null, parseInt(invoiceId, 10)]
    );
    return this.findById(invoiceId);
  }

  static async markPaymentAttempted(invoiceId) {
    await pool.execute(
      `UPDATE agency_billing_invoices
       SET auto_charge_attempted_at = NOW(),
           payment_status = 'processing',
           status = CASE
             WHEN status IN ('draft', 'sent', 'payment_failed', 'failed') THEN 'processing_payment'
             ELSE status
           END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [parseInt(invoiceId, 10)]
    );
    return this.findById(invoiceId);
  }

  static async markPaid(invoiceId, { paymentMethodId = null, paymentReference = null, qboPaymentId = null } = {}) {
    await pool.execute(
      `UPDATE agency_billing_invoices
       SET payment_status = 'paid',
           status = 'paid',
           payment_method_id = ?,
           payment_reference = ?,
           qbo_payment_id = COALESCE(?, qbo_payment_id),
           paid_at = NOW(),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        paymentMethodId ? Number(paymentMethodId) : null,
        paymentReference || null,
        qboPaymentId || null,
        parseInt(invoiceId, 10)
      ]
    );
    return this.findById(invoiceId);
  }

  static async markPaymentFailed(invoiceId, errorMessage = null) {
    await pool.execute(
      `UPDATE agency_billing_invoices
       SET payment_status = 'failed',
           status = 'payment_failed',
           error_message = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [errorMessage || 'Payment failed', parseInt(invoiceId, 10)]
    );
    return this.findById(invoiceId);
  }

  static async markDeliverySent(invoiceId, errorMessage = null) {
    await pool.execute(
      `UPDATE agency_billing_invoices
       SET invoice_delivery_status = 'sent',
           invoice_sent_at = NOW(),
           error_message = CASE WHEN ? IS NULL THEN error_message ELSE ? END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [errorMessage || null, errorMessage || null, parseInt(invoiceId, 10)]
    );
    return this.findById(invoiceId);
  }

  static async markDeliveryFailed(invoiceId, errorMessage = null) {
    await pool.execute(
      `UPDATE agency_billing_invoices
       SET invoice_delivery_status = 'failed',
           error_message = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [errorMessage || 'Invoice delivery failed', parseInt(invoiceId, 10)]
    );
    return this.findById(invoiceId);
  }
}

export default AgencyBillingInvoice;

