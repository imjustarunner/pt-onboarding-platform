import pool from '../config/database.js';

class ReceivablesInvoiceItem {
  static async bulkInsert(items) {
    if (!items || items.length === 0) return 0;
    const values = [];
    for (const it of items) {
      values.push([
        it.invoiceId,
        it.reportRowId || null,
        it.description || null,
        it.serviceDateStart || null,
        it.serviceDateEnd || null,
        Number(it.amount || 0)
      ]);
    }
    const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?)').join(',');
    const flat = values.flat();
    const [result] = await pool.execute(
      `INSERT INTO agency_receivables_invoice_items
       (invoice_id, report_row_id, description, service_date_start, service_date_end, amount)
       VALUES ${placeholders}`,
      flat
    );
    return result.affectedRows || 0;
  }

  static async listByInvoice({ invoiceId }) {
    const [rows] = await pool.execute(
      `SELECT * FROM agency_receivables_invoice_items WHERE invoice_id = ? ORDER BY id ASC`,
      [invoiceId]
    );
    return rows || [];
  }
}

export default ReceivablesInvoiceItem;

