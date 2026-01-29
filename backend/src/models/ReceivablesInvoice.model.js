import pool from '../config/database.js';

class ReceivablesInvoice {
  static async create({ agencyId, createdByUserId = null, dueDate = null, status = 'draft', collectionsStage = null, externalFlag = 0, externalNotes = null }) {
    const [result] = await pool.execute(
      `INSERT INTO agency_receivables_invoices
       (agency_id, status, collections_stage, external_flag, external_notes, due_date, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [agencyId, status, collectionsStage ? String(collectionsStage) : null, externalFlag ? 1 : 0, externalNotes ? String(externalNotes) : null, dueDate || null, createdByUserId]
    );
    return result.insertId;
  }

  static async listByAgency({ agencyId, limit = 100, offset = 0 }) {
    const lim = Math.max(0, Math.min(500, parseInt(limit, 10) || 100));
    const off = Math.max(0, parseInt(offset, 10) || 0);
    const [rows] = await pool.execute(
      `SELECT i.*
       FROM agency_receivables_invoices i
       WHERE i.agency_id = ?
       ORDER BY i.created_at DESC, i.id DESC
       LIMIT ${lim} OFFSET ${off}`,
      [agencyId]
    );
    return rows || [];
  }

  static async patch({ invoiceId, agencyId, status = null, collectionsStage = null, externalFlag = null, externalNotes = null, dueDate = null }) {
    const sets = [];
    const params = [];
    if (status !== null && status !== undefined) { sets.push('status = ?'); params.push(String(status)); }
    if (collectionsStage !== null && collectionsStage !== undefined) { sets.push('collections_stage = ?'); params.push(collectionsStage ? String(collectionsStage) : null); }
    if (externalFlag !== null && externalFlag !== undefined) { sets.push('external_flag = ?'); params.push(externalFlag ? 1 : 0); }
    if (externalNotes !== null && externalNotes !== undefined) { sets.push('external_notes = ?'); params.push(externalNotes ? String(externalNotes) : null); }
    if (dueDate !== null && dueDate !== undefined) { sets.push('due_date = ?'); params.push(dueDate ? String(dueDate).slice(0, 10) : null); }
    if (!sets.length) return 0;
    params.push(invoiceId, agencyId);
    const [result] = await pool.execute(
      `UPDATE agency_receivables_invoices
       SET ${sets.join(', ')}
       WHERE id = ? AND agency_id = ?`,
      params
    );
    return result.affectedRows || 0;
  }
}

export default ReceivablesInvoice;

