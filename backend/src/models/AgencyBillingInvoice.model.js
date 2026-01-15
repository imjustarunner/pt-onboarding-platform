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
      totalCents,
      lineItemsJson,
      status = 'draft',
      pdfStoragePath = null
    } = invoice;

    const [result] = await pool.execute(
      `INSERT INTO agency_billing_invoices
        (agency_id, period_start, period_end,
         schools_used, programs_used, admins_used, active_onboardees_used,
         base_fee_cents, extra_schools_cents, extra_programs_cents, extra_admins_cents, extra_onboardees_cents, total_cents,
         line_items_json, status, pdf_storage_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        totalCents,
        JSON.stringify(lineItemsJson),
        status,
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

  static async markQboSynced(invoiceId, { qboBillId, status = 'sent', errorMessage = null }) {
    await pool.execute(
      `UPDATE agency_billing_invoices
       SET qbo_bill_id = ?, status = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [qboBillId || null, status, errorMessage || null, parseInt(invoiceId, 10)]
    );
    return this.findById(invoiceId);
  }
}

export default AgencyBillingInvoice;

